-- =============================================================================
-- DEMO DATA ("Vyzkoušet s ukázkovými daty")
-- -----------------------------------------------------------------------------
-- A new owner fills their own organization with a realistic month — two demo
-- locations, eight demo people, a published rota, clock records, requests,
-- leave and announcements — and removes exactly that again in one tap.
--
-- How it stays apart from real data:
-- * organizations.demo_batch holds the current batch id (one at a time).
-- * Rows created by the seed carry the same demo_batch: locations, profiles,
--   scheduled_shifts, announcements, shift_audit_log. Everything else the seed
--   makes hangs off a demo person or a demo location and goes with them
--   (ON DELETE CASCADE).
-- * The tag can only be written while seed_demo_data / clear_demo_data run:
--   they set the transaction-local GUC `shiftella.demo_seed` to the batch id,
--   and the BEFORE trigger _demo_stamp() otherwise keeps the old value (UPDATE)
--   or NULL (INSERT). So nobody can tag real rows to dodge plan limits.
--
-- Demo people need an auth.users row (profiles.id references it). They get one
-- that cannot sign in: no password, no identity, banned until 2999, and an
-- e-mail on the reserved .invalid TLD, so no mail can ever reach anyone.
--
-- No notifications: while seeding/clearing, audit rows that triggers write as
-- side effects are dropped; the few curated demo audit rows (and any later row
-- about a demo person — reminders, approvals, …) carry demo_batch, and the
-- push webhooks (supabase_functions.http_request on shift_audit_log and
-- announcements) only fire WHEN demo_batch IS NULL. Late alerts and the morning
-- digest ignore demo people. Demo people and locations don't count towards
-- plan limits / billing usage.
-- =============================================================================

-- --- 1. Tag columns -------------------------------------------------------------------
ALTER TABLE public.organizations    ADD COLUMN IF NOT EXISTS demo_batch uuid;
ALTER TABLE public.locations        ADD COLUMN IF NOT EXISTS demo_batch uuid;
ALTER TABLE public.profiles         ADD COLUMN IF NOT EXISTS demo_batch uuid;
ALTER TABLE public.scheduled_shifts ADD COLUMN IF NOT EXISTS demo_batch uuid;
ALTER TABLE public.announcements    ADD COLUMN IF NOT EXISTS demo_batch uuid;
ALTER TABLE public.shift_audit_log  ADD COLUMN IF NOT EXISTS demo_batch uuid;

CREATE INDEX IF NOT EXISTS profiles_demo_batch_idx         ON public.profiles (demo_batch) WHERE demo_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS locations_demo_batch_idx        ON public.locations (demo_batch) WHERE demo_batch IS NOT NULL;
CREATE INDEX IF NOT EXISTS shift_audit_log_demo_batch_idx  ON public.shift_audit_log (demo_batch) WHERE demo_batch IS NOT NULL;

-- --- 2. "Are we seeding this org right now?" ------------------------------------------
-- The batch id when the current transaction runs seed/clear for p_org, else NULL.
CREATE OR REPLACE FUNCTION public._demo_seeding(p_org uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := NULLIF(current_setting('shiftella.demo_seed', true), '');
BEGIN
  IF v IS NULL OR p_org IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT o.demo_batch FROM public.organizations o WHERE o.id = p_org AND o.demo_batch::text = v);
END;
$$;
REVOKE ALL ON FUNCTION public._demo_seeding(uuid) FROM PUBLIC, anon, authenticated;

-- Rows inserted while seeding get the batch; otherwise the tag can't be set or changed.
CREATE OR REPLACE FUNCTION public._demo_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public._demo_seeding(NEW.organization_id);
BEGIN
  IF v IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN NEW.demo_batch := v; END IF;
  ELSE
    NEW.demo_batch := CASE WHEN TG_OP = 'UPDATE' THEN OLD.demo_batch END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._demo_stamp() FROM PUBLIC, anon, authenticated;

