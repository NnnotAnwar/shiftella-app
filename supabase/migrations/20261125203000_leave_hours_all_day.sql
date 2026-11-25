-- =============================================================================
-- _leave_hours: an all-day planned shift counts as one working day
-- -----------------------------------------------------------------------------
-- An all-day mark (a location without opening hours) is stored as local
-- midnight → next midnight. _leave_hours summed _net_hours(24 h) = 23 h for it,
-- so a day of leave over an all-day mark took 23 h off the vacation balance.
-- It now counts weekly hours / 5 — the same as an unplanned weekday, and the
-- same rule the rota cost uses (src/features/schedule/rotaCost.ts). Several
-- all-day marks on one day still count one day; timed shifts keep their net
-- hours and add to it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._leave_hours(p_user uuid, p_from date, p_to date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_from, p_to, interval '1 day') d
  ), planned AS (
    SELECT (ss.starts_at AT TIME ZONE 'Europe/Prague')::date AS day,
           COALESCE(sum(public._net_hours(extract(epoch FROM (ss.ends_at - ss.starts_at)) / 3600.0))
                      FILTER (WHERE NOT ss.all_day), 0)
           + CASE WHEN bool_or(ss.all_day) THEN public._weekly_hours(p_user) / 5 ELSE 0 END AS h
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
REVOKE ALL ON FUNCTION public._leave_hours(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- Recount auto-computed leave that still overlaps an all-day mark. (Approved
-- leave had its rota cleared on approval, so there is nothing left to recount.)
-- Setting hours to NULL makes the time_off_hours trigger recompute it and keep
-- hours_auto = true.
UPDATE public.time_off t
   SET hours = NULL
 WHERE t.hours_auto
   AND EXISTS (
     SELECT 1 FROM public.scheduled_shifts ss
      WHERE ss.user_id = t.user_id AND ss.all_day
        AND (ss.starts_at AT TIME ZONE 'Europe/Prague')::date BETWEEN t.starts_on AND t.ends_on);
