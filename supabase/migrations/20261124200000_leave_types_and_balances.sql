-- =============================================================================
-- LEAVE — more absence types, vacation balance in hours, náhradní volno bank.
-- -----------------------------------------------------------------------------
-- 1. Absence types: the three old kinds plus OČR, náhradní volno (comp_time),
--    unpaid leave, doctor, sick day, business trip, home office, parental
--    leave and employer-side obstacle. Each organization picks which ones its
--    people may request (org_leave_settings.enabled_kinds); people who decide
--    requests may enter any kind.
-- 2. Hours: every leave row carries `hours`, what it takes from a balance.
--    Czech vacation has been counted in hours since 2021. By default each day
--    counts the member's planned rota shifts that day (net of breaks); a
--    weekday with nothing planned counts weekly hours / 5, and weekends and
--    public holidays count 0. A request for part of one day (doctor 2 h, half
--    a day of vacation) carries its own hours (hours_auto = false).
-- 3. Vacation balance per calendar year: entitlement (member override, or org
--    weekly hours × vacation weeks) + manual adjustments (carry-over,
--    corrections) − approved vacation starting that year.
-- 4. Náhradní volno bank (§115 ZP): hours clocked on a public holiday (net of
--    breaks, Prague time) + adjustments − approved comp_time leave. All time,
--    not per year. Organizations that pay the holiday bonus instead switch it
--    off (holiday_comp_time = false).
-- 5. Public holidays 2028–2035 (Easter computed), so both of the above keep
--    working after the seeded years.
-- Reads: leave_balances(year). Writes: set_org_leave_settings,
-- set_member_leave, add_leave_adjustment, delete_leave_adjustment. Everything
-- about other people follows can_review_request (deciders, never for oneself).
-- =============================================================================

-- --- 1. Kinds + hours on time_off ------------------------------------------------
ALTER TABLE public.time_off DROP CONSTRAINT IF EXISTS time_off_kind_check;
ALTER TABLE public.time_off ADD CONSTRAINT time_off_kind_check CHECK (kind IN (
  'vacation', 'sick', 'other', 'ocr', 'comp_time', 'unpaid', 'doctor',
  'sick_day', 'business_trip', 'home_office', 'parental', 'obstacle'));

ALTER TABLE public.time_off
  ADD COLUMN IF NOT EXISTS hours numeric(7,2) CHECK (hours IS NULL OR hours >= 0),
  ADD COLUMN IF NOT EXISTS hours_auto boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.time_off.hours IS
  'Hours the leave takes (vacation / náhradní volno balances). Computed from the rota unless the request set them (hours_auto = false).';

-- --- 2. Settings ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_leave_settings (
  organization_id   uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_kinds     text[] NOT NULL DEFAULT ARRAY['vacation', 'sick', 'ocr', 'comp_time', 'unpaid', 'doctor', 'other'],
  weekly_hours      numeric(4,1) NOT NULL DEFAULT 40 CHECK (weekly_hours BETWEEN 1 AND 60),
  vacation_weeks    numeric(3,1) NOT NULL DEFAULT 4 CHECK (vacation_weeks BETWEEN 0 AND 10),
  holiday_comp_time boolean NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_leave_settings_kinds CHECK (enabled_kinds <@ ARRAY[
    'vacation', 'sick', 'other', 'ocr', 'comp_time', 'unpaid', 'doctor',
    'sick_day', 'business_trip', 'home_office', 'parental', 'obstacle'])
);
ALTER TABLE public.org_leave_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_leave_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_leave_settings TO authenticated;
GRANT ALL ON public.org_leave_settings TO service_role;
DROP POLICY IF EXISTS "org_leave_settings_select" ON public.org_leave_settings;
CREATE POLICY "org_leave_settings_select" ON public.org_leave_settings FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.get_my_org_id());

CREATE TABLE IF NOT EXISTS public.member_leave (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  weekly_hours    numeric(4,1) CHECK (weekly_hours IS NULL OR weekly_hours BETWEEN 1 AND 60),
  vacation_hours  numeric(6,1) CHECK (vacation_hours IS NULL OR vacation_hours BETWEEN 0 AND 600),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_leave ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_leave FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_leave TO authenticated;
GRANT ALL ON public.member_leave TO service_role;
DROP POLICY IF EXISTS "member_leave_select" ON public.member_leave;
CREATE POLICY "member_leave_select" ON public.member_leave FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR user_id = (SELECT auth.uid())
    OR ((SELECT public.has_permission('requests', 'read')) AND organization_id = public.get_my_org_id())
  );

