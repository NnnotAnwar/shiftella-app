-- =============================================================================
-- EMPLOYEE DOCUMENTS — contracts, health certificates, trainings + expiry
-- reminders (approved roadmap, "Next").
-- -----------------------------------------------------------------------------
-- • member_documents      — one row per file: type, name, optional valid_until,
--                           who uploaded it. The file itself lives in the
--                           private Storage bucket `member-documents` at
--                           <organization_id>/<user_id>/<document_id>.<ext>.
-- • Who sees / does what (table and Storage policies say the same thing):
--     read    the member themself; people with Team VIEW (members.read) over
--             members below them in the hierarchy (same rule as wages).
--     upload  the member themself; Team CHANGE (members.write) over members
--             below them.
--     delete  the member, for files they uploaded themselves; Team DELETE
--             (members.delete) over members below them.
--   Superadmin passes everything. Downloads go through short signed URLs.
-- • document_uploaded / document_deleted land in the Activity Log (subject =
--   the member) — never the file's content.
-- • send_document_expiry_reminders(): daily at 07:xx Prague, 30 / 7 / 0 days
--   before valid_until (and once after it, catching up missed days), writes a
--   `document_expiring` audit row for the member and for everyone with Team
--   CHANGE above them → webhook → send-push (push + Telegram) + the bell.
-- • GDPR: rows cascade with the profile; the delete-employee / delete-account
--   Edge Functions remove the files (Storage can't be emptied from SQL).
-- =============================================================================

-- --- 1. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN ('contract', 'agreement', 'health_card', 'food_card', 'safety_training', 'other')),
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  file_path       text NOT NULL UNIQUE,
  mime_type       text,
  size_bytes      integer CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 10485760),
  valid_until     date,
  uploaded_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_documents_user_idx ON public.member_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_documents_org_idx ON public.member_documents (organization_id);
CREATE INDEX IF NOT EXISTS member_documents_expiry_idx ON public.member_documents (valid_until) WHERE valid_until IS NOT NULL;

-- Server-side truth for the organization, uploader and the file's place.
CREATE OR REPLACE FUNCTION public.member_documents_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only the label and the date may change; the file stays where it is.
    NEW.organization_id := OLD.organization_id;
    NEW.user_id := OLD.user_id;
    NEW.file_path := OLD.file_path;
    NEW.uploaded_by := OLD.uploaded_by;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = NEW.user_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'This member has no organization.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.organization_id := v_org;
  NEW.uploaded_by := COALESCE(auth.uid(), NEW.uploaded_by);
  NEW.name := btrim(NEW.name);
  IF NEW.file_path NOT LIKE v_org::text || '/' || NEW.user_id::text || '/%' THEN
    RAISE EXCEPTION 'The file must sit in the member''s folder.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.member_documents_before_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS member_documents_before_write ON public.member_documents;
CREATE TRIGGER member_documents_before_write BEFORE INSERT OR UPDATE ON public.member_documents
  FOR EACH ROW EXECUTE FUNCTION public.member_documents_before_write();