-- "a0_" sorts before every other BEFORE trigger (a_sync_org_role, plan_* …).
DROP TRIGGER IF EXISTS a0_demo_stamp ON public.locations;
CREATE TRIGGER a0_demo_stamp BEFORE INSERT OR UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public._demo_stamp();
DROP TRIGGER IF EXISTS a0_demo_stamp ON public.profiles;
CREATE TRIGGER a0_demo_stamp BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public._demo_stamp();
DROP TRIGGER IF EXISTS a0_demo_stamp ON public.scheduled_shifts;
CREATE TRIGGER a0_demo_stamp BEFORE INSERT OR UPDATE ON public.scheduled_shifts FOR EACH ROW EXECUTE FUNCTION public._demo_stamp();
DROP TRIGGER IF EXISTS a0_demo_stamp ON public.announcements;
CREATE TRIGGER a0_demo_stamp BEFORE INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public._demo_stamp();

-- --- 3. Audit log: no side-effect rows while seeding; tag rows about demo people -------
CREATE OR REPLACE FUNCTION public._demo_audit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public._demo_seeding(NEW.organization_id);
BEGIN
  IF v IS NOT NULL THEN
    -- Seeding / clearing: keep only the curated rows (they carry the batch).
    IF NEW.demo_batch IS DISTINCT FROM v THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  -- Any other time: a row about (or to) a demo person belongs to the demo batch —
  -- stays in-app, never pushed, and is removed with the demo data.
  NEW.demo_batch := (
    SELECT p.demo_batch FROM public.profiles p
     WHERE p.id IN (NEW.actor_id, NEW.subject_id, NEW.target_user_id) AND p.demo_batch IS NOT NULL
     LIMIT 1);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._demo_audit_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a0_demo_audit_guard ON public.shift_audit_log;
CREATE TRIGGER a0_demo_audit_guard BEFORE INSERT ON public.shift_audit_log
  FOR EACH ROW EXECUTE FUNCTION public._demo_audit_guard();

-- --- 4. Push webhooks skip demo rows ----------------------------------------------------
-- The Database Webhooks (send-push) are plain triggers that embed the project's
-- service key, so they are rewritten in place: same definition + a WHEN clause.
DO $do$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT t.oid, t.tgname, t.tgrelid::regclass AS tbl
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT t.tgisinternal
       AND n.nspname = 'supabase_functions' AND p.proname = 'http_request'
       AND t.tgrelid IN ('public.shift_audit_log'::regclass, 'public.announcements'::regclass)
  LOOP
    v_def := pg_get_triggerdef(r.oid);
    CONTINUE WHEN v_def ILIKE '%demo_batch%';
    v_def := regexp_replace(v_def, 'FOR EACH ROW EXECUTE', 'FOR EACH ROW WHEN ((new.demo_batch IS NULL)) EXECUTE');
    CONTINUE WHEN v_def NOT ILIKE '%demo_batch%';     -- unexpected shape: leave it alone
    EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.tbl);
    EXECUTE v_def;
  END LOOP;
END
$do$;

-- --- 5. Plan limits / billing usage ignore demo rows ------------------------------------
CREATE OR REPLACE FUNCTION public.org_member_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.profiles WHERE organization_id = p_org AND role <> 'Superadmin' AND demo_batch IS NULL $$;

CREATE OR REPLACE FUNCTION public.org_active_location_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.locations WHERE organization_id = p_org AND archived_at IS NULL AND demo_batch IS NULL $$;

CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit integer;
BEGIN
  IF NEW.role = 'Superadmin' THEN RETURN NEW; END IF;
  IF NEW.demo_batch IS NOT NULL THEN RETURN NEW; END IF;      -- demo people don't count
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND OLD.role <> 'Superadmin' THEN RETURN NEW; END IF;
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.email IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.pending_invites pi
        WHERE pi.email = lower(btrim(NEW.email))
          AND pi.organization_id = NEW.organization_id
          AND pi.bypass_limits) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.subscriptions WHERE organization_id = NEW.organization_id FOR UPDATE;
  v_limit := public.plan_member_limit(public.org_plan(NEW.organization_id));
  IF v_limit IS NOT NULL AND public.org_member_count(NEW.organization_id) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_MEMBERS: Your plan allows up to % members. Upgrade to add more.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_location_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit integer;
