-- =============================================================================
-- ANNOUNCEMENTS: AUDIENCE (location / role) + REACH FOR POSTERS
-- -----------------------------------------------------------------------------
-- An announcement could already carry a location_id, but nothing honoured it:
-- everyone in the organization saw it and got the push. Now:
--   • location_id — only people on that location's roster (location_roster);
--   • org_role_id — only people with that role (new column);
--   • both set   — people who match both; neither — the whole organization.
-- People who may post announcements (has_permission('announcements','write'))
-- and the author always see every announcement of their organization.
--
-- Reach for posters:
--   • announcement_audience_size(location, role) — "N people will see it"
--     while composing;
--   • announcement_reach(ids[]) — read / audience counts per card;
--   • announcement_readers(id)  — who has read it and who hasn't.
-- Push / Telegram fan-out: announcement_audience_ids(id) (service role).
-- =============================================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS org_role_id uuid REFERENCES public.org_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS announcements_role_idx ON public.announcements (org_role_id);

-- Is p_user one of the people an announcement with this audience is for?
CREATE OR REPLACE FUNCTION public.in_announcement_audience(p_user uuid, p_org uuid, p_location uuid, p_role uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user
       AND p.organization_id = p_org
       AND (p_role IS NULL OR p.org_role_id = p_role)
       AND (p_location IS NULL OR EXISTS (
             SELECT 1 FROM public.location_roster r WHERE r.location_id = p_location AND r.user_id = p_user)))
$$;
-- Internal: asks about ANY person, so only definer functions and the server call it.
REVOKE ALL ON FUNCTION public.in_announcement_audience(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.in_announcement_audience(uuid, uuid, uuid, uuid) TO service_role;

-- For the read policy: is the SIGNED-IN person in this audience? (asks about nobody else)
CREATE OR REPLACE FUNCTION public.am_in_announcement_audience(p_org uuid, p_location uuid, p_role uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.in_announcement_audience(auth.uid(), p_org, p_location, p_role)
$$;
REVOKE ALL ON FUNCTION public.am_in_announcement_audience(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_in_announcement_audience(uuid, uuid, uuid) TO authenticated;

-- Read: own org, and (posters / author / the audience).
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT TO authenticated
  USING (
    is_superadmin()
    OR (organization_id = get_my_org_id()
        AND ((SELECT has_permission('announcements', 'write'))
             OR author_id = (SELECT auth.uid())
             OR public.am_in_announcement_audience(organization_id, location_id, org_role_id)))
  );

-- The target location / role must belong to the announcement's organization.
CREATE OR REPLACE FUNCTION public.check_announcement_audience() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.locations WHERE id = NEW.location_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'That location is not in this organization.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.org_role_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.org_roles WHERE id = NEW.org_role_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'That role is not in this organization.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_announcement_audience() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS check_announcement_audience ON public.announcements;
CREATE TRIGGER check_announcement_audience BEFORE INSERT OR UPDATE OF location_id, org_role_id, organization_id ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.check_announcement_audience();

-- --- Reach (posters only) ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._may_see_reach(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin() OR (p_org = public.get_my_org_id() AND public.has_permission('announcements', 'write'))
$$;
REVOKE ALL ON FUNCTION public._may_see_reach(uuid) FROM PUBLIC, anon, authenticated;

-- "N people will see it" while composing (in my organization; the author excluded).
CREATE OR REPLACE FUNCTION public.announcement_audience_size(p_location uuid DEFAULT NULL, p_role uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.get_my_org_id();
BEGIN
  IF NOT public._may_see_reach(v_org) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (SELECT count(*) FROM public.profiles p
           WHERE p.organization_id = v_org AND p.id <> auth.uid()
             AND public.in_announcement_audience(p.id, v_org, p_location, p_role));
END;
$$;
REVOKE ALL ON FUNCTION public.announcement_audience_size(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_audience_size(uuid, uuid) TO authenticated;

-- Per announcement: how many of its audience (author excluded) have read it.
CREATE OR REPLACE FUNCTION public.announcement_reach(p_ids uuid[])
RETURNS TABLE (announcement_id uuid, readers integer, audience integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         (SELECT count(*)::int FROM public.profiles p
           WHERE p.organization_id = a.organization_id AND p.id IS DISTINCT FROM a.author_id
             AND public.in_announcement_audience(p.id, a.organization_id, a.location_id, a.org_role_id)
             AND EXISTS (SELECT 1 FROM public.announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = p.id)),
         (SELECT count(*)::int FROM public.profiles p
           WHERE p.organization_id = a.organization_id AND p.id IS DISTINCT FROM a.author_id
             AND public.in_announcement_audience(p.id, a.organization_id, a.location_id, a.org_role_id))
    FROM public.announcements a
   WHERE a.id = ANY (p_ids) AND public._may_see_reach(a.organization_id)
$$;
REVOKE ALL ON FUNCTION public.announcement_reach(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_reach(uuid[]) TO authenticated;

-- Who has read it (read_at) and who hasn't (NULL), unread first.
CREATE OR REPLACE FUNCTION public.announcement_readers(p_id uuid)
RETURNS TABLE (user_id uuid, name text, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, public._display_name(p.id), r.read_at
    FROM public.announcements a
    JOIN public.profiles p ON p.organization_id = a.organization_id
    LEFT JOIN public.announcement_reads r ON r.announcement_id = a.id AND r.user_id = p.id
   WHERE a.id = p_id
     AND public._may_see_reach(a.organization_id)
     AND p.id IS DISTINCT FROM a.author_id
     AND public.in_announcement_audience(p.id, a.organization_id, a.location_id, a.org_role_id)
   ORDER BY r.read_at IS NOT NULL, public._display_name(p.id)
$$;
REVOKE ALL ON FUNCTION public.announcement_readers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_readers(uuid) TO authenticated;

-- Push / Telegram fan-out: everyone the announcement is for, except its author.
CREATE OR REPLACE FUNCTION public.announcement_audience_ids(p_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
    FROM public.announcements a
    JOIN public.profiles p ON p.organization_id = a.organization_id
   WHERE a.id = p_id
     AND p.id IS DISTINCT FROM a.author_id
     AND public.in_announcement_audience(p.id, a.organization_id, a.location_id, a.org_role_id)
$$;
REVOKE ALL ON FUNCTION public.announcement_audience_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_audience_ids(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
