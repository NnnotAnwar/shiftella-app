-- =============================================================================
-- BILLING — server-side plan gates, Superadmin invites past the member limit,
-- org_plan() made internal.
-- -----------------------------------------------------------------------------
-- 1. Paid features were gated only in the UI. Now the database refuses WRITES
--    (insert / update) on a plan without the feature:
--      • shift_templates        → templates   (Team+)
--      • shift_swaps            → swaps       (Team+; offer / take / approve RPCs
--                                              write the table, so they are
--                                              guarded too)
--      • open_shifts            → openShifts  (Team+; post, edit and claim)
--      • member_wages           → wages       (Team+)
--      • coverage_requirements  → coverage    (Business)
--    The error is `PLAN_FEATURE:<feature>` (check_violation); the client maps
--    it to the upgrade nudge.
--    • Reads stay allowed and nothing is deleted: a downgraded organization
--      keeps seeing its data read-only. Deleting stays allowed, and so does
--      closing what is open (withdraw / decline a swap, release a claimed open
--      shift), so nothing gets stuck.
--    • Superadmin bypasses the gates. Writes without a signed-in user (service
--      role, cron, migrations) are trusted and pass.
--    • Copy month inserts ordinary rota rows (scheduled_shifts) from the client;
--      the database can't tell them from hand-made shifts, so copy month stays
--      gated in the UI only.
--    Feature names mirror src/features/billing/plans.ts — keep them in step.
-- 2. A Superadmin may invite into an organization at its member limit. The
--    invite-employee function (service role) marks such invites
--    `pending_invites.bypass_limits`; enforce_member_limit honours it for the
--    profile created from that invite. Clients can't touch pending_invites
--    (no grants, no policies), so they can't set it.
-- 3. org_plan(org) answered for ANY organization. It is now internal (service
--    role + SECURITY DEFINER functions, triggers); clients read their own plan
--    through org_usage(), which is limited to the own organization / Superadmin.
-- =============================================================================