CREATE TABLE IF NOT EXISTS public.leave_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket          text NOT NULL CHECK (bucket IN ('vacation', 'comp_time')),
  year            integer CHECK (year IS NULL OR year BETWEEN 2000 AND 2100),  -- vacation: the year it counts for
  hours           numeric(7,2) NOT NULL CHECK (hours <> 0 AND abs(hours) <= 2000),
  note            text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_adjustments_year CHECK ((bucket = 'vacation') = (year IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS leave_adjustments_user_idx ON public.leave_adjustments (user_id, bucket, year);
ALTER TABLE public.leave_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leave_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leave_adjustments TO authenticated;
GRANT ALL ON public.leave_adjustments TO service_role;
DROP POLICY IF EXISTS "leave_adjustments_select" ON public.leave_adjustments;
CREATE POLICY "leave_adjustments_select" ON public.leave_adjustments FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR user_id = (SELECT auth.uid())
    OR ((SELECT public.has_permission('requests', 'read')) AND organization_id = public.get_my_org_id())
  );

-- --- 3. Hours ---------------------------------------------------------------------------
-- Mirrors calculateNetHours() in src/features/shifts/shiftStats.ts: 30 min per started 6 h.
CREATE OR REPLACE FUNCTION public._net_hours(p_gross numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_gross IS NULL OR p_gross <= 0 THEN 0
              ELSE greatest(0, p_gross - floor((p_gross - 0.0001) / 6) * 0.5) END
$$;

CREATE OR REPLACE FUNCTION public._weekly_hours(p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT ml.weekly_hours FROM public.member_leave ml WHERE ml.user_id = p_user),
    (SELECT s.weekly_hours FROM public.org_leave_settings s
       JOIN public.profiles p ON p.organization_id = s.organization_id WHERE p.id = p_user),
    40)
$$;

-- Hours a leave over [from, to] takes: per day the planned shifts (net), else
-- weekly/5 on a working weekday, else 0.
CREATE OR REPLACE FUNCTION public._leave_hours(p_user uuid, p_from date, p_to date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_from, p_to, interval '1 day') d
  ), planned AS (
    SELECT (ss.starts_at AT TIME ZONE 'Europe/Prague')::date AS day,
           sum(public._net_hours(extract(epoch FROM (ss.ends_at - ss.starts_at)) / 3600.0)) AS h
      FROM public.scheduled_shifts ss
     WHERE ss.user_id = p_user
       AND (ss.starts_at AT TIME ZONE 'Europe/Prague')::date BETWEEN p_from AND p_to
     GROUP BY 1
  )
  SELECT COALESCE(sum(
           CASE WHEN p.h > 0 THEN p.h
                WHEN extract(isodow FROM d.day) <= 5
                     AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = d.day)
                  THEN public._weekly_hours(p_user) / 5
                ELSE 0 END), 0)::numeric(7,2)
    FROM days d LEFT JOIN planned p ON p.day = d.day
$$;

-- Existing rows get their hours once, before the trigger exists (the rota of
-- approved leave is already cleared, so those count weekdays × weekly/5).
DROP TRIGGER IF EXISTS time_off_hours ON public.time_off;
UPDATE public.time_off SET hours = public._leave_hours(user_id, starts_on, ends_on), hours_auto = true WHERE hours IS NULL;