-- --- 2. Access rule (shared by the table and Storage) ---------------------------------
-- p_action: 'read' | 'write' | 'delete'. p_uploader is only used for 'delete'
-- (a member may delete what they uploaded themselves).
CREATE OR REPLACE FUNCTION public.can_access_member_documents(p_user uuid, p_org uuid, p_action text, p_uploader uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_user IS NULL OR p_org IS NULL THEN false
    WHEN public.is_superadmin() THEN true
    WHEN p_org IS DISTINCT FROM public.get_my_org_id() THEN false
    WHEN p_user = auth.uid() THEN
      p_action IN ('read', 'write') OR (p_action = 'delete' AND p_uploader = auth.uid())
    ELSE
      public.has_permission('members', p_action) AND public.is_my_subordinate(p_user)
  END;
$$;
REVOKE ALL ON FUNCTION public.can_access_member_documents(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_member_documents(uuid, uuid, text, uuid) TO authenticated;

ALTER TABLE public.member_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_documents TO authenticated;

DROP POLICY IF EXISTS member_documents_select ON public.member_documents;
CREATE POLICY member_documents_select ON public.member_documents FOR SELECT TO authenticated
  USING ((SELECT public.can_access_member_documents(user_id, organization_id, 'read')));
DROP POLICY IF EXISTS member_documents_insert ON public.member_documents;
CREATE POLICY member_documents_insert ON public.member_documents FOR INSERT TO authenticated
  -- organization_id is already the member's own here (the BEFORE trigger ran).
  WITH CHECK ((SELECT public.can_access_member_documents(user_id, organization_id, 'write')));
DROP POLICY IF EXISTS member_documents_update ON public.member_documents;
CREATE POLICY member_documents_update ON public.member_documents FOR UPDATE TO authenticated
  USING ((SELECT public.can_access_member_documents(user_id, organization_id, 'write')))
  WITH CHECK ((SELECT public.can_access_member_documents(user_id, organization_id, 'write')));
DROP POLICY IF EXISTS member_documents_delete ON public.member_documents;
CREATE POLICY member_documents_delete ON public.member_documents FOR DELETE TO authenticated
  USING ((SELECT public.can_access_member_documents(user_id, organization_id, 'delete', uploaded_by)));

-- --- 3. Storage: private bucket + matching policies ------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-documents', 'member-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- "<org>/<user>/<file>" → may the caller do p_action there? Bad paths → false.
CREATE OR REPLACE FUNCTION public.can_access_member_document_path(p_name text, p_action text, p_owner text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parts text[] := string_to_array(p_name, '/');
  v_org   uuid;
  v_user  uuid;
BEGIN
  IF array_length(v_parts, 1) IS DISTINCT FROM 3 OR coalesce(v_parts[3], '') = '' THEN RETURN false; END IF;
  BEGIN
    v_org := v_parts[1]::uuid;
    v_user := v_parts[2]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  -- The member must really belong to that organization.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND organization_id = v_org) THEN
    RETURN public.is_superadmin();
  END IF;
  RETURN public.can_access_member_documents(v_user, v_org, p_action,
           CASE WHEN p_owner IS NOT NULL AND p_owner ~ '^[0-9a-fA-F-]{36}$' THEN p_owner::uuid END);
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_member_document_path(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_member_document_path(text, text, text) TO authenticated;

DROP POLICY IF EXISTS member_documents_objects_select ON storage.objects;
CREATE POLICY member_documents_objects_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-documents' AND public.can_access_member_document_path(name, 'read'));
DROP POLICY IF EXISTS member_documents_objects_insert ON storage.objects;
CREATE POLICY member_documents_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-documents' AND public.can_access_member_document_path(name, 'write'));
DROP POLICY IF EXISTS member_documents_objects_delete ON storage.objects;
CREATE POLICY member_documents_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-documents' AND public.can_access_member_document_path(name, 'delete', owner_id));
-- No UPDATE policy: files are never overwritten (a new version is a new upload).

-- --- 4. Activity Log ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_member_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Profile deletions cascade here (auth.uid() is NULL for the service role):
  -- the member_removed / member_left entry already says it.
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit(NEW.organization_id, 'document_uploaded', NEW.user_id,
      jsonb_build_object('doc_type', NEW.doc_type, 'subject_name', NEW.name, 'valid_until', NEW.valid_until));
  ELSE
    PERFORM public._audit(OLD.organization_id, 'document_deleted', OLD.user_id,
      jsonb_build_object('doc_type', OLD.doc_type, 'subject_name', OLD.name, 'valid_until', OLD.valid_until));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_member_document() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_member_document ON public.member_documents;
CREATE TRIGGER audit_member_document AFTER INSERT OR DELETE ON public.member_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_member_document();

-- --- 5. Expiry reminders ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_document_reminders (
  document_id uuid NOT NULL REFERENCES public.member_documents(id) ON DELETE CASCADE,
  stage       smallint NOT NULL CHECK (stage IN (30, 7, 0)),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, stage)
);
ALTER TABLE public.member_document_reminders ENABLE ROW LEVEL SECURITY;   -- no policies: server only
REVOKE ALL ON public.member_document_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.member_document_reminders TO service_role;

-- A new date deserves new reminders.
CREATE OR REPLACE FUNCTION public.rearm_document_reminders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    DELETE FROM public.member_document_reminders WHERE document_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.rearm_document_reminders() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rearm_document_reminders ON public.member_documents;
CREATE TRIGGER rearm_document_reminders AFTER UPDATE OF valid_until ON public.member_documents
  FOR EACH ROW EXECUTE FUNCTION public.rearm_document_reminders();

-- Days left → the reminder it is due for: 30 (≤ 30 days), 7 (≤ 7), 0 (today or
-- up to 3 days late — the job may have missed a morning). NULL = nothing due.
CREATE OR REPLACE FUNCTION public.document_reminder_stage(p_days integer)
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_days IS NULL OR p_days > 30 OR p_days < -3 THEN NULL
    WHEN p_days <= 0 THEN 0
    WHEN p_days <= 7 THEN 7
    ELSE 30
  END::smallint;
$$;

-- p_force: run now whatever the hour (manual runs / tests). Returns rows written.
CREATE OR REPLACE FUNCTION public.send_document_expiry_reminders(p_force boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_local timestamp := now() AT TIME ZONE 'Europe/Prague';
  v_today date := v_local::date;
  d       RECORD;
  v_rank  smallint;
  v_n     integer := 0;
  v_det   jsonb;
  a       RECORD;
BEGIN
  IF NOT p_force AND extract(hour FROM v_local) <> 7 THEN RETURN 0; END IF;

  FOR d IN
    SELECT md.*, (md.valid_until - v_today) AS days_left,
           public.document_reminder_stage(md.valid_until - v_today) AS stage
      FROM public.member_documents md
      JOIN public.profiles p ON p.id = md.user_id AND p.organization_id = md.organization_id
     WHERE md.valid_until IS NOT NULL
       AND public.document_reminder_stage(md.valid_until - v_today) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.member_document_reminders r
                        WHERE r.document_id = md.id
                          AND r.stage <= public.document_reminder_stage(md.valid_until - v_today))
     FOR UPDATE OF md SKIP LOCKED
  LOOP
    INSERT INTO public.member_document_reminders (document_id, stage) VALUES (d.id, d.stage) ON CONFLICT DO NOTHING;
    CONTINUE WHEN NOT FOUND;

    v_det := jsonb_build_object(
      'document_id', d.id, 'doc_type', d.doc_type, 'subject_name', d.name,
      'valid_until', d.valid_until, 'days_left', d.days_left, 'stage', d.stage,
      'target_name', public._display_name(d.user_id));

    -- The member.
    INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, subject_id, action, details)
    VALUES (d.organization_id, NULL, NULL, d.user_id, d.user_id, 'document_expiring', v_det);
    v_n := v_n + 1;

    -- Everyone who manages them (Team CHANGE, above them in the hierarchy).
    v_rank := public.profile_rank(d.user_id);
    FOR a IN
      SELECT p.id FROM public.profiles p
       WHERE p.organization_id = d.organization_id
         AND p.id <> d.user_id
         AND p.role <> 'Superadmin'
         AND public.profile_rank(p.id) > v_rank
         AND public.profile_has_permission(p.id, 'members', 'write')
    LOOP
      INSERT INTO public.shift_audit_log (organization_id, shift_id, actor_id, target_user_id, subject_id, action, details)
      VALUES (d.organization_id, NULL, NULL, a.id, d.user_id, 'document_expiring', v_det);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_document_expiry_reminders(boolean) FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'document-expiry') THEN PERFORM cron.unschedule('document-expiry'); END IF;
END
$do$;
-- Hourly; the function only acts at 07:xx Prague time (handles summer / winter time).
SELECT cron.schedule('document-expiry', '4 * * * *', 'SELECT public.send_document_expiry_reminders();');
