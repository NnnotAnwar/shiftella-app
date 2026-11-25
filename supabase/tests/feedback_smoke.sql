-- =============================================================================
-- FEEDBACK SMOKE TEST — app_feedback RLS, trusted fields, owner alert, limits.
-- Read-only in effect: one transaction, rolled back (the webhook's pg_net
-- request is rolled back with it, so nobody is notified).
-- Run against preprod: paste into the SQL editor / MCP execute_sql, or
--   psql "$PREPROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/feedback_smoke.sql
-- Any broken rule raises "FEEDBACK FAIL: …". Success ends with "FEEDBACK SMOKE OK".
-- =============================================================================
BEGIN;

DO $$
DECLARE
  emp uuid; other uuid; sa uuid; emp_org uuid;
  fb uuid; n int; r record;
  fails text := '';
BEGIN
  SELECT id, organization_id INTO emp, emp_org FROM public.profiles
   WHERE role <> 'Superadmin' AND organization_id IS NOT NULL LIMIT 1;
  SELECT id INTO other FROM public.profiles WHERE role <> 'Superadmin' AND id <> emp LIMIT 1;
  SELECT id INTO sa FROM public.profiles WHERE role = 'Superadmin' AND organization_id IS NOT NULL LIMIT 1;
  IF emp IS NULL OR other IS NULL THEN RAISE EXCEPTION 'FEEDBACK SKIP: need two members'; END IF;

  PERFORM set_config('role', 'authenticated', true);

  -- ---- A member sends feedback; forged fields are ignored ------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  INSERT INTO public.app_feedback (kind, message, may_contact, route, app_version, language, user_agent)
  VALUES ('bug', '  The rota is slow  ', true, '/schedule', '1.13.0', 'cs', repeat('x', 600))
  RETURNING id INTO fb;
  SELECT * INTO r FROM public.app_feedback WHERE id = fb;
  IF r.user_id <> emp THEN fails := fails || ' user_id'; END IF;
  IF r.organization_id IS DISTINCT FROM emp_org THEN fails := fails || ' organization_id'; END IF;
  IF r.status <> 'new' THEN fails := fails || ' status'; END IF;
  IF r.message <> 'The rota is slow' THEN fails := fails || ' message(trim)'; END IF;
  IF char_length(r.user_agent) <> 400 THEN fails := fails || ' user_agent(trim)'; END IF;
  IF r.notified_at IS NULL THEN fails := fails || ' notified_at(first)'; END IF;

  -- A second message within the hour is stored but alerts no one.
  INSERT INTO public.app_feedback (kind, message) VALUES ('idea', 'Dark mode please') RETURNING id INTO fb;
  IF (SELECT notified_at FROM public.app_feedback WHERE id = fb) IS NOT NULL THEN fails := fails || ' rate_limit(alert)'; END IF;

  -- Members can't change status (no policy) or other columns (no grant).
  UPDATE public.app_feedback SET status = 'done' WHERE id = fb;
  IF (SELECT status FROM public.app_feedback WHERE id = fb) <> 'new' THEN fails := fails || ' member_update'; END IF;
  BEGIN
    UPDATE public.app_feedback SET message = 'x' WHERE id = fb;
    fails := fails || ' member_update_message';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- ---- Another member sees none of it --------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.app_feedback WHERE user_id = emp;
  IF n > 0 THEN fails := fails || ' other_reads'; END IF;
  -- Inserting as someone else is impossible (user_id is set from auth.uid()).
  INSERT INTO public.app_feedback (kind, message) VALUES ('praise', 'Nice') RETURNING id INTO fb;
  IF (SELECT user_id FROM public.app_feedback WHERE id = fb) <> other THEN fails := fails || ' forged_user'; END IF;

  -- ---- Superadmin: alert row, reads all, sets status -----------------------
  IF sa IS NOT NULL THEN
    PERFORM set_config('role', 'postgres', true);
    SELECT count(*) INTO n FROM public.shift_audit_log
     WHERE action = 'feedback_new' AND target_user_id = sa AND created_at >= now() AND details->>'kind' = 'bug';
    IF n <> 1 THEN fails := fails || format(' alert_rows(%s)', n); END IF;
    PERFORM set_config('role', 'authenticated', true);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM public.app_feedback WHERE user_id IN (emp, other);
    IF n < 3 THEN fails := fails || ' superadmin_reads'; END IF;
    UPDATE public.app_feedback SET status = 'done' WHERE id = fb;
    IF (SELECT status FROM public.app_feedback WHERE id = fb) <> 'done' THEN fails := fails || ' superadmin_update'; END IF;
  END IF;

  -- ---- anon: nothing ---------------------------------------------------------
  PERFORM set_config('role', 'anon', true);
  BEGIN
    SELECT count(*) INTO n FROM public.app_feedback;
    fails := fails || ' anon_reads';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('role', 'postgres', true);
  IF fails <> '' THEN RAISE EXCEPTION 'FEEDBACK FAIL:%', fails; END IF;
  RAISE NOTICE 'FEEDBACK SMOKE OK';
END
$$;

ROLLBACK;
