-- =============================================================================
-- SHIFT REMINDERS + MANAGER MORNING DIGEST
-- -----------------------------------------------------------------------------
-- Same pipeline as the late alerts (20260704150000): pg_cron writes audit rows
-- that TARGET a person → the audit webhook → send-push (push + Telegram) and
-- the in-app bell. Nothing here sends anything itself.
--
-- 1. shift_reminder — "Your shift starts at 08:00 · U Mostu", once per shift,
--    when a published timed shift starts within the next hour and the member
--    hasn't clocked in yet. Moving the shift's start re-arms it.
-- 2. daily_digest — at 07:00 Prague time, each admin of an organization gets
--    today's numbers: shifts, people on, unclaimed open shifts, requests
--    waiting. Only when there is something to say; once per person per day.
-- Both are notification-only: the Activity Log hides them (client filter).
-- =============================================================================

-- --- 1. One hour before the shift ---------------------------------------------------
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS reminder_notified boolean NOT NULL DEFAULT false;

-- A new start time deserves a new reminder.
CREATE OR REPLACE FUNCTION public.rearm_shift_reminder() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    NEW.reminder_notified := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rearm_shift_reminder ON public.scheduled_shifts;
CREATE TRIGGER rearm_shift_reminder BEFORE UPDATE OF starts_at ON public.scheduled_shifts
  FOR EACH ROW EXECUTE FUNCTION public.rearm_shift_reminder();

CREATE OR REPLACE FUNCTION public.send_shift_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r   RECORD;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT ss.id, ss.user_id, ss.organization_id, ss.starts_at, ss.ends_at, l.name AS location_name
      FROM public.scheduled_shifts ss
      JOIN public.profiles p ON p.id = ss.user_id AND p.organization_id = ss.organization_id
      LEFT JOIN public.locations l ON l.id = ss.location_id
     WHERE ss.published
       AND NOT ss.all_day
       AND NOT ss.reminder_notified
       AND ss.starts_at > now()
       AND ss.starts_at <= now() + interval '60 minutes'
       AND NOT EXISTS (                       -- already clocked in (early)? no reminder
         SELECT 1 FROM public.shifts s
          WHERE s.user_id = ss.user_id AND s.ended_at IS NULL)
     FOR UPDATE OF ss SKIP LOCKED
  LOOP
    INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, subject_id, action, details)
    VALUES (r.organization_id, NULL, NULL, r.user_id, r.user_id, 'shift_reminder',
            jsonb_strip_nulls(jsonb_build_object(
              'location_name', r.location_name,
              'scheduled_start', r.starts_at,
              'scheduled_end', r.ends_at)));
    UPDATE public.scheduled_shifts SET reminder_notified = true WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_shift_reminders() FROM PUBLIC, anon, authenticated;

-- --- 2. Morning digest for admins ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_digest_sent (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.daily_digest_sent ENABLE ROW LEVEL SECURITY;   -- no policies: server only
REVOKE ALL ON public.daily_digest_sent FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_digest_sent TO service_role;

-- p_force: send now whatever the hour (manual runs / tests). Returns how many were sent.
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
    SELECT count(*), count(DISTINCT user_id) INTO v_shifts, v_people
      FROM public.scheduled_shifts
     WHERE organization_id = o.id AND published AND starts_at < v_to AND ends_at > v_from;
    SELECT count(*) INTO v_open
      FROM public.open_shifts
     WHERE organization_id = o.id AND claimed_by IS NULL AND starts_at < v_to AND ends_at > now();
    SELECT (SELECT count(*) FROM public.time_off WHERE organization_id = o.id AND status = 'pending')
         + (SELECT count(*) FROM public.shift_swaps WHERE organization_id = o.id AND status = 'taken')
         + (SELECT count(*) FROM public.name_change_requests WHERE organization_id = o.id AND status = 'pending')
         + (SELECT count(*) FROM public.member_requests WHERE organization_id = o.id AND status = 'pending')
      INTO v_req;

    CONTINUE WHEN v_shifts = 0 AND v_open = 0 AND v_req = 0;

    FOR a IN
      SELECT p.id FROM public.profiles p
       WHERE p.organization_id = o.id AND public.role_rank(p.role) >= 30 AND p.role <> 'Superadmin'
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

-- --- Schedules (idempotent) ------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shift-reminders') THEN PERFORM cron.unschedule('shift-reminders'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest') THEN PERFORM cron.unschedule('daily-digest'); END IF;
END
$do$;
SELECT cron.schedule('shift-reminders', '*/5 * * * *', 'SELECT public.send_shift_reminders();');
-- Hourly; the function only acts at 07:xx Prague time (handles summer / winter time).
SELECT cron.schedule('daily-digest', '2 * * * *', 'SELECT public.send_daily_digests();');