BEGIN
  IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.demo_batch IS NOT NULL THEN RETURN NEW; END IF;      -- demo locations don't count
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.subscriptions WHERE organization_id = NEW.organization_id FOR UPDATE;
  v_limit := public.plan_location_limit(public.org_plan(NEW.organization_id));
  IF v_limit IS NOT NULL
     AND (SELECT count(*) FROM public.locations
           WHERE organization_id = NEW.organization_id AND archived_at IS NULL AND demo_batch IS NULL
             AND id <> NEW.id) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_LOCATIONS: Your plan includes up to % active locations. Upgrade to add more.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- --- 6. Late alerts + morning digest ignore demo people ----------------------------------
CREATE OR REPLACE FUNCTION public.check_late_shifts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_min int;
BEGIN
  FOR r IN
    SELECT ss.id, ss.user_id, ss.organization_id, ss.starts_at,
           ss.late15_notified, ss.late60_notified,
           p.manager_id, l.name AS location_name
    FROM public.scheduled_shifts ss
    JOIN public.profiles p ON p.id = ss.user_id
    LEFT JOIN public.locations l ON l.id = ss.location_id
    WHERE ss.published
      AND NOT ss.all_day
      AND p.demo_batch IS NULL                            -- demo people are never "late"
      AND ss.starts_at <= now() - interval '15 minutes'
      AND ss.starts_at >  now() - interval '3 hours'     -- stop chasing old shifts
      AND (NOT ss.late15_notified OR NOT ss.late60_notified)
      AND NOT EXISTS (                                    -- clocked in around the start?
        SELECT 1 FROM public.shifts s
        WHERE s.user_id = ss.user_id
          AND s.started_at <= now()
          AND s.started_at >= ss.starts_at - interval '3 hours'
          AND COALESCE(s.ended_at, 'infinity'::timestamptz) > ss.starts_at
      )
  LOOP
    v_min := FLOOR(EXTRACT(EPOCH FROM (now() - r.starts_at)) / 60);
    IF v_min >= 60 AND NOT r.late60_notified THEN
      PERFORM public._notify_late(r.user_id, r.manager_id, r.organization_id, 'late_60',
        public._display_name(r.user_id), r.location_name, r.starts_at, v_min);
      UPDATE public.scheduled_shifts SET late60_notified = true, late15_notified = true WHERE id = r.id;
    ELSIF v_min >= 15 AND v_min < 60 AND NOT r.late15_notified THEN
      PERFORM public._notify_late(r.user_id, r.manager_id, r.organization_id, 'late_15',
        public._display_name(r.user_id), r.location_name, r.starts_at, v_min);
      UPDATE public.scheduled_shifts SET late15_notified = true WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_late_shifts() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_daily_digests(p_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_local  timestamp := now() AT TIME ZONE 'Europe/Prague';
  v_day    date := v_local::date;
  v_from   timestamptz := (v_day::timestamp) AT TIME ZONE 'Europe/Prague';
  v_to     timestamptz := ((v_day + 1)::timestamp) AT TIME ZONE 'Europe/Prague';
  o        RECORD;
  a        RECORD;
  v_shifts integer;
  v_people integer;
  v_open   integer;
  v_req    integer;
  v_n      integer := 0;
BEGIN
  IF NOT p_force AND extract(hour FROM v_local) <> 7 THEN RETURN 0; END IF;

  FOR o IN SELECT id FROM public.organizations LOOP
    -- Demo people / demo locations don't make a digest (or its numbers).
    SELECT count(*), count(DISTINCT ss.user_id) INTO v_shifts, v_people
      FROM public.scheduled_shifts ss
      JOIN public.profiles p ON p.id = ss.user_id AND p.demo_batch IS NULL
     WHERE ss.organization_id = o.id AND ss.published AND ss.starts_at < v_to AND ss.ends_at > v_from;
    SELECT count(*) INTO v_open
      FROM public.open_shifts os
      JOIN public.locations l ON l.id = os.location_id AND l.demo_batch IS NULL
     WHERE os.organization_id = o.id AND os.claimed_by IS NULL AND os.starts_at < v_to AND os.ends_at > now();
    SELECT (SELECT count(*) FROM public.time_off t JOIN public.profiles p ON p.id = t.user_id AND p.demo_batch IS NULL
             WHERE t.organization_id = o.id AND t.status = 'pending')
         + (SELECT count(*) FROM public.shift_swaps s JOIN public.profiles p ON p.id = s.from_user AND p.demo_batch IS NULL
             WHERE s.organization_id = o.id AND s.status = 'taken')
         + (SELECT count(*) FROM public.name_change_requests n JOIN public.profiles p ON p.id = n.user_id AND p.demo_batch IS NULL
             WHERE n.organization_id = o.id AND n.status = 'pending')
         + (SELECT count(*) FROM public.member_requests m JOIN public.profiles p ON p.id = m.user_id AND p.demo_batch IS NULL
             WHERE m.organization_id = o.id AND m.status = 'pending')
      INTO v_req;

    CONTINUE WHEN v_shifts = 0 AND v_open = 0 AND v_req = 0;

    FOR a IN
      SELECT p.id FROM public.profiles p
       WHERE p.organization_id = o.id AND public.role_rank(p.role) >= 30 AND p.role <> 'Superadmin'
         AND p.demo_batch IS NULL
    LOOP
      INSERT INTO public.daily_digest_sent (user_id, day) VALUES (a.id, v_day) ON CONFLICT DO NOTHING;
      CONTINUE WHEN NOT FOUND;   -- already sent today
      INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, subject_id, action, details)
      VALUES (o.id, NULL, NULL, a.id, NULL, 'daily_digest',
              jsonb_build_object('shifts', v_shifts, 'people', v_people, 'open', v_open, 'requests', v_req, 'day', v_day));
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  DELETE FROM public.daily_digest_sent WHERE day < v_day - 7;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_daily_digests(boolean) FROM PUBLIC, anon, authenticated;

