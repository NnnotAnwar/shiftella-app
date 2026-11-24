-- =============================================================================
-- PLAN GATES SMOKE TEST — server-side feature gates, Superadmin invite bypass,
-- org_plan() privileges (migration 20261124120000_plan_feature_gates).
-- Read-only in effect: everything runs in one transaction that is rolled back.
-- Run against a local/preprod database (never prod data you can't lose):
--   • psql "$PREPROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_gates_smoke.sql
--   • or paste into the SQL editor.
-- Acting as a member = setting their JWT claims; the session stays `postgres`
-- (RLS off), so what is tested is the gate itself, not the policies.
-- Any broken rule raises "PLAN GATES FAIL: …". Success ends with "PLAN GATES SMOKE OK".
-- =============================================================================
BEGIN;

-- Run one statement; 'ok' or the error message.
CREATE FUNCTION pg_temp.try_sql(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- A throw-away organization with one location, a manager and an employee
-- (members arrive through handle_new_user, as invites do).
CREATE FUNCTION pg_temp.make_org(p_name text, OUT org uuid, OUT loc uuid, OUT mgr uuid, OUT emp uuid, OUT shift uuid)
LANGUAGE plpgsql AS $$
DECLARE tag text := substr(md5(random()::text), 1, 8);
BEGIN
  INSERT INTO public.organizations (name, slug) VALUES (p_name, 'plan-gates-' || tag) RETURNING id INTO org;
  INSERT INTO public.locations (organization_id, name) VALUES (org, 'Gate HQ') RETURNING id INTO loc;
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES (gen_random_uuid(), 'gates-mgr-' || tag || '@example.invalid',
          jsonb_build_object('organization_id', org, 'role', 'Manager'), '{}'::jsonb, 'authenticated', 'authenticated')
  RETURNING id INTO mgr;
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES (gen_random_uuid(), 'gates-emp-' || tag || '@example.invalid',
          jsonb_build_object('organization_id', org, 'role', 'Employee'), '{}'::jsonb, 'authenticated', 'authenticated')
  RETURNING id INTO emp;
  -- An upcoming published shift the employee can offer for a swap.
  INSERT INTO public.scheduled_shifts (user_id, organization_id, location_id, starts_at, ends_at, published)
  VALUES (emp, org, loc, now() + interval '2 days', now() + interval '2 days 8 hours', true)
  RETURNING id INTO shift;
END $$;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN '{}' ELSE json_build_object('sub', p_user, 'role', 'authenticated')::text END, true);
$$;

-- Every gated write, for one organization: the features in `p_allowed` must
-- succeed, the others must fail with PLAN_FEATURE:<feature>. Returns '' or
-- the list of what went wrong.
CREATE FUNCTION pg_temp.check_writes(p_org uuid, p_loc uuid, p_mgr uuid, p_emp uuid, p_shift uuid, p_label text, p_allowed text[])
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  fails text := '';
  r text;
  f text;
  stmt text;
BEGIN
  FOREACH f IN ARRAY ARRAY['templates', 'openShifts', 'wages', 'coverage', 'swaps'] LOOP
    IF f = 'swaps' THEN
      PERFORM pg_temp.act_as(p_emp);
      stmt := format('SELECT public.offer_shift_swap(%L)', p_shift);
    ELSE
      PERFORM pg_temp.act_as(p_mgr);
      stmt := CASE f
        WHEN 'templates' THEN format(
          'INSERT INTO public.shift_templates (organization_id, name, start_time, end_time, created_by) VALUES (%L, ''Morning'', ''08:00'', ''16:00'', %L)', p_org, p_mgr)
        WHEN 'openShifts' THEN format(
          'INSERT INTO public.open_shifts (organization_id, location_id, starts_at, ends_at, created_by) VALUES (%L, %L, now() + interval ''3 days'', now() + interval ''3 days 6 hours'', %L)', p_org, p_loc, p_mgr)
        WHEN 'wages' THEN format(
          'INSERT INTO public.member_wages (organization_id, user_id, hourly_rate, created_by) VALUES (%L, %L, 200, %L)', p_org, p_emp, p_mgr)
        WHEN 'coverage' THEN format(
          'INSERT INTO public.coverage_requirements (organization_id, location_id, day_of_week, min_headcount) VALUES (%L, %L, 1, 2)', p_org, p_loc)
      END;
    END IF;
    r := pg_temp.try_sql(stmt);
    IF f = ANY (p_allowed) THEN
      IF r <> 'ok' THEN fails := fails || format(' %s(%s refused: %s)', p_label, f, r); END IF;
    ELSIF r NOT LIKE 'PLAN_FEATURE:' || f || ':%' THEN
      fails := fails || format(' %s(%s not gated: %s)', p_label, f, r);
    END IF;
  END LOOP;
  PERFORM pg_temp.act_as(NULL);
  RETURN fails;
END $$;

DO $$
DECLARE
  fr record;      -- Free organization
  tm record;      -- Team organization
  bz record;      -- Business organization
  super uuid;
  fails text := '';
  r text;
  n int;
  i int;
  v_tpl uuid;
  v_swap uuid;
  v_open uuid;
BEGIN
  SELECT * INTO fr FROM pg_temp.make_org('Gates Free');
  SELECT * INTO tm FROM pg_temp.make_org('Gates Team');
  SELECT * INTO bz FROM pg_temp.make_org('Gates Business');
  -- Free: the trial ran out. Team: a paid Team plan. Business: the trial.
  UPDATE public.subscriptions SET trial_ends_at = now() - interval '1 second' WHERE organization_id = fr.org;
  UPDATE public.subscriptions SET plan = 'team', status = 'active', source = 'manual' WHERE organization_id = tm.org;
  IF public.org_plan(fr.org) <> 'free' OR public.org_plan(tm.org) <> 'team' OR public.org_plan(bz.org) <> 'business' THEN
    RAISE EXCEPTION 'PLAN GATES FAIL: setup (plans %, %, %)', public.org_plan(fr.org), public.org_plan(tm.org), public.org_plan(bz.org);
  END IF;

  -- ---- Mapping mirrors plans.ts ----------------------------------------------
  IF public.plan_has_feature('free', 'templates') OR NOT public.plan_has_feature('team', 'templates')
     OR public.plan_has_feature('team', 'coverage') OR NOT public.plan_has_feature('business', 'coverage')
     OR public.plan_has_feature('business', 'nonsense') THEN
    fails := fails || ' mapping';
  END IF;

  -- ---- Writes per plan -------------------------------------------------------
  fails := fails || pg_temp.check_writes(fr.org, fr.loc, fr.mgr, fr.emp, fr.shift, 'free', ARRAY[]::text[]);
  fails := fails || pg_temp.check_writes(tm.org, tm.loc, tm.mgr, tm.emp, tm.shift, 'team', ARRAY['templates', 'openShifts', 'wages', 'swaps']);
  fails := fails || pg_temp.check_writes(bz.org, bz.loc, bz.mgr, bz.emp, bz.shift, 'business', ARRAY['templates', 'openShifts', 'wages', 'coverage', 'swaps']);

  -- Nothing was written for Free.
  SELECT (SELECT count(*) FROM public.shift_templates WHERE organization_id = fr.org)
       + (SELECT count(*) FROM public.open_shifts WHERE organization_id = fr.org)
       + (SELECT count(*) FROM public.member_wages WHERE organization_id = fr.org)
       + (SELECT count(*) FROM public.coverage_requirements WHERE organization_id = fr.org)
       + (SELECT count(*) FROM public.shift_swaps WHERE organization_id = fr.org) INTO n;
  IF n <> 0 THEN fails := fails || ' free(rows written)'; END IF;

  -- ---- Business → Free: data stays, read-only; closing still works -----------
  SELECT id INTO v_tpl FROM public.shift_templates WHERE organization_id = bz.org LIMIT 1;
  SELECT id INTO v_swap FROM public.shift_swaps WHERE organization_id = bz.org LIMIT 1;
  SELECT id INTO v_open FROM public.open_shifts WHERE organization_id = bz.org LIMIT 1;
  -- A claim while still on Business (released again after the downgrade).
  PERFORM pg_temp.act_as(bz.emp);
  UPDATE public.open_shifts SET claimed_by = bz.emp, claimed_at = now() WHERE id = v_open;
  PERFORM pg_temp.act_as(NULL);

  UPDATE public.subscriptions SET status = 'canceled' WHERE organization_id = bz.org;
  IF public.org_plan(bz.org) <> 'free' THEN fails := fails || ' downgrade(not free)'; END IF;
  SELECT count(*) INTO n FROM public.coverage_requirements WHERE organization_id = bz.org;
  IF n <> 1 THEN fails := fails || ' downgrade(coverage lost)'; END IF;
  SELECT count(*) INTO n FROM public.member_wages WHERE organization_id = bz.org;
  IF n <> 1 THEN fails := fails || ' downgrade(wage lost)'; END IF;

  PERFORM pg_temp.act_as(bz.mgr);
  r := pg_temp.try_sql(format('UPDATE public.shift_templates SET name = ''Evening'' WHERE id = %L', v_tpl));
  IF r NOT LIKE 'PLAN_FEATURE:templates:%' THEN fails := fails || ' downgrade(template edit: ' || r || ')'; END IF;
  r := pg_temp.try_sql(format('UPDATE public.member_wages SET hourly_rate = 999 WHERE user_id = %L', bz.emp));
  IF r NOT LIKE 'PLAN_FEATURE:wages:%' THEN fails := fails || ' downgrade(wage edit: ' || r || ')'; END IF;
  r := pg_temp.try_sql(format('DELETE FROM public.shift_templates WHERE id = %L', v_tpl));
  IF r <> 'ok' THEN fails := fails || ' downgrade(template delete: ' || r || ')'; END IF;

  PERFORM pg_temp.act_as(bz.emp);
  r := pg_temp.try_sql(format('UPDATE public.open_shifts SET claimed_by = NULL, claimed_at = NULL WHERE id = %L', v_open));
  IF r <> 'ok' THEN fails := fails || ' downgrade(release: ' || r || ')'; END IF;
  r := pg_temp.try_sql(format('UPDATE public.open_shifts SET claimed_by = %L, claimed_at = now() WHERE id = %L', bz.emp, v_open));
  IF r NOT LIKE 'PLAN_FEATURE:openShifts:%' THEN fails := fails || ' downgrade(claim: ' || r || ')'; END IF;
  r := pg_temp.try_sql(format('SELECT public.withdraw_shift_swap(%L)', v_swap));
  IF r <> 'ok' THEN fails := fails || ' downgrade(withdraw swap: ' || r || ')'; END IF;
  PERFORM pg_temp.act_as(NULL);

  -- Trusted writes (no signed-in user: service role, cron) pass.
  r := pg_temp.try_sql(format('UPDATE public.member_wages SET hourly_rate = 210 WHERE user_id = %L', bz.emp));
  IF r <> 'ok' THEN fails := fails || ' trusted(write refused: ' || r || ')'; END IF;

  -- ---- Superadmin bypasses the gates ------------------------------------------
  SELECT id INTO super FROM public.profiles WHERE role = 'Superadmin' LIMIT 1;
  IF super IS NOT NULL THEN
    PERFORM pg_temp.act_as(super);
    r := pg_temp.try_sql(format(
      'INSERT INTO public.coverage_requirements (organization_id, location_id, day_of_week, min_headcount) VALUES (%L, %L, 2, 1)', fr.org, fr.loc));
    IF r <> 'ok' THEN fails := fails || ' superadmin(refused: ' || r || ')'; END IF;
    PERFORM pg_temp.act_as(NULL);
  ELSE
    RAISE NOTICE 'plan gates smoke: no Superadmin profile — bypass check skipped';
  END IF;

  -- ---- Superadmin invite past the member limit (Free = 5) ----------------------
  FOR i IN 1..3 LOOP   -- manager + employee + 3 = 5
    INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), 'gates-fill-' || i || '-' || substr(md5(random()::text), 1, 6) || '@example.invalid',
            jsonb_build_object('organization_id', fr.org, 'role', 'Employee'), '{}'::jsonb, 'authenticated', 'authenticated');
  END LOOP;
  -- An admin's invite: refused at the limit.
  INSERT INTO public.pending_invites (email, organization_id, role) VALUES ('gates-sixth-a@example.invalid', fr.org, 'Employee');
  r := pg_temp.try_sql(format(
    'INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES (%L, ''gates-sixth-a@example.invalid'', ''{}''::jsonb, ''authenticated'', ''authenticated'')',
    gen_random_uuid()));
  IF r NOT LIKE 'PLAN_LIMIT_MEMBERS%' THEN fails := fails || ' invite(limit not enforced: ' || r || ')'; END IF;
  -- A Superadmin's invite (bypass_limits): accepted, and the record is consumed.
  INSERT INTO public.pending_invites (email, organization_id, role, bypass_limits) VALUES ('gates-sixth-b@example.invalid', fr.org, 'Employee', true);
  r := pg_temp.try_sql(format(
    'INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES (%L, ''gates-sixth-b@example.invalid'', ''{}''::jsonb, ''authenticated'', ''authenticated'')',
    gen_random_uuid()));
  IF r <> 'ok' THEN fails := fails || ' invite(superadmin bypass refused: ' || r || ')'; END IF;
  IF EXISTS (SELECT 1 FROM public.pending_invites WHERE email = 'gates-sixth-b@example.invalid') THEN
    fails := fails || ' invite(pending row kept)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'gates-sixth-b@example.invalid' AND organization_id = fr.org) THEN
    fails := fails || ' invite(profile missing)';
  END IF;

  -- ---- org_plan() is internal; clients can't touch pending_invites ---------------
  IF has_function_privilege('authenticated', 'public.org_plan(uuid)', 'EXECUTE') THEN fails := fails || ' org_plan(authenticated may call)'; END IF;
  IF has_function_privilege('anon', 'public.org_plan(uuid)', 'EXECUTE') THEN fails := fails || ' org_plan(anon may call)'; END IF;
  IF NOT has_function_privilege('service_role', 'public.org_plan(uuid)', 'EXECUTE') THEN fails := fails || ' org_plan(service_role lost it)'; END IF;
  IF has_function_privilege('authenticated', 'public.org_has_feature(uuid, text)', 'EXECUTE') THEN fails := fails || ' org_has_feature(authenticated may call)'; END IF;
  IF has_table_privilege('authenticated', 'public.pending_invites', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pending_invites', 'UPDATE') THEN
    fails := fails || ' pending_invites(client writable)';
  END IF;

  IF fails <> '' THEN RAISE EXCEPTION 'PLAN GATES FAIL:%', fails; END IF;
  RAISE NOTICE 'PLAN GATES SMOKE OK';
END $$;

ROLLBACK;
