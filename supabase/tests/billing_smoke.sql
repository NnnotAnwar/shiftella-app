-- =============================================================================
-- BILLING SMOKE TEST — trial seed, effective plan, hard limits, gifts, RLS.
-- Read-only in effect: everything runs in one transaction that is rolled back.
-- Run against a local/preprod database (never prod data you can't lose), after
-- the billing migration:
--   • psql "$PREPROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing_smoke.sql
--   • or paste into the SQL editor.
-- Any broken rule raises "BILLING FAIL: …". Success ends with "BILLING SMOKE OK".
-- =============================================================================
BEGIN;

DO $$
DECLARE
  org uuid;
  other_member uuid;
  super uuid;
  u uuid;
  m uuid;
  i int;
  n int;
  plan text;
  fails text := '';
  s public.subscriptions;
BEGIN
  -- A throw-away organization (rolled back) — the seed trigger starts its trial.
  INSERT INTO public.organizations (name, slug) VALUES ('Billing smoke', 'billing-smoke-' || substr(md5(random()::text), 1, 8))
  RETURNING id INTO org;
  SELECT * INTO s FROM public.subscriptions WHERE organization_id = org;
  IF NOT FOUND THEN fails := fails || ' seed(no row)';
  ELSE
    IF s.plan <> 'business' OR s.status <> 'trialing' OR s.source <> 'trial' THEN fails := fails || ' seed(not a Business trial)'; END IF;
    IF s.trial_ends_at < now() + interval '29 days' OR s.trial_ends_at > now() + interval '31 days' THEN fails := fails || ' seed(trial not 30 days)'; END IF;
  END IF;
  IF public.org_plan(org) <> 'business' THEN fails := fails || ' trial(plan)'; END IF;

  -- Existing organizations are grandfathered.
  SELECT count(*) INTO n FROM public.organizations o
   WHERE o.id <> org AND NOT EXISTS (SELECT 1 FROM public.subscriptions x WHERE x.organization_id = o.id);
  IF n > 0 THEN fails := fails || ' backfill(missing rows)'; END IF;

  -- ---- Trial over → Free: 1 location, 5 members ----------------------------
  UPDATE public.subscriptions SET trial_ends_at = now() - interval '1 second' WHERE organization_id = org;
  IF public.org_plan(org) <> 'free' THEN fails := fails || ' expired-trial(not free)'; END IF;

  INSERT INTO public.locations (organization_id, name) VALUES (org, 'Smoke 1');
  BEGIN
    INSERT INTO public.locations (organization_id, name) VALUES (org, 'Smoke 2');
    fails := fails || ' free(2nd location allowed)';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Members arrive through handle_new_user (server-set app metadata = an invite).
  FOR i IN 1..6 LOOP
    BEGIN
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
      VALUES (gen_random_uuid(), 'billing-smoke-' || i || '-' || substr(md5(random()::text), 1, 6) || '@example.invalid',
              jsonb_build_object('organization_id', org, 'role', 'Employee'), '{}'::jsonb, 'authenticated', 'authenticated');
      IF i = 6 THEN fails := fails || ' free(6th member allowed)'; END IF;
    EXCEPTION WHEN check_violation THEN
      IF i < 6 THEN fails := fails || ' free(member ' || i || ' refused)'; END IF;
    END;
  END LOOP;
  SELECT id INTO m FROM public.profiles WHERE organization_id = org LIMIT 1;
  -- People we act as below (looked up now, before RLS narrows what we see).
  SELECT id INTO other_member FROM public.profiles WHERE organization_id <> org AND role <> 'Superadmin' LIMIT 1;
  SELECT id INTO super FROM public.profiles WHERE role = 'Superadmin' LIMIT 1;

  -- ---- Team: 15 members / 3 locations, plan change is logged ---------------
  UPDATE public.subscriptions
     SET plan = 'team', status = 'active', source = 'stripe', stripe_subscription_id = 'sub_smoke_' || substr(md5(random()::text), 1, 8), "interval" = 'month'
   WHERE organization_id = org;
  IF public.org_plan(org) <> 'team' THEN fails := fails || ' team(plan)'; END IF;
  SELECT count(*) INTO n FROM public.shift_audit_log WHERE organization_id = org AND action = 'plan_changed';
  IF n = 0 THEN fails := fails || ' audit(plan_changed missing)'; END IF;
  INSERT INTO public.locations (organization_id, name) VALUES (org, 'Smoke 2'), (org, 'Smoke 3');
  BEGIN
    INSERT INTO public.locations (organization_id, name) VALUES (org, 'Smoke 4');
    fails := fails || ' team(4th location allowed)';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF public.plan_member_limit('team') <> 15 OR public.plan_location_limit('team') <> 3 THEN fails := fails || ' team(limits)'; END IF;
  IF public.plan_member_limit('business') IS NOT NULL THEN fails := fails || ' business(member limit)'; END IF;

  -- Canceled → Free again (data kept: the 3 locations stay, a 4th is refused).
  UPDATE public.subscriptions SET status = 'canceled' WHERE organization_id = org;
  IF public.org_plan(org) <> 'free' THEN fails := fails || ' canceled(not free)'; END IF;
  SELECT count(*) INTO n FROM public.locations WHERE organization_id = org AND archived_at IS NULL;
  IF n <> 3 THEN fails := fails || ' canceled(locations lost)'; END IF;

  -- ---- RLS: members read their own row, never write it ----------------------
  PERFORM set_config('role', 'authenticated', true);
  IF m IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM public.subscriptions WHERE organization_id = org;
    IF n <> 1 THEN fails := fails || ' rls(own row hidden)'; END IF;
    BEGIN
      UPDATE public.subscriptions SET plan = 'business', status = 'active' WHERE organization_id = org;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN fails := fails || ' rls(member wrote row)'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.admin_set_org_plan(org, 'business', NULL, 'nope');
      fails := fails || ' grant(non-superadmin allowed)';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END IF;

  IF other_member IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', other_member, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM public.subscriptions WHERE organization_id = org;
    IF n > 0 THEN fails := fails || ' rls(other org row visible)'; END IF;
    BEGIN
      PERFORM public.org_usage(org);
      fails := fails || ' rls(other org usage visible)';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END IF;

  -- ---- Superadmin gift wins over the canceled Stripe subscription ------------
  IF super IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
    PERFORM public.admin_set_org_plan(org, 'business', now() + interval '10 days', 'smoke');
    PERFORM set_config('role', 'postgres', true);
    IF public.org_plan(org) <> 'business' THEN fails := fails || ' grant(not business)'; END IF;
    -- A Stripe update (as the webhook writes it) doesn't touch the grant.
    UPDATE public.subscriptions SET plan = 'team', status = 'canceled' WHERE organization_id = org;
    IF public.org_plan(org) <> 'business' THEN fails := fails || ' grant(overwritten by stripe)'; END IF;
    INSERT INTO public.locations (organization_id, name) VALUES (org, 'Smoke 4');  -- unlimited while granted
    SELECT count(*) INTO n FROM public.shift_audit_log WHERE organization_id = org AND action = 'plan_granted';
    IF n = 0 THEN fails := fails || ' audit(plan_granted missing)'; END IF;
    -- Expired grant → back to the base row (canceled → free).
    UPDATE public.subscriptions SET manual_until = now() - interval '1 second' WHERE organization_id = org;
    IF public.org_plan(org) <> 'free' THEN fails := fails || ' grant(expired still active)'; END IF;
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.admin_clear_org_plan(org);
  ELSE
    RAISE NOTICE 'billing smoke: no Superadmin profile — gift checks skipped';
  END IF;

  PERFORM set_config('role', 'postgres', true);
  IF fails <> '' THEN RAISE EXCEPTION 'BILLING FAIL:%', fails; END IF;
  RAISE NOTICE 'BILLING SMOKE OK';
END $$;

ROLLBACK;
