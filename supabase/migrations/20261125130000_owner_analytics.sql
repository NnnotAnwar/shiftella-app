-- =============================================================================
-- OWNER ANALYTICS — hours worked vs planned, labour cost, absences, lateness,
-- busy hours, overtime. One read-only RPC: org_analytics(from, to, location).
-- -----------------------------------------------------------------------------
-- Who: own organization only, for people who may read BOTH the rota and the
-- timesheets (Head Admin / Superadmin always; custom roles per their grants).
-- Anyone else gets an error and no data. Labour cost needs wages.read on top,
-- and counts only the wages that viewer may read anyway (their own +
-- subordinates', the member_wages RLS rule); hours without a readable rate are
-- reported as `uncosted_hours` instead of guessed.
--
-- Definitions (Europe/Prague days, like the rest of the database):
--   • worked   — finished clock-ins that START in the range, net of the
--                mandatory break (_net_hours, mirrors calculateNetHours()).
--   • planned  — PUBLISHED rota rows starting in the range, net. An all-day
--                mark counts the location's opening hours, else the member's
--                weekly hours / 5 (the leave rule).
--   • absences — approved time_off overlapping the range, hours pro-rated by
--                the days inside it.
--   • lateness — published timed rota rows that have ended (or been clocked
--                into): the first clock-in from 3 h before the start until the
--                end — the window check_late_shifts() uses. Minutes late are
--                bucketed like its alerts: < 15 on time, 15–59 late_15,
--                60+ late_60; no clock-in at all = no_show.
--   • heatmap  — clocked person-hours per weekday × hour, averaged over the
--                number of such weekdays in the range up to today (= people
--                on the clock).
-- Location filter: hours / rota / lateness by their location; absences of
-- people on that location's roster or who planned / worked there in range.
-- Demo data (#190: demo_batch people / rota rows) is left out of every number.
-- =============================================================================

CREATE INDEX IF NOT EXISTS shifts_org_started_idx ON public.shifts (organization_id, started_at);
CREATE INDEX IF NOT EXISTS scheduled_shifts_org_published_starts_idx
  ON public.scheduled_shifts (organization_id, starts_at) WHERE published;

CREATE OR REPLACE FUNCTION public.org_analytics(p_from date, p_to date, p_location uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_org   uuid := public.get_my_org_id();
  v_super boolean := public.is_superadmin();
  v_cost  boolean;
  v_start timestamptz;
  v_end   timestamptz;
  v_out   jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_org IS NULL OR NOT (v_super OR (public.has_permission('timesheets', 'read') AND public.has_permission('rota', 'read'))) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 370 THEN
    RAISE EXCEPTION 'ANALYTICS_RANGE' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_location IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.locations WHERE id = p_location AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_cost  := v_super OR public.has_permission('wages', 'read');
  v_start := p_from::timestamp AT TIME ZONE 'Europe/Prague';
  v_end   := (p_to + 1)::timestamp AT TIME ZONE 'Europe/Prague';

  WITH
  people AS (
    SELECT p.id, public._display_name(p.id) AS name
      FROM public.profiles p
     WHERE p.organization_id = v_org AND p.role <> 'Superadmin'
       AND p.demo_batch IS NULL                     -- sample data never counts
  ),
  -- Readable hourly rates (NULL when cost is off or the viewer may not read it).
  rates AS (
    SELECT w.user_id, w.hourly_rate, w.currency
      FROM public.member_wages w
      JOIN people pe ON pe.id = w.user_id
     WHERE v_cost AND w.organization_id = v_org
       AND (v_super OR w.user_id = v_me OR public.is_my_subordinate(w.user_id))
  ),
  worked AS (
    SELECT s.user_id, s.location_id, s.started_at, s.ended_at,
           (s.started_at AT TIME ZONE 'Europe/Prague')::date AS day,
           public._net_hours(extract(epoch FROM (s.ended_at - s.started_at)) / 3600.0) AS h
      FROM public.shifts s
      JOIN people pe ON pe.id = s.user_id
     WHERE s.organization_id = v_org
       AND s.ended_at IS NOT NULL AND s.ended_at > s.started_at
       AND s.started_at >= v_start AND s.started_at < v_end
       AND (p_location IS NULL OR s.location_id = p_location)
  ),
  planned AS (
    SELECT ss.id, ss.user_id, ss.location_id, ss.starts_at, ss.ends_at, ss.all_day,
           (ss.starts_at AT TIME ZONE 'Europe/Prague')::date AS day,
           CASE
             WHEN NOT ss.all_day THEN public._net_hours(extract(epoch FROM (ss.ends_at - ss.starts_at)) / 3600.0)
             WHEN ls.open_time IS NOT NULL AND ls.close_time IS NOT NULL THEN
               public._net_hours(CASE WHEN ls.close_time > ls.open_time
                                      THEN extract(epoch FROM (ls.close_time - ls.open_time)) / 3600.0
                                      ELSE 24 + extract(epoch FROM (ls.close_time - ls.open_time)) / 3600.0 END)
             ELSE public._weekly_hours(ss.user_id) / 5
           END AS h
      FROM public.scheduled_shifts ss
      JOIN people pe ON pe.id = ss.user_id
      LEFT JOIN public.location_settings ls ON ls.location_id = ss.location_id
     WHERE ss.organization_id = v_org AND ss.published AND ss.demo_batch IS NULL
       AND ss.starts_at >= v_start AND ss.starts_at < v_end
       AND (p_location IS NULL OR ss.location_id = p_location)
  ),
  -- People an absence counts for under a location filter.
  scope AS (
    SELECT pe.id FROM people pe
     WHERE p_location IS NULL
        OR EXISTS (SELECT 1 FROM public.location_roster r WHERE r.location_id = p_location AND r.user_id = pe.id)
        OR EXISTS (SELECT 1 FROM worked w WHERE w.user_id = pe.id)
        OR EXISTS (SELECT 1 FROM planned pl WHERE pl.user_id = pe.id)
  ),
  absences AS (
    SELECT t.user_id, t.kind,
           (least(t.ends_on, p_to) - greatest(t.starts_on, p_from) + 1) AS days,
           COALESCE(t.hours, 0) * (least(t.ends_on, p_to) - greatest(t.starts_on, p_from) + 1)::numeric
             / (t.ends_on - t.starts_on + 1) AS h
      FROM public.time_off t
      JOIN scope sc ON sc.id = t.user_id
     WHERE t.organization_id = v_org AND t.status = 'approved'
       AND t.starts_on <= p_to AND t.ends_on >= p_from
  ),
  late AS (
    SELECT x.user_id, x.first_in,
           CASE WHEN x.first_in IS NULL THEN NULL
                ELSE greatest(0, floor(extract(epoch FROM (x.first_in - x.starts_at)) / 60))::int END AS minutes
      FROM (
        SELECT pl.user_id, pl.starts_at, pl.ends_at,
               (SELECT min(s.started_at) FROM public.shifts s
                 WHERE s.user_id = pl.user_id
                   AND s.started_at >= pl.starts_at - interval '3 hours'
                   AND s.started_at < pl.ends_at
                   AND COALESCE(s.ended_at, 'infinity'::timestamptz) > pl.starts_at) AS first_in
          FROM planned pl
         WHERE NOT pl.all_day AND pl.starts_at <= now()
      ) x
     WHERE x.first_in IS NOT NULL OR x.ends_at <= now()
  ),
  late_b AS (
    SELECT user_id, minutes,
           CASE WHEN minutes IS NULL THEN 'no_show'
                WHEN minutes >= 60 THEN 'late_60'
                WHEN minutes >= 15 THEN 'late_15'
                ELSE 'on_time' END AS bucket
      FROM late
  ),
  -- Person-hours per local hour slot (a shift is capped at 24 h).
  slots AS (
    SELECT g.slot,
           extract(epoch FROM (least(g.slot + interval '1 hour', w.le) - greatest(g.slot, w.ls))) / 3600.0 AS h
      FROM (SELECT (started_at AT TIME ZONE 'Europe/Prague') AS ls,
                   least(ended_at, started_at + interval '24 hours') AT TIME ZONE 'Europe/Prague' AS le
              FROM worked) w
      CROSS JOIN LATERAL generate_series(date_trunc('hour', w.ls), w.le - interval '1 microsecond', interval '1 hour') AS g(slot)
     WHERE g.slot::date BETWEEN p_from AND p_to
  ),
  -- Weekdays elapsed so far (a running month must not be diluted by its future).
  dow_days AS (
    SELECT extract(isodow FROM d)::int AS dow, count(*) AS n
      FROM generate_series(p_from, least(p_to, (now() AT TIME ZONE 'Europe/Prague')::date), interval '1 day') d GROUP BY 1
  ),
  member_rows AS (
    SELECT pe.id AS user_id, pe.name,
           COALESCE((SELECT sum(h) FROM worked w WHERE w.user_id = pe.id), 0) AS worked,
           COALESCE((SELECT sum(h) FROM planned pl WHERE pl.user_id = pe.id), 0) AS planned,
           COALESCE((SELECT sum(h) FROM absences a WHERE a.user_id = pe.id), 0) AS absence_hours,
           (SELECT count(*) FROM late_b l WHERE l.user_id = pe.id AND l.bucket = 'on_time') AS on_time,
           (SELECT count(*) FROM late_b l WHERE l.user_id = pe.id AND l.bucket = 'late_15') AS late_15,
           (SELECT count(*) FROM late_b l WHERE l.user_id = pe.id AND l.bucket = 'late_60') AS late_60,
           (SELECT count(*) FROM late_b l WHERE l.user_id = pe.id AND l.bucket = 'no_show') AS no_show,
           (SELECT round(avg(minutes)) FROM late_b l WHERE l.user_id = pe.id AND l.minutes >= 15) AS avg_late_min,
           r.hourly_rate AS rate
      FROM people pe
      LEFT JOIN rates r ON r.user_id = pe.id
  ),
  members AS (
    SELECT * FROM member_rows
     WHERE worked > 0 OR planned > 0 OR absence_hours > 0 OR on_time + late_15 + late_60 + no_show > 0
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to, 'location_id', p_location,
    'can_cost', v_cost,
    'currency', COALESCE((SELECT mode() WITHIN GROUP (ORDER BY currency) FROM rates), 'CZK'),
    'totals', jsonb_build_object(
      'worked', round(COALESCE((SELECT sum(h) FROM worked), 0), 2),
      'planned', round(COALESCE((SELECT sum(h) FROM planned), 0), 2),
      'absence_hours', round(COALESCE((SELECT sum(h) FROM absences), 0), 2),
      'cost', CASE WHEN v_cost THEN round(COALESCE((SELECT sum(w.h * r.hourly_rate) FROM worked w JOIN rates r USING (user_id)), 0), 2) END,
      'planned_cost', CASE WHEN v_cost THEN round(COALESCE((SELECT sum(pl.h * r.hourly_rate) FROM planned pl JOIN rates r USING (user_id)), 0), 2) END,
      'uncosted_hours', CASE WHEN v_cost THEN round(COALESCE((SELECT sum(w.h) FROM worked w WHERE NOT EXISTS (SELECT 1 FROM rates r WHERE r.user_id = w.user_id)), 0), 2) END
    ),
    'days', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'day', d::date,
               'worked', round(COALESCE((SELECT sum(h) FROM worked w WHERE w.day = d::date), 0), 2),
               'planned', round(COALESCE((SELECT sum(h) FROM planned pl WHERE pl.day = d::date), 0), 2))
             ORDER BY d)
        FROM generate_series(p_from, p_to, interval '1 day') d), '[]'::jsonb),
    'locations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'location_id', x.location_id, 'name', l.name,
               'worked', round(x.worked, 2), 'planned', round(x.planned, 2),
               'cost', CASE WHEN v_cost THEN round(x.cost, 2) END)
             ORDER BY x.worked DESC, l.name)
        FROM (
          SELECT u.location_id, sum(u.worked) AS worked, sum(u.planned) AS planned, sum(u.cost) AS cost
            FROM (
              SELECT w.location_id, w.h AS worked, 0::numeric AS planned, w.h * COALESCE(r.hourly_rate, 0) AS cost
                FROM worked w LEFT JOIN rates r USING (user_id)
              UNION ALL
              SELECT pl.location_id, 0, pl.h, 0 FROM planned pl
            ) u GROUP BY u.location_id
        ) x
        LEFT JOIN public.locations l ON l.id = x.location_id), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', m.name,
               'worked', round(m.worked, 2), 'planned', round(m.planned, 2),
               'absence_hours', round(m.absence_hours, 2),
               'on_time', m.on_time, 'late_15', m.late_15, 'late_60', m.late_60, 'no_show', m.no_show,
               'avg_late_min', m.avg_late_min,
               'cost', CASE WHEN v_cost AND m.rate IS NOT NULL THEN round(m.worked * m.rate, 2) END)
             ORDER BY m.name)
        FROM members m), '[]'::jsonb),
    'absences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', a.kind, 'people', a.people, 'days', a.days, 'hours', round(a.hours, 2))
             ORDER BY a.hours DESC, a.kind)
        FROM (SELECT kind, count(DISTINCT user_id) AS people, sum(days) AS days, sum(h) AS hours
                FROM absences GROUP BY kind) a), '[]'::jsonb),
    'lateness', jsonb_build_object(
      'on_time', (SELECT count(*) FROM late_b WHERE bucket = 'on_time'),
      'late_15', (SELECT count(*) FROM late_b WHERE bucket = 'late_15'),
      'late_60', (SELECT count(*) FROM late_b WHERE bucket = 'late_60'),
      'no_show', (SELECT count(*) FROM late_b WHERE bucket = 'no_show'),
      'avg_late_min', (SELECT round(avg(minutes)) FROM late_b WHERE minutes >= 15)
    ),
    'heatmap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hour, 'people', round(h.ph / dd.n, 2))
             ORDER BY h.dow, h.hour)
        FROM (SELECT extract(isodow FROM slot)::int AS dow, extract(hour FROM slot)::int AS hour, sum(h) AS ph
                FROM slots WHERE h > 0 GROUP BY 1, 2) h
        JOIN dow_days dd ON dd.dow = h.dow), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- Client RPC (docs/db-security.md): signed-in users + service role only.
REVOKE ALL ON FUNCTION public.org_analytics(date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_analytics(date, date, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.org_analytics(date, date, uuid) IS
  'Owner analytics for the caller''s organization: hours worked vs planned, labour cost (wages.read), absences, lateness, busy hours. Needs rota.read + timesheets.read.';

NOTIFY pgrst, 'reload schema';
