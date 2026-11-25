-- =============================================================================
-- CLOCK-IN / CLOCK-OUT USE THE SERVER'S TIME
-- -----------------------------------------------------------------------------
-- Security review 2026-11-25: members write their own `shifts` rows directly
-- (RLS: own rows, own org) and the client sent `started_at` / `ended_at` from
-- the phone's clock. A member could clock in "earlier" by moving the phone's
-- clock, or stretch any finished shift through the API — and edits of a
-- finished shift never reached the Activity Log.
--
-- This trigger takes the times out of the client's hands for a member's own
-- direct writes (the statement runs as the `authenticated` role):
--   • INSERT  → started_at = now(), ended_at = NULL (always an open shift);
--   • UPDATE  → started_at, user and organization never change; ending a shift
--               stamps ended_at = now(); a finished shift can't be changed.
-- Untouched: managers' edits through the SECURITY DEFINER RPCs
-- (admin_create_shift / admin_update_shift run as the function owner, and they
-- audit), the Superadmin, and server jobs (auto_end_open_shifts via pg_cron).
-- Changing location during an open shift keeps working.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shifts_server_clock() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Only a member's own direct write (PostgREST runs it as `authenticated`).
  IF current_user <> 'authenticated' OR public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.started_at := now();
    NEW.ended_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'A finished shift can only be changed by a manager.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.started_at := OLD.started_at;
  NEW.user_id := OLD.user_id;
  NEW.organization_id := OLD.organization_id;
  IF NEW.ended_at IS NOT NULL THEN
    NEW.ended_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.shifts_server_clock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shifts_server_clock ON public.shifts;
CREATE TRIGGER shifts_server_clock BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_server_clock();