CREATE OR REPLACE FUNCTION public.time_off_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_enabled text[];
BEGIN
  -- Members may request only the kinds their organization offers (deciders: any).
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NEW.user_id = auth.uid()
     AND NOT public.is_superadmin() AND NOT public.has_permission('requests', 'write') THEN
    SELECT enabled_kinds INTO v_enabled FROM public.org_leave_settings WHERE organization_id = NEW.organization_id;
    v_enabled := COALESCE(v_enabled, ARRAY['vacation', 'sick', 'ocr', 'comp_time', 'unpaid', 'doctor', 'other']);
    IF NOT NEW.kind = ANY (v_enabled) THEN
      RAISE EXCEPTION 'TIMEOFF_KIND_DISABLED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.hours IS NULL THEN
      NEW.hours_auto := true;
      NEW.hours := public._leave_hours(NEW.user_id, NEW.starts_on, NEW.ends_on);
    ELSE
      NEW.hours_auto := false;
      IF NEW.hours > 24 * (NEW.ends_on - NEW.starts_on + 1) THEN
        RAISE EXCEPTION 'TIMEOFF_HOURS' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NEW.hours IS DISTINCT FROM OLD.hours THEN
    NEW.hours_auto := NEW.hours IS NULL;
    IF NEW.hours IS NULL THEN NEW.hours := public._leave_hours(NEW.user_id, NEW.starts_on, NEW.ends_on); END IF;
  ELSIF NEW.hours_auto AND (
          NEW.starts_on IS DISTINCT FROM OLD.starts_on OR NEW.ends_on IS DISTINCT FROM OLD.ends_on
          OR (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')) THEN
    -- Approval: the rota may have been planned since the request (the AFTER
    -- trigger clears those shifts only after this runs).
    NEW.hours := public._leave_hours(NEW.user_id, NEW.starts_on, NEW.ends_on);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.time_off_hours() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS time_off_hours ON public.time_off;
CREATE TRIGGER time_off_hours BEFORE INSERT OR UPDATE ON public.time_off
  FOR EACH ROW EXECUTE FUNCTION public.time_off_hours();

-- Hours clocked on public holidays (net), all time.
CREATE OR REPLACE FUNCTION public._holiday_hours_worked(p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(
           overlap * public._net_hours(gross) / nullif(gross, 0)), 0)::numeric(8,2)
    FROM (
      SELECT extract(epoch FROM (least(s.ended_at, (h.holiday_date + 1)::timestamp AT TIME ZONE 'Europe/Prague')
                                 - greatest(s.started_at, h.holiday_date::timestamp AT TIME ZONE 'Europe/Prague'))) / 3600.0 AS overlap,
             extract(epoch FROM (s.ended_at - s.started_at)) / 3600.0 AS gross
        FROM public.shifts s
        JOIN public.public_holidays h
          ON s.started_at < (h.holiday_date + 1)::timestamp AT TIME ZONE 'Europe/Prague'
         AND s.ended_at   > h.holiday_date::timestamp AT TIME ZONE 'Europe/Prague'
       WHERE s.user_id = p_user AND s.ended_at IS NOT NULL
    ) x
   WHERE overlap > 0
$$;

-- --- 4. Balances ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_balances(p_year integer DEFAULT NULL)
RETURNS TABLE (
  user_id uuid, name text, weekly_hours numeric, vacation_entitlement numeric, vacation_custom boolean,
  vacation_adjust numeric, vacation_used numeric, vacation_pending numeric, vacation_left numeric,
  comp_earned numeric, comp_adjust numeric, comp_used numeric, comp_pending numeric, comp_left numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_org   uuid := public.get_my_org_id();
  v_year  integer := COALESCE(p_year, extract(year FROM (now() AT TIME ZONE 'Europe/Prague'))::int);
  v_all   boolean := public.is_superadmin() OR public.has_permission('requests', 'read');
  v_set   public.org_leave_settings;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO v_set FROM public.org_leave_settings WHERE organization_id = v_org;
  RETURN QUERY
  WITH people AS (
    SELECT p.id, public._display_name(p.id) AS name,
           public._weekly_hours(p.id) AS wk,
           ml.vacation_hours AS custom
      FROM public.profiles p
      LEFT JOIN public.member_leave ml ON ml.user_id = p.id
     WHERE p.organization_id = v_org AND p.role <> 'Superadmin'
       AND (v_all OR p.id = v_me)
  ), b AS (
    SELECT pe.id, pe.name, pe.wk,
           COALESCE(pe.custom, pe.wk * COALESCE(v_set.vacation_weeks, 4)) AS ent,
           pe.custom IS NOT NULL AS is_custom,
           COALESCE((SELECT sum(a.hours) FROM public.leave_adjustments a
                      WHERE a.user_id = pe.id AND a.bucket = 'vacation' AND a.year = v_year), 0) AS v_adj,
           COALESCE((SELECT sum(t.hours) FROM public.time_off t
                      WHERE t.user_id = pe.id AND t.kind = 'vacation' AND t.status = 'approved'
                        AND extract(year FROM t.starts_on) = v_year), 0) AS v_used,
           COALESCE((SELECT sum(t.hours) FROM public.time_off t
                      WHERE t.user_id = pe.id AND t.kind = 'vacation' AND t.status = 'pending'
                        AND extract(year FROM t.starts_on) = v_year), 0) AS v_pend,
           CASE WHEN COALESCE(v_set.holiday_comp_time, true) THEN public._holiday_hours_worked(pe.id) ELSE 0 END AS c_earn,
           COALESCE((SELECT sum(a.hours) FROM public.leave_adjustments a
                      WHERE a.user_id = pe.id AND a.bucket = 'comp_time'), 0) AS c_adj,
           COALESCE((SELECT sum(t.hours) FROM public.time_off t
                      WHERE t.user_id = pe.id AND t.kind = 'comp_time' AND t.status = 'approved'), 0) AS c_used,
           COALESCE((SELECT sum(t.hours) FROM public.time_off t
                      WHERE t.user_id = pe.id AND t.kind = 'comp_time' AND t.status = 'pending'), 0) AS c_pend
      FROM people pe
  )
  SELECT b.id, b.name, b.wk, b.ent, b.is_custom, b.v_adj, b.v_used, b.v_pend,
         (b.ent + b.v_adj - b.v_used)::numeric,
         b.c_earn, b.c_adj, b.c_used, b.c_pend,
         (b.c_earn + b.c_adj - b.c_used)::numeric
    FROM b
   ORDER BY b.name;
END;
$$;
REVOKE ALL ON FUNCTION public.leave_balances(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_balances(integer) TO authenticated;

-- --- 5. Writes ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_org_leave_settings(
  p_enabled_kinds text[], p_weekly_hours numeric, p_vacation_weeks numeric, p_holiday_comp_time boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.get_my_org_id();
BEGIN
  IF NOT (public.is_superadmin() OR public.has_permission('requests', 'write')) OR v_org IS NULL THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.org_leave_settings AS s (organization_id, enabled_kinds, weekly_hours, vacation_weeks, holiday_comp_time)
  VALUES (v_org, (SELECT array_agg(DISTINCT k) FROM unnest(p_enabled_kinds) k), p_weekly_hours, p_vacation_weeks, p_holiday_comp_time)
  ON CONFLICT (organization_id) DO UPDATE
     SET enabled_kinds = EXCLUDED.enabled_kinds, weekly_hours = EXCLUDED.weekly_hours,
         vacation_weeks = EXCLUDED.vacation_weeks, holiday_comp_time = EXCLUDED.holiday_comp_time, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_org_leave_settings(text[], numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_leave_settings(text[], numeric, numeric, boolean) TO authenticated;

-- The member's org, if the caller may decide their requests (never for oneself).
CREATE OR REPLACE FUNCTION public._leave_manageable_org(p_user uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = p_user;
  IF v_org IS NULL OR NOT public.can_review_request(p_user, v_org) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public._leave_manageable_org(uuid) FROM PUBLIC, anon, authenticated;

-- Weekly hours and the yearly vacation entitlement of one member (NULL = org default).
CREATE OR REPLACE FUNCTION public.set_member_leave(p_user uuid, p_weekly_hours numeric, p_vacation_hours numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public._leave_manageable_org(p_user);
BEGIN
  INSERT INTO public.member_leave AS m (user_id, organization_id, weekly_hours, vacation_hours)
  VALUES (p_user, v_org, p_weekly_hours, p_vacation_hours)
  ON CONFLICT (user_id) DO UPDATE
     SET weekly_hours = EXCLUDED.weekly_hours, vacation_hours = EXCLUDED.vacation_hours,
         organization_id = EXCLUDED.organization_id, updated_at = now();
  INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, action, details)
  VALUES (v_org, NULL, auth.uid(), NULL, 'leave_settings_changed', jsonb_build_object(
    'actor_name', public._display_name(auth.uid()), 'target_name', public._display_name(p_user),
    'weekly_hours', p_weekly_hours, 'vacation_hours', p_vacation_hours));
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_leave(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_leave(uuid, numeric, numeric) TO authenticated;

-- +/− hours on a balance: carry-over, a correction, náhradní volno paid out instead.
CREATE OR REPLACE FUNCTION public.add_leave_adjustment(p_user uuid, p_bucket text, p_hours numeric, p_note text DEFAULT NULL, p_year integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public._leave_manageable_org(p_user);
  v_id  uuid;
  v_year integer := CASE WHEN p_bucket = 'vacation'
                         THEN COALESCE(p_year, extract(year FROM (now() AT TIME ZONE 'Europe/Prague'))::int) END;
BEGIN
  INSERT INTO public.leave_adjustments (organization_id, user_id, bucket, year, hours, note, created_by)
  VALUES (v_org, p_user, p_bucket, v_year, p_hours, NULLIF(left(btrim(COALESCE(p_note, '')), 200), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, action, details)
  VALUES (v_org, NULL, auth.uid(), NULL, 'leave_adjusted', jsonb_build_object(
    'actor_name', public._display_name(auth.uid()), 'target_name', public._display_name(p_user),
    'bucket', p_bucket, 'hours', p_hours, 'year', v_year, 'note', NULLIF(btrim(COALESCE(p_note, '')), '')));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.add_leave_adjustment(uuid, text, numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_leave_adjustment(uuid, text, numeric, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_leave_adjustment(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.leave_adjustments WHERE id = p_id;
  IF v_user IS NULL THEN RETURN; END IF;
  PERFORM public._leave_manageable_org(v_user);
  DELETE FROM public.leave_adjustments WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_leave_adjustment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_leave_adjustment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._net_hours(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._weekly_hours(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leave_hours(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._holiday_hours_worked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._net_hours(numeric) TO authenticated, service_role;

-- --- 6. Public holidays 2028–2035 ----------------------------------------------------------
DO $$
DECLARE
  y int; a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mo int; dy int;
  easter date;
BEGIN
  FOR y IN 2028..2035 LOOP
    -- Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
    a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4;
    f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
    i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
    m := (a + 11 * h + 22 * l) / 451;
    mo := (h + l - 7 * m + 114) / 31; dy := ((h + l - 7 * m + 114) % 31) + 1;
    easter := make_date(y, mo, dy);
    INSERT INTO public.public_holidays (holiday_date, name_cs, name_en, country) VALUES
      (make_date(y, 1, 1),   'Den obnovy samostatného českého státu / Nový rok', 'Restoration Day / New Year''s Day', 'CZ'),
      (easter - 2,           'Velký pátek', 'Good Friday', 'CZ'),
      (easter + 1,           'Velikonoční pondělí', 'Easter Monday', 'CZ'),
      (make_date(y, 5, 1),   'Svátek práce', 'Labour Day', 'CZ'),
      (make_date(y, 5, 8),   'Den vítězství', 'Victory Day', 'CZ'),
      (make_date(y, 7, 5),   'Den slovanských věrozvěstů Cyrila a Metoděje', 'Saints Cyril and Methodius Day', 'CZ'),
      (make_date(y, 7, 6),   'Den upálení mistra Jana Husa', 'Jan Hus Day', 'CZ'),
      (make_date(y, 9, 28),  'Den české státnosti', 'Czech Statehood Day', 'CZ'),
      (make_date(y, 10, 28), 'Den vzniku samostatného československého státu', 'Independent Czechoslovak State Day', 'CZ'),
      (make_date(y, 11, 17), 'Den boje za svobodu a demokracii', 'Struggle for Freedom and Democracy Day', 'CZ'),
      (make_date(y, 12, 24), 'Štědrý den', 'Christmas Eve', 'CZ'),
      (make_date(y, 12, 25), '1. svátek vánoční', 'Christmas Day', 'CZ'),
      (make_date(y, 12, 26), '2. svátek vánoční', 'St. Stephen''s Day', 'CZ')
    ON CONFLICT (holiday_date) DO NOTHING;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