-- --- 7. The demo team (based on tools/screenshots/fake/demoData.ts) ----------------------
-- loc: 1 = Malá Strana, 2 = Karlín. Week patterns Mon..Sun for alternating weeks:
-- D = opening hours 08–20, R = 08–14, O = 14–20, K = kitchen 08–16, . = off.
CREATE OR REPLACE FUNCTION public._demo_roster()
RETURNS TABLE (n int, first_name text, last_name text, uname text, base_role text, loc int, week_a text, week_b text, rate numeric)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  VALUES
    (1, 'Tomáš',    'Král',      'tomas.kral',       'Manager',    1, 'DD..DDD', '..DD...', 245::numeric),
    (2, 'Eva',      'Dvořáková', 'eva.dvorakova',    'Employee',   1, '..DD...', 'DD..DDD', 195),
    (3, 'Ondřej',   'Procházka', 'ondrej.prochazka', 'Employee',   1, 'OOO..OO', 'O..OOO.', 175),
    (4, 'Veronika', 'Pokorná',   'veronika.pokorna', 'Employee',   1, 'R.R.RO.', '.R.R..O', 175),
    (5, 'Martin',   'Svoboda',   'martin.svoboda',   'Manager',    2, 'DD..DDD', '..DD...', 245),
    (6, 'David',    'Beneš',     'david.benes',      'Supervisor', 2, '..DD...', 'DD..DDD', 215),
    (7, 'Lukáš',    'Černý',     'lukas.cerny',      'Employee',   2, 'KKK..KK', 'KK.KK.K', 210),
    (8, 'Tereza',   'Kučerová',  'tereza.kucerova',  'Employee',   2, 'OO.OO..', '.OO.OO.', 175)
$$;
REVOKE ALL ON FUNCTION public._demo_roster() FROM PUBLIC, anon, authenticated;