-- --- 1. Feature gates ------------------------------------------------------------
-- Mirrors PLAN_FEATURES in src/features/billing/plans.ts. Unknown feature → false.
CREATE OR REPLACE FUNCTION public.plan_has_feature(p_plan text, p_feature text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_feature IN ('timesheets', 'exports', 'wages', 'customRoles', 'swaps', 'openShifts', 'templates', 'push')
      THEN p_plan IN ('team', 'business')
    WHEN p_feature IN ('activityLog', 'coverage', 'restRules', 'prioritySupport', 'earlyAccess')
      THEN p_plan = 'business'
    ELSE false
  END
$$;

-- May the organization use a feature right now? Superadmin: always.
CREATE OR REPLACE FUNCTION public.org_has_feature(p_org uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_superadmin() OR public.plan_has_feature(public.org_plan(p_org), p_feature)
$$;

-- Raise PLAN_FEATURE:<feature> unless the organization has the feature.
CREATE OR REPLACE FUNCTION public.require_plan_feature(p_org uuid, p_feature text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.org_has_feature(p_org, p_feature) THEN
    RAISE EXCEPTION 'PLAN_FEATURE:%: Your plan does not include this feature. Upgrade to use it.', p_feature
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- BEFORE INSERT OR UPDATE on a gated table; TG_ARGV[0] = the feature.
CREATE OR REPLACE FUNCTION public.enforce_plan_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- Trusted writes (service role, cron, migrations) have no signed-in user.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- Closing what already exists stays possible on any plan.
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'shift_swaps' THEN
      IF NEW.status IN ('withdrawn', 'declined') THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME = 'open_shifts' THEN
      IF OLD.claimed_by IS NOT NULL AND NEW.claimed_by IS NULL
         AND (NEW.organization_id, NEW.location_id, NEW.role, NEW.starts_at, NEW.ends_at, NEW.note)
             IS NOT DISTINCT FROM
             (OLD.organization_id, OLD.location_id, OLD.role, OLD.starts_at, OLD.ends_at, OLD.note) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  PERFORM public.require_plan_feature(NEW.organization_id, TG_ARGV[0]);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_feature_gate ON public.shift_templates;
CREATE TRIGGER plan_feature_gate BEFORE INSERT OR UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature('templates');

DROP TRIGGER IF EXISTS plan_feature_gate ON public.shift_swaps;
CREATE TRIGGER plan_feature_gate BEFORE INSERT OR UPDATE ON public.shift_swaps
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature('swaps');

DROP TRIGGER IF EXISTS plan_feature_gate ON public.open_shifts;
CREATE TRIGGER plan_feature_gate BEFORE INSERT OR UPDATE ON public.open_shifts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature('openShifts');

DROP TRIGGER IF EXISTS plan_feature_gate ON public.member_wages;
CREATE TRIGGER plan_feature_gate BEFORE INSERT OR UPDATE ON public.member_wages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature('wages');

DROP TRIGGER IF EXISTS plan_feature_gate ON public.coverage_requirements;
CREATE TRIGGER plan_feature_gate BEFORE INSERT OR UPDATE ON public.coverage_requirements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_feature('coverage');

REVOKE ALL ON FUNCTION public.plan_has_feature(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_plan_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_feature() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_has_feature(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_has_feature(uuid, text) TO service_role;

-- --- 2. Superadmin invites past the member limit -----------------------------------
ALTER TABLE public.pending_invites ADD COLUMN IF NOT EXISTS bypass_limits boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.pending_invites.bypass_limits IS
  'Set by invite-employee (service role) when a Superadmin invites: the new profile skips the plan member limit.';

CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_limit integer;
BEGIN
  IF NEW.role = 'Superadmin' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND OLD.role <> 'Superadmin' THEN RETURN NEW; END IF;
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  -- A Superadmin's invite (recorded server-side; handle_new_user deletes the
  -- record only after the profile exists).
  IF TG_OP = 'INSERT' AND NEW.email IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.pending_invites pi
        WHERE pi.email = lower(btrim(NEW.email))
          AND pi.organization_id = NEW.organization_id
          AND pi.bypass_limits) THEN
    RETURN NEW;
  END IF;
  -- Serialize concurrent joins of the same organization on its billing row.
  PERFORM 1 FROM public.subscriptions WHERE organization_id = NEW.organization_id FOR UPDATE;
  v_limit := public.plan_member_limit(public.org_plan(NEW.organization_id));
  IF v_limit IS NOT NULL AND public.org_member_count(NEW.organization_id) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_MEMBERS: Your plan allows up to % members. Upgrade to add more.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_member_limit() FROM PUBLIC, anon, authenticated;

-- Same as 20261107100900_invites_via_pending, except the pending invite is
-- deleted AFTER the profile insert (so the member-limit trigger can see it).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invite   public.pending_invites;
  v_trusted  boolean := false;
  v_org_id   uuid;
  v_org_role uuid;
  v_org_name text;
  v_slug     text;
  v_role     text;
  v_base     text;
  v_username text;
  v_suffix   int := 0;
BEGIN
  SELECT * INTO v_invite FROM public.pending_invites WHERE email = lower(btrim(new.email));
  IF FOUND THEN
    -- An invite recorded by the server.
    v_trusted  := true;
    v_org_id   := v_invite.organization_id;
    v_role     := v_invite.role;
    v_org_role := v_invite.org_role_id;
  ELSIF new.raw_app_meta_data ? 'organization_id' THEN
    -- Server-set app metadata (admin API).
    v_trusted  := true;
    v_org_id   := NULLIF(new.raw_app_meta_data->>'organization_id', '')::uuid;
    v_role     := COALESCE(NULLIF(new.raw_app_meta_data->>'role', ''), 'Employee');
    v_org_role := NULLIF(new.raw_app_meta_data->>'org_role_id', '')::uuid;
  END IF;

  IF NOT v_trusted THEN
    -- Self sign-up → owner of a brand-new organization.
    v_org_name := left(btrim(COALESCE(new.raw_user_meta_data->>'organization_name', '')), 80);
    IF v_org_name = '' THEN
      RAISE EXCEPTION 'Sign-up needs an organization name.' USING ERRCODE = 'check_violation';
    END IF;
    v_slug := trim(BOTH '-' FROM regexp_replace(translate(lower(v_org_name), 'áäčďéěëíňóöřšťúůüýž', 'aacdeeeinoorstuuuyz'), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(COALESCE(NULLIF(v_slug, ''), 'org'), 40) || '-' || substr(md5(random()::text || new.id::text), 1, 6);
    INSERT INTO public.organizations (name, slug) VALUES (v_org_name, v_slug) RETURNING id INTO v_org_id;
    v_role := 'Head Admin';
    v_org_role := NULL;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization for new user.';
  END IF;

  v_base := CASE WHEN v_trusted THEN
      COALESCE(NULLIF(new.raw_user_meta_data->>'username', ''), NULLIF(split_part(new.email, '@', 1), ''), 'user_' || substr(md5(random()::text), 1, 8))
    ELSE
      COALESCE(NULLIF(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._]+', '', 'g'), ''), 'user_' || substr(md5(random()::text), 1, 8))
  END;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_suffix := v_suffix + 1;
    v_username := v_base || v_suffix;
  END LOOP;

  INSERT INTO public.profiles (id, username, role, email, organization_id, org_role_id, first_name, last_name)
  VALUES (
    new.id,
    v_username,
    v_role,
    new.email,
    v_org_id,
    v_org_role,
    NULLIF(left(btrim(new.raw_user_meta_data->>'first_name'), 60), ''),
    NULLIF(left(btrim(new.raw_user_meta_data->>'last_name'), 60), '')
  );

  IF v_invite.email IS NOT NULL THEN
    DELETE FROM public.pending_invites WHERE email = v_invite.email;
  END IF;

  RETURN new;
END;
$function$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- --- 3. org_plan() is internal ---------------------------------------------------------
-- Callers: enforce_member_limit / enforce_location_limit / org_usage /
-- org_has_feature (SECURITY DEFINER — they run with the owner's rights) and the
-- Edge Functions invite-employee / send-push (service role). No client calls it.
REVOKE ALL ON FUNCTION public.org_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_plan(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
