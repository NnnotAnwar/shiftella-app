-- Database security pass — #99 (SECURITY DEFINER helpers) + #98 (indexes).
--
-- Grants model after this migration (schema public):
--   * Trigger functions ........ no EXECUTE for PUBLIC / anon / authenticated.
--     Postgres checks EXECUTE on a trigger function only at CREATE TRIGGER
--     time, never when the trigger fires, so this cannot break writes.
--   * Client RPCs (src/ .rpc()) . authenticated + service_role only.
--     billing_free_beta() stays callable by anon on purpose (landing page).
--   * RLS helpers .............. stay EXECUTE-able by authenticated: a policy
--     expression runs with the privileges of the querying role, so revoking
--     get_my_org_id / is_superadmin / has_permission / my_role_rank /
--     org_role_rank / is_my_subordinate / can_review_request /
--     am_in_announcement_audience would make every RLS-guarded query fail
--     with "permission denied for function". They only answer questions about
--     the caller themself, so exposing them as RPCs leaks nothing new.
--   * Internal helpers only called from other SECURITY DEFINER functions or
--     from Edge Functions with the service-role key → service_role only.

-- ── 1. Trigger functions: no direct EXECUTE for API roles ───────────────────
DO $$
DECLARE
    f regprocedure;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.prokind = 'f'
          AND p.prorettype = 'trigger'::regtype
          AND NOT EXISTS (                       -- skip extension-owned functions
              SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END
$$;

-- ── 2. Internal helpers that the client never calls ─────────────────────────
-- role_rank(text): used only by org_role_rank / send_daily_digests /
--   sync_profile_org_role (all SECURITY DEFINER) — never by a policy.
-- profile_has_permission(uuid,text,text): used by SECURITY DEFINER functions
--   and by Edge Functions through the service-role client.
REVOKE ALL ON FUNCTION public.role_rank(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.role_rank(text) TO service_role;

REVOKE ALL ON FUNCTION public.profile_has_permission(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_has_permission(uuid, text, text) TO service_role;

-- Pure (SECURITY INVOKER) helpers that still had a PUBLIC/anon grant.
-- level_for_position is only called by the org_roles_position trigger;
-- plan_*_limit by the limit triggers and Edge Functions (service role).
REVOKE ALL ON FUNCTION public.level_for_position(smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.level_for_position(smallint) TO service_role;
ALTER FUNCTION public.level_for_position(smallint) SET search_path = public;

REVOKE ALL ON FUNCTION public.plan_location_limit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plan_member_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_location_limit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_member_limit(text) TO authenticated, service_role;

-- _audit_subject is called by the SECURITY INVOKER trigger audit_fill_subject,
-- which runs as the writing user → keep authenticated, drop PUBLIC/anon.
REVOKE ALL ON FUNCTION public._audit_subject(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._audit_subject(text, uuid, uuid) TO authenticated, service_role;

-- ── 3. RLS helpers: signed-in only (never anon / PUBLIC) ────────────────────
REVOKE ALL ON FUNCTION public.get_my_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_role_rank() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_role_rank(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_my_subordinate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_request(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.am_in_announcement_audience(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
    public.get_my_org_id(),
    public.is_superadmin(),
    public.my_role_rank(),
    public.has_permission(text, text),
    public.org_role_rank(uuid, text),
    public.is_my_subordinate(uuid),
    public.can_review_request(uuid, uuid),
    public.am_in_announcement_audience(uuid, uuid, uuid)
TO authenticated, service_role;

-- ── 4. #98 indexes ──────────────────────────────────────────────────────────
-- Never used and backs no FK / constraint: availability is always read by
-- organization_id (availability_org_idx) and filtered by date client-side.
DROP INDEX IF EXISTS public.availability_date_idx;

-- Other "unused" indexes from the advisor / the issue are kept on purpose:
-- each covers a foreign key (cascading deletes from profiles / organizations /
-- locations would otherwise seq-scan) or is used by a known query path:
--   announcements_role_idx, idx_profiles_manager_id, idx_profiles_role,
--   location_roster_added_by_idx, location_roster_org_idx,
--   idx_name_change_requests_reviewed_by, idx_shifts_location_id,
--   idx_shifts_previous_location_id, telegram_link_codes_user_idx,
--   idx_locations_organization_id, idx_shift_audit_log_actor_id,
--   idx_shift_audit_log_target_user_id, shift_audit_log_org_created_idx
--   (org + created_at DESC feed; org_action_idx can't serve that order).

-- Foreign keys without a covering index (advisor 0001).
CREATE INDEX IF NOT EXISTS leave_adjustments_created_by_idx     ON public.leave_adjustments (created_by);
CREATE INDEX IF NOT EXISTS leave_adjustments_org_idx            ON public.leave_adjustments (organization_id);
CREATE INDEX IF NOT EXISTS member_leave_org_idx                 ON public.member_leave (organization_id);
CREATE INDEX IF NOT EXISTS member_requests_org_role_idx         ON public.member_requests (org_role_id);
CREATE INDEX IF NOT EXISTS member_requests_reviewed_by_idx      ON public.member_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS member_wages_created_by_idx          ON public.member_wages (created_by);
CREATE INDEX IF NOT EXISTS open_shifts_created_by_idx           ON public.open_shifts (created_by);
CREATE INDEX IF NOT EXISTS open_shifts_location_idx             ON public.open_shifts (location_id);
CREATE INDEX IF NOT EXISTS org_roles_base_role_idx              ON public.org_roles (base_role);
CREATE INDEX IF NOT EXISTS pending_invites_created_by_idx       ON public.pending_invites (created_by);
CREATE INDEX IF NOT EXISTS pending_invites_org_role_idx         ON public.pending_invites (org_role_id);
CREATE INDEX IF NOT EXISTS pending_invites_org_idx              ON public.pending_invites (organization_id);
CREATE INDEX IF NOT EXISTS pending_invites_role_idx             ON public.pending_invites (role);
CREATE INDEX IF NOT EXISTS shift_templates_created_by_idx       ON public.shift_templates (created_by);
CREATE INDEX IF NOT EXISTS subscriptions_manual_granted_by_idx  ON public.subscriptions (manual_granted_by);