-- Shift kind on a day → local start/end (NULL = off). Alternating weeks from 2026-01-05.
CREATE OR REPLACE FUNCTION public._demo_kind(p_a text, p_b text, p_day date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(substr(CASE WHEN ((p_day - date '2026-01-05') / 7) % 2 <> 0 THEN p_a ELSE p_b END,
                       extract(isodow FROM p_day)::int, 1), '.')
$$;
REVOKE ALL ON FUNCTION public._demo_kind(text, text, date) FROM PUBLIC, anon, authenticated;

-- --- 8. Seed -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_lang text DEFAULT 'cs')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_me     public.profiles;
  v_org    uuid;
  v_batch  uuid := gen_random_uuid();
  v_en     boolean := lower(coalesce(p_lang, 'cs')) = 'en';
  v_tz     text := 'Europe/Prague';
  v_today  date := (now() AT TIME ZONE 'Europe/Prague')::date;
  v_from   date;
  v_to     date;
  v_hist   date;
  v_locs   uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid()];
  v_people uuid[] := '{}';
  v_id     uuid;
  r        record;
  v_shift  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_me.role = 'Superadmin' OR v_me.demo_batch IS NOT NULL
     OR public.org_role_rank(v_me.org_role_id, v_me.role) < 40 THEN
    RAISE EXCEPTION 'Only the organization owner can add demo data.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_org := v_me.organization_id;

  PERFORM 1 FROM public.organizations WHERE id = v_org AND demo_batch IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_EXISTS: This organization already has demo data.' USING ERRCODE = 'unique_violation';
  END IF;

  -- From here on, everything this transaction writes for v_org is demo data.
  PERFORM set_config('shiftella.demo_seed', v_batch::text, true);
  UPDATE public.organizations SET demo_batch = v_batch WHERE id = v_org;

  v_from := date_trunc('month', v_today)::date;
  v_to   := greatest((date_trunc('month', v_today) + interval '1 month - 1 day')::date, v_today + 14);
  v_hist := least(v_from, v_today - 14);

  -- Locations (+ opening hours, staffing targets)
  INSERT INTO public.locations (id, organization_id, name, code) VALUES
    (v_locs[1], v_org, CASE WHEN v_en THEN 'Demo · Malá Strana' ELSE 'Ukázka · Malá Strana' END, 'M'),
    (v_locs[2], v_org, CASE WHEN v_en THEN 'Demo · Karlín' ELSE 'Ukázka · Karlín' END, 'K');
  INSERT INTO public.location_settings (location_id, organization_id, open_time, close_time, timezone, break_minutes)
  SELECT l, v_org, '08:00', '20:00', v_tz, 30 FROM unnest(v_locs) l;
  IF public.org_has_feature(v_org, 'coverage') THEN
    INSERT INTO public.coverage_requirements (organization_id, location_id, day_of_week, min_headcount)
    SELECT v_org, l, d, 2 FROM unnest(v_locs) l, generate_series(0, 6) d;
  END IF;

  -- People: auth users that can never sign in; handle_new_user makes the profile.
  FOR r IN SELECT * FROM public._demo_roster() ORDER BY n LOOP
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until,
      confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
    VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      format('demo-%s-%s@demo.shiftella.invalid', r.uname, left(replace(v_batch::text, '-', ''), 10)), '',
      jsonb_build_object('provider', 'demo', 'providers', '[]'::jsonb, 'demo', true,
                         'organization_id', v_org, 'role', r.base_role),
      jsonb_build_object('username', 'demo.' || r.uname, 'first_name', r.first_name, 'last_name', r.last_name),
      now(), now(), '2999-12-31 00:00:00+00',
      '', '', '', '', false, false);
    v_people := v_people || v_id;
    INSERT INTO public.location_roster (location_id, user_id, organization_id, added_by)
    VALUES (v_locs[r.loc], v_id, v_org, v_uid);
  END LOOP;

  -- Published rota. Reminder/late flags are pre-set: demo shifts never notify.
  INSERT INTO public.scheduled_shifts (user_id, organization_id, location_id, starts_at, ends_at, published, created_by,
                                       late15_notified, late60_notified, reminder_notified, created_at, updated_at)
  SELECT v_people[ro.n], v_org, v_locs[ro.loc],
         (d + k.s) AT TIME ZONE v_tz, (d + k.e) AT TIME ZONE v_tz, true, v_uid, true, true, true,
         now() - interval '18 days', now() - interval '18 days'
    FROM public._demo_roster() ro
    CROSS JOIN generate_series(v_from, v_to, interval '1 day') g(day)
    CROSS JOIN LATERAL (SELECT g.day::date AS d) dd(d)
    JOIN (VALUES ('D', time '08:00', time '20:00'), ('R', time '08:00', time '14:00'),
                 ('O', time '14:00', time '20:00'), ('K', time '08:00', time '16:00')) k(kind, s, e)
      ON k.kind = public._demo_kind(ro.week_a, ro.week_b, dd.d);

  -- Leave: a pending vacation, a past sick leave (clears those shifts), an approved vacation.
  INSERT INTO public.time_off (user_id, organization_id, kind, starts_on, ends_on, note, status, reviewed_by, review_note, reviewed_at, created_at) VALUES
    (v_people[8], v_org, 'vacation', v_today + 10, v_today + 14,
     CASE WHEN v_en THEN 'Family trip to Brno' ELSE 'Za rodinou do Brna' END, 'pending', NULL, NULL, NULL, now() - interval '3 days'),
    (v_people[7], v_org, 'sick', v_today - 6, v_today - 5,
     CASE WHEN v_en THEN 'Sore throat, back on Thursday' ELSE 'Angína, neschopenka do čtvrtka' END, 'approved', v_uid,
     CASE WHEN v_en THEN 'Get well soon!' ELSE 'Brzy se uzdrav!' END, now() - interval '6 days', now() - interval '6 days'),
    (v_people[2], v_org, 'vacation', v_today + 18, v_today + 20,
     CASE WHEN v_en THEN 'Mountains with the family' ELSE 'Hory s rodinou' END, 'approved', v_uid, NULL,
     now() - interval '12 days', now() - interval '14 days');

  -- Clock records: everyone's past planned days (not on leave) + today's live board.
  INSERT INTO public.shifts (user_id, organization_id, location_id, started_at, ended_at, role)
  SELECT v_people[ro.n], v_org, v_locs[ro.loc],
         st, CASE WHEN en <= now() THEN en END, ro.base_role
    FROM public._demo_roster() ro
    CROSS JOIN generate_series(v_hist, v_today, interval '1 day') g(day)
    CROSS JOIN LATERAL (SELECT g.day::date AS d) dd(d)
    JOIN (VALUES ('D', time '08:00', time '20:00'), ('R', time '08:00', time '14:00'),
                 ('O', time '14:00', time '20:00'), ('K', time '08:00', time '16:00')) k(kind, s, e)
      ON k.kind = public._demo_kind(ro.week_a, ro.week_b, dd.d)
    CROSS JOIN LATERAL (
      SELECT ((dd.d + k.s) AT TIME ZONE v_tz) + make_interval(mins => (abs(hashtext(ro.uname || dd.d)) % 12) - 8) AS st,
             ((dd.d + k.e) AT TIME ZONE v_tz) + make_interval(mins => (abs(hashtext(dd.d || ro.uname)) % 35) - 4) AS en
    ) t
   WHERE st <= now()
     AND NOT EXISTS (SELECT 1 FROM public.time_off o
                      WHERE o.user_id = v_people[ro.n] AND o.status = 'approved' AND dd.d BETWEEN o.starts_on AND o.ends_on);

  -- Confirmations for the next few days (Ondřej hasn't confirmed yet).
  INSERT INTO public.shift_confirmations (scheduled_shift_id, user_id, organization_id, confirmed_at)
  SELECT ss.id, ss.user_id, v_org, now() - interval '2 days'
    FROM public.scheduled_shifts ss
   WHERE ss.organization_id = v_org AND ss.demo_batch = v_batch
     AND ss.user_id <> v_people[3] AND ss.starts_at < now() + interval '4 days';

  -- Swaps: Eva's next shift taken by Veronika (waiting for approval) + Ondřej's open offer.
  IF public.org_has_feature(v_org, 'swaps') THEN
    SELECT id INTO v_shift FROM public.scheduled_shifts
     WHERE user_id = v_people[2] AND starts_at > now() + interval '1 day' ORDER BY starts_at LIMIT 1;
    IF v_shift IS NOT NULL THEN
      INSERT INTO public.shift_swaps (organization_id, shift_id, from_user, taker_id, status, note, created_at, updated_at)
      VALUES (v_org, v_shift, v_people[2], v_people[4], 'taken',
              CASE WHEN v_en THEN 'My friend''s wedding that day.' ELSE 'Ten den mám svatbu kamarádky.' END,
              now() - interval '2 days', now() - interval '1 day');
    END IF;
    SELECT id INTO v_shift FROM public.scheduled_shifts
     WHERE user_id = v_people[3] AND starts_at > now() + interval '5 days' ORDER BY starts_at LIMIT 1;
    IF v_shift IS NOT NULL THEN
      INSERT INTO public.shift_swaps (organization_id, shift_id, from_user, status, note, created_at, updated_at)
      VALUES (v_org, v_shift, v_people[3], 'open',
              CASE WHEN v_en THEN 'Exam at school — can anyone take it?' ELSE 'Zkouška ve škole, vezme to někdo?' END,
              now() - interval '1 day', now() - interval '1 day');
    END IF;
  END IF;

  -- Member requests
  INSERT INTO public.member_requests (organization_id, user_id, kind, subject, body, anonymous, status, created_at) VALUES
    (v_org, v_people[3], 'other',
     CASE WHEN v_en THEN 'New aprons' ELSE 'Nové zástěry' END,
     CASE WHEN v_en THEN 'Ours are quite worn out — could we order new ones, ideally with a phone pocket?'
          ELSE 'Ty současné jsou už dost seprané – šlo by objednat nové, ideálně s kapsou na telefon?' END,
     false, 'pending', now() - interval '1 day'),
    (v_org, v_people[8], 'complaint',
     CASE WHEN v_en THEN 'Overfull storeroom in Karlín' ELSE 'Přeplněný sklad v Karlíně' END,
     CASE WHEN v_en THEN 'Milk crates are stacked up to the door, it''s hard to get through.'
          ELSE 'Krabice s mlékem se skládají až ke dveřím, špatně se tam chodí.' END,
     true, 'pending', now() - interval '2 days');

  -- Announcements (unread, so Home shows the banner)
  INSERT INTO public.announcements (organization_id, location_id, author_id, title, body, pinned, created_at, updated_at) VALUES
    (v_org, NULL, v_people[1],
     CASE WHEN v_en THEN 'Winter menu' ELSE 'Zimní nabídka na lístku' END,
     CASE WHEN v_en THEN 'From Monday we serve gingerbread latte and hot apple cider. Team tasting on Friday at 3 pm in Malá Strana.'
          ELSE 'Od pondělí nabízíme perníkové latte a horký jablečný mošt. Ochutnávka pro celý tým v pátek v 15:00 na Malé Straně.' END,
     true, now() - interval '2 days', now() - interval '2 days'),
    (v_org, v_locs[2], v_people[5],
     CASE WHEN v_en THEN 'Karlín: espresso machine service' ELSE 'Karlín: servis kávovaru' END,
     CASE WHEN v_en THEN 'A technician comes on Wednesday morning — until 9:00 we run on one grinder.'
          ELSE 'Ve středu ráno přijde technik, do 9:00 jedeme jen s jedním mlýnkem.' END,
     false, now() - interval '5 days', now() - interval '5 days');

  IF public.org_has_feature(v_org, 'openShifts') THEN
    INSERT INTO public.open_shifts (organization_id, location_id, starts_at, ends_at, note, created_by)
    VALUES (v_org, v_locs[2], (v_today + 2 + time '14:00') AT TIME ZONE v_tz, (v_today + 2 + time '20:00') AT TIME ZONE v_tz,
            CASE WHEN v_en THEN 'Extra hands for the Christmas market' ELSE 'Posila na adventní trhy' END, v_people[5]);
  END IF;

  IF public.org_has_feature(v_org, 'wages') THEN
    INSERT INTO public.member_wages (organization_id, user_id, hourly_rate, currency, effective_from, created_by)
    SELECT v_org, v_people[ro.n], ro.rate, 'CZK', (date_trunc('month', v_today) - interval '2 months')::date, v_uid
      FROM public._demo_roster() ro;
  END IF;

  -- A few curated activity rows for the owner's bell (tagged → never pushed).
  INSERT INTO public.shift_audit_log (organization_id, actor_id, target_user_id, action, details, created_at, demo_batch) VALUES
    (v_org, v_people[8], v_uid, 'timeoff_requested',
     jsonb_build_object('actor_name', 'Tereza Kučerová', 'target_name', 'Tereza Kučerová', 'kind', 'vacation',
                        'starts_on', v_today + 10, 'ends_on', v_today + 14),
     now() - interval '3 days', v_batch),
    (v_org, v_people[4], v_uid, 'swap_requested',
     jsonb_build_object('from_name', 'Eva Dvořáková', 'taker_name', 'Veronika Pokorná'),
     now() - interval '1 day', v_batch);

  PERFORM set_config('shiftella.demo_seed', '', true);
  RETURN jsonb_build_object('batch', v_batch, 'people', array_length(v_people, 1), 'locations', 2);
END;
$$;
REVOKE ALL ON FUNCTION public.seed_demo_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(text) TO authenticated;

-- --- 9. Clear ----------------------------------------------------------------------------
-- Removes exactly the current batch. Real data stays: a demo location where a real
-- person has clocked in is kept (untagged) so their records survive; real planned
-- shifts at a removed demo location just lose the location.
CREATE OR REPLACE FUNCTION public.clear_demo_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_me     public.profiles;
  v_org    uuid;
  v_batch  uuid;
  v_people integer;
  v_kept   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_me.role = 'Superadmin' OR v_me.demo_batch IS NOT NULL
     OR public.org_role_rank(v_me.org_role_id, v_me.role) < 40 THEN
    RAISE EXCEPTION 'Only the organization owner can remove demo data.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_org := v_me.organization_id;

  SELECT demo_batch INTO v_batch FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF v_batch IS NULL THEN
    RETURN jsonb_build_object('people', 0, 'locations', 0);
  END IF;

  -- Side-effect audit rows of the deletes are dropped (see _demo_audit_guard).
  PERFORM set_config('shiftella.demo_seed', v_batch::text, true);

  UPDATE public.locations l SET demo_batch = NULL
   WHERE l.organization_id = v_org AND l.demo_batch = v_batch
     AND EXISTS (SELECT 1 FROM public.shifts s JOIN public.profiles p ON p.id = s.user_id
                  WHERE s.location_id = l.id AND p.demo_batch IS NULL);
  GET DIAGNOSTICS v_kept = ROW_COUNT;

  DELETE FROM public.shift_audit_log WHERE organization_id = v_org AND demo_batch = v_batch;
  DELETE FROM public.announcements   WHERE organization_id = v_org AND demo_batch = v_batch;

  -- Demo people: their auth rows (→ profile → their shifts, clock records, leave,
  -- swaps, requests, wages, roster … all cascade). Double-checked by the e-mail domain.
  DELETE FROM auth.users u
   USING public.profiles p
   WHERE p.id = u.id AND p.organization_id = v_org AND p.demo_batch = v_batch
     AND u.email LIKE '%@demo.shiftella.invalid';
  GET DIAGNOSTICS v_people = ROW_COUNT;

  DELETE FROM public.scheduled_shifts WHERE organization_id = v_org AND demo_batch = v_batch;
  DELETE FROM public.locations        WHERE organization_id = v_org AND demo_batch = v_batch;

  UPDATE public.organizations SET demo_batch = NULL WHERE id = v_org;
  PERFORM set_config('shiftella.demo_seed', '', true);
  RETURN jsonb_build_object('people', v_people, 'locations_kept', v_kept);
END;
$$;
REVOKE ALL ON FUNCTION public.clear_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_demo_data() TO authenticated;
