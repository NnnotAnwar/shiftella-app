-- =============================================================================
-- IN-APP FEEDBACK — app_feedback + owner alert
-- -----------------------------------------------------------------------------
-- • app_feedback — what users send from "Send feedback" (idea / bug / question /
--   praise) with the context the app attaches (route, version, language, UA).
--   A user inserts and reads their own rows; the platform Superadmin
--   (is_superadmin()) reads all of them and sets status new / seen / done.
-- • BEFORE INSERT (trusted fields): user_id, organization_id, status and
--   created_at come from the server, never from the client; context strings are
--   trimmed to size; at most 20 messages per user per hour.
-- • AFTER INSERT (owner alert): writes a `feedback_new` audit row for every
--   Superadmin. That reuses the existing pipeline: shift_audit_log INSERT →
--   notify_shift_updates webhook → send-push → push + the Superadmin's linked
--   Telegram chat (@shiftella_bot) + the in-app bell. No new secret, webhook or
--   function. Rate limit: one alert per sender per hour (notified_at); later
--   messages within the hour are stored but don't alert again.
--   `feedback_new` is notification-only: the Activity Log hides it.
-- • Grants follow docs/db-security.md: both trigger functions are revoked from
--   everyone but service_role. No client RPCs are added.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('idea', 'bug', 'question', 'praise')),
  message         text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000),
  may_contact     boolean NOT NULL DEFAULT false,
  route           text,
  app_version     text,
  language        text,
  user_agent      text,
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'done')),
  notified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One index per FK column (docs/db-security.md) + the inbox order.
CREATE INDEX IF NOT EXISTS app_feedback_user_idx ON public.app_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_feedback_org_idx ON public.app_feedback (organization_id);
CREATE INDEX IF NOT EXISTS app_feedback_status_idx ON public.app_feedback (status, created_at DESC);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

-- --- RLS ------------------------------------------------------------------------
DROP POLICY IF EXISTS app_feedback_select ON public.app_feedback;
CREATE POLICY app_feedback_select ON public.app_feedback FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_superadmin()));

DROP POLICY IF EXISTS app_feedback_insert ON public.app_feedback;
CREATE POLICY app_feedback_insert ON public.app_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Only the Superadmin changes a row, and only its status (column grant below).
DROP POLICY IF EXISTS app_feedback_update ON public.app_feedback;
CREATE POLICY app_feedback_update ON public.app_feedback FOR UPDATE TO authenticated
  USING ((SELECT public.is_superadmin())) WITH CHECK ((SELECT public.is_superadmin()));

REVOKE ALL ON public.app_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_feedback TO authenticated;
GRANT INSERT (kind, message, may_contact, route, app_version, language, user_agent) ON public.app_feedback TO authenticated;
GRANT UPDATE (status) ON public.app_feedback TO authenticated;
GRANT ALL ON public.app_feedback TO service_role;

-- --- BEFORE INSERT: trusted fields + submit limit --------------------------------
CREATE OR REPLACE FUNCTION public._app_feedback_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  -- Service role / SQL editor inserts keep the user_id they pass.
  IF v_uid IS NOT NULL THEN NEW.user_id := v_uid; END IF;
  IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege'; END IF;

  IF (SELECT count(*) FROM public.app_feedback
       WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'feedback_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  NEW.organization_id := (SELECT organization_id FROM public.profiles WHERE id = NEW.user_id);
  NEW.message     := btrim(NEW.message);
  NEW.route       := NULLIF(left(btrim(NEW.route), 300), '');
  NEW.app_version := NULLIF(left(btrim(NEW.app_version), 40), '');
  NEW.language    := NULLIF(left(btrim(NEW.language), 10), '');
  NEW.user_agent  := NULLIF(left(btrim(NEW.user_agent), 400), '');
  NEW.status      := 'new';
  NEW.created_at  := now();
  NEW.updated_at  := now();
  -- One owner alert per sender per hour.
  NEW.notified_at := CASE WHEN EXISTS (
      SELECT 1 FROM public.app_feedback
       WHERE user_id = NEW.user_id AND notified_at > now() - interval '1 hour')
    THEN NULL ELSE now() END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._app_feedback_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_feedback_before_insert ON public.app_feedback;
CREATE TRIGGER app_feedback_before_insert
  BEFORE INSERT ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public._app_feedback_before_insert();

-- --- BEFORE UPDATE: keep updated_at fresh ---------------------------------------
CREATE OR REPLACE FUNCTION public._app_feedback_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._app_feedback_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_feedback_touch ON public.app_feedback;
CREATE TRIGGER app_feedback_touch
  BEFORE UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public._app_feedback_touch();

-- --- AFTER INSERT: alert the Superadmin(s) through the audit-log pipeline --------
-- Each alert row lives in the Superadmin's own organization (shift_audit_log
-- needs one; send-push's plan gate reads it). A Superadmin without an
-- organization gets no alert, never a row in someone else's organization.
CREATE OR REPLACE FUNCTION public._app_feedback_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a     record;
  v_det jsonb;
BEGIN
  IF NEW.notified_at IS NULL THEN RETURN NULL; END IF;
  v_det := jsonb_build_object(
    'feedback_id', NEW.id,
    'kind', NEW.kind,
    'target_name', public._display_name(NEW.user_id),
    'subject_name', (SELECT name FROM public.organizations WHERE id = NEW.organization_id),
    'note', CASE WHEN char_length(NEW.message) > 140 THEN left(NEW.message, 139) || '…' ELSE NEW.message END);
  FOR a IN
    SELECT p.id, p.organization_id FROM public.profiles p
     WHERE p.role = 'Superadmin' AND p.organization_id IS NOT NULL AND p.id <> NEW.user_id
  LOOP
    INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, subject_id, action, details)
    VALUES (a.organization_id, NULL, NULL, a.id, a.id, 'feedback_new', v_det);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._app_feedback_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_feedback_notify ON public.app_feedback;
CREATE TRIGGER app_feedback_notify
  AFTER INSERT ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public._app_feedback_notify();

-- --- Keep the alert private ---------------------------------------------------------
-- feedback_new rows sit in the Superadmin's own organization (the audit pipeline
-- needs one), so the org-wide "activity read" branch must not see them: they
-- carry another customer's name, organization and message excerpt. Only the
-- Superadmin (and the row's target, which is the Superadmin) reads them.
DROP POLICY IF EXISTS sal_select ON public.shift_audit_log;
CREATE POLICY sal_select ON public.shift_audit_log FOR SELECT TO authenticated
USING (
  (SELECT public.is_superadmin())
  OR target_user_id = (SELECT auth.uid())
  OR ((SELECT public.has_permission('activity', 'read'))
      AND organization_id = public.get_my_org_id()
      AND action <> 'feedback_new'
      AND (details->>'kind' IS DISTINCT FROM 'complaint'
           OR action NOT LIKE 'request\_%'
           OR (SELECT public.has_permission('requests', 'write'))))
);
