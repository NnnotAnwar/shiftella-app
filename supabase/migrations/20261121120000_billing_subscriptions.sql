-- =============================================================================
-- BILLING — one subscription per organization (Stripe), plan limits, gifts.
-- -----------------------------------------------------------------------------
-- Plans (decided 2026-11-21, hybrid pricing):
--   • free     — up to 5 members, 1 active location, core features.
--   • team     — flat price for the organization; up to 15 members and
--                3 active locations.
--   • business — per member (min. 10 billed); unlimited members & locations;
--                everything in Team + activity log, coverage, rest rules.
--
-- Model
--   • subscriptions            — one row per organization. Clients may only
--                                READ their own organization's row; every
--                                write comes from the Edge Functions (service
--                                role) or the SECURITY DEFINER RPCs below.
--   • base row                 — plan / status / Stripe fields. `source` says
--                                where it came from: 'trial' (30-day Business
--                                trial every new organization gets, no card),
--                                'stripe' (a paid subscription), 'grandfathered'
--                                (organizations that existed before billing —
--                                Business forever), 'manual' (set by hand).
--   • manual grant             — manual_plan / manual_until / manual_note: a
--                                Superadmin's free "gift" plan. While active it
--                                WINS over the base row — the Stripe webhook
--                                keeps updating the Stripe fields but never
--                                touches the grant, so it can't downgrade it.
--   • org_plan(org)            — the effective plan: active grant → its plan;
--                                expired trial / canceled / incomplete → free.
--   • Hard limits              — enforced HERE, not only in the UI: Free stops
--                                at 5 members / 1 active location, Team at 15 /
--                                3. The next member (invite, or moving someone
--                                in) or location (create or restore) is refused.
--                                Superadmin bypasses them.
--   • Plan changes are logged to the activity log ('plan_changed',
--     'plan_granted', 'plan_grant_removed').
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  organization_id        uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan                   text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'team', 'business')),
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  "interval"             text CHECK ("interval" IN ('month', 'year')),
  seats                  integer CHECK (seats IS NULL OR seats >= 0),  -- quantity billed by Stripe (Team: 1)
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,
  source                 text NOT NULL DEFAULT 'trial' CHECK (source IN ('trial', 'stripe', 'grandfathered', 'manual')),
  -- Superadmin's free grant ("gift"). NULL manual_plan = no grant.
  manual_plan            text CHECK (manual_plan IN ('team', 'business')),
  manual_until           timestamptz,               -- NULL = forever
  manual_note            text CHECK (manual_note IS NULL OR char_length(manual_note) <= 200),
  manual_granted_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  manual_granted_at      timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;

-- Members read their own organization's row; Superadmin reads all. No write
-- policies at all: clients can't change billing.
DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_superadmin() OR organization_id = public.get_my_org_id());

CREATE OR REPLACE FUNCTION public.touch_subscription()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS touch_subscription ON public.subscriptions;
CREATE TRIGGER touch_subscription BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_subscription();

-- --- Effective plan ------------------------------------------------------------
-- Mirrors src/features/billing/entitlements.ts (effectivePlan) — keep in step.
CREATE OR REPLACE FUNCTION public._effective_plan(s public.subscriptions)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN s.organization_id IS NULL THEN 'free'
    WHEN s.manual_plan IS NOT NULL AND (s.manual_until IS NULL OR s.manual_until > now()) THEN s.manual_plan
    -- Our own no-card trial ends at trial_ends_at; a Stripe trial is ended by
    -- Stripe (its webhook flips the status).
    WHEN s.status = 'trialing' AND s.stripe_subscription_id IS NULL
         AND (s.trial_ends_at IS NULL OR s.trial_ends_at <= now()) THEN 'free'
    WHEN s.status IN ('trialing', 'active', 'past_due') THEN s.plan
    ELSE 'free'
  END
$$;

CREATE OR REPLACE FUNCTION public.org_plan(p_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT public._effective_plan(s) FROM public.subscriptions s WHERE s.organization_id = p_org), 'free')
$$;

-- Members who count for billing (Superadmin never does). Invited members count
-- from the invite on: their profile exists from then.
CREATE OR REPLACE FUNCTION public.org_member_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.profiles WHERE organization_id = p_org AND role <> 'Superadmin' $$;

CREATE OR REPLACE FUNCTION public.org_active_location_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.locations WHERE organization_id = p_org AND archived_at IS NULL $$;

-- What the Billing page shows: members + active locations (own org / Superadmin).
CREATE OR REPLACE FUNCTION public.org_usage(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_superadmin() OR p_org = public.get_my_org_id()) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'members', public.org_member_count(p_org),
    'locations', public.org_active_location_count(p_org),
    'plan', public.org_plan(p_org));
END;
$$;

REVOKE ALL ON FUNCTION public._effective_plan(public.subscriptions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_member_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_active_location_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_member_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_usage(uuid) TO authenticated;

-- --- Seed: every new organization starts a 30-day Business trial -----------------
CREATE OR REPLACE FUNCTION public.seed_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.subscriptions (organization_id, plan, status, trial_ends_at, source)
  VALUES (NEW.id, 'business', 'trialing', now() + interval '30 days', 'trial')
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS seed_subscription ON public.organizations;
CREATE TRIGGER seed_subscription AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_subscription();

-- Backfill: organizations that exist today keep everything — Business forever.
INSERT INTO public.subscriptions (organization_id, plan, status, source)
SELECT id, 'business', 'active', 'grandfathered' FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- --- Hard limits per plan -----------------------------------------------------------
-- Mirrors LIMITS in src/features/billing/plans.ts. NULL = unlimited.
CREATE OR REPLACE FUNCTION public.plan_member_limit(p_plan text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE p_plan WHEN 'free' THEN 5 WHEN 'team' THEN 15 ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.plan_location_limit(p_plan text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE p_plan WHEN 'free' THEN 1 WHEN 'team' THEN 3 ELSE NULL END $$;
GRANT EXECUTE ON FUNCTION public.plan_member_limit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_location_limit(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_limit integer;
BEGIN
  IF NEW.role = 'Superadmin' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND OLD.role <> 'Superadmin' THEN RETURN NEW; END IF;
  IF public.is_superadmin() THEN RETURN NEW; END IF;
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
DROP TRIGGER IF EXISTS plan_member_limit ON public.profiles;
CREATE TRIGGER plan_member_limit BEFORE INSERT OR UPDATE OF organization_id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_limit();

CREATE OR REPLACE FUNCTION public.enforce_location_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_limit integer;
BEGIN
  IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;
  IF public.is_superadmin() THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.subscriptions WHERE organization_id = NEW.organization_id FOR UPDATE;
  v_limit := public.plan_location_limit(public.org_plan(NEW.organization_id));
  IF v_limit IS NOT NULL
     AND (SELECT count(*) FROM public.locations
           WHERE organization_id = NEW.organization_id AND archived_at IS NULL AND id <> NEW.id) >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_LOCATIONS: Your plan includes up to % active locations. Upgrade to add more.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS plan_location_limit ON public.locations;
CREATE TRIGGER plan_location_limit BEFORE INSERT OR UPDATE OF archived_at, organization_id ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_location_limit();

REVOKE ALL ON FUNCTION public.touch_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_member_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_location_limit() FROM PUBLIC, anon, authenticated;

-- --- Activity log: plan changes ------------------------------------------------------
CREATE OR REPLACE FUNCTION public._plan_label(p_plan text, p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT initcap(p_plan) || CASE p_status
    WHEN 'trialing' THEN ' · trial'
    WHEN 'past_due' THEN ' · past due'
    WHEN 'canceled' THEN ' · canceled'
    WHEN 'incomplete' THEN ' · incomplete'
    ELSE '' END
$$;

CREATE OR REPLACE FUNCTION public.audit_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_changes jsonb := '[]'::jsonb;
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || jsonb_build_object('field', 'plan',
      'old', public._plan_label(OLD.plan, OLD.status), 'new', public._plan_label(NEW.plan, NEW.status));
  END IF;
  IF NEW."interval" IS DISTINCT FROM OLD."interval" AND NEW."interval" IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('field', 'billing_interval', 'old', OLD."interval", 'new', NEW."interval");
  END IF;
  IF NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end THEN
    v_changes := v_changes || jsonb_build_object('field', 'cancel_at_period_end',
      'old', OLD.cancel_at_period_end::text, 'new', NEW.cancel_at_period_end::text);
  END IF;
  IF jsonb_array_length(v_changes) > 0 THEN
    PERFORM public._audit(NEW.organization_id, 'plan_changed', NULL, jsonb_build_object('changes', v_changes));
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS audit_subscription ON public.subscriptions;
CREATE TRIGGER audit_subscription AFTER UPDATE OF plan, status, "interval", cancel_at_period_end ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_subscription();

REVOKE ALL ON FUNCTION public._plan_label(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_subscription() FROM PUBLIC, anon, authenticated;

-- --- Superadmin: grant / remove a free plan ("gift") -------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_org_plan(p_org uuid, p_plan text, p_until timestamptz DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_old public.subscriptions;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the platform owner can grant plans.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_plan NOT IN ('team', 'business') THEN
    RAISE EXCEPTION 'Grant Team or Business (remove the grant for Free).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_until IS NOT NULL AND p_until <= now() THEN
    RAISE EXCEPTION 'The end date must be in the future.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org) THEN
    RAISE EXCEPTION 'Unknown organization.' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.subscriptions (organization_id, plan, status, source)
  VALUES (p_org, 'free', 'active', 'manual')
  ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO v_old FROM public.subscriptions WHERE organization_id = p_org FOR UPDATE;

  UPDATE public.subscriptions
     SET manual_plan = p_plan,
         manual_until = p_until,
         manual_note = NULLIF(left(btrim(COALESCE(p_note, '')), 200), ''),
         manual_granted_by = auth.uid(),
         manual_granted_at = now()
   WHERE organization_id = p_org;

  PERFORM public._audit(p_org, 'plan_granted', NULL, jsonb_build_object(
    'subject_name', initcap(p_plan),
    'note', NULLIF(btrim(COALESCE(p_note, '')), ''),
    'changes', jsonb_build_array(jsonb_build_object('field', 'plan',
        'old', CASE WHEN v_old.manual_plan IS NOT NULL THEN initcap(v_old.manual_plan) || ' · gift' ELSE public._plan_label(v_old.plan, v_old.status) END,
        'new', initcap(p_plan) || ' · gift'))
      || CASE WHEN p_until IS NOT NULL
           THEN jsonb_build_array(jsonb_build_object('field', 'until', 'new', to_char(p_until AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')))
           ELSE '[]'::jsonb END));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_org_plan(p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_old public.subscriptions;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only the platform owner can remove granted plans.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.subscriptions WHERE organization_id = p_org FOR UPDATE;
  IF NOT FOUND OR v_old.manual_plan IS NULL THEN RETURN; END IF;

  UPDATE public.subscriptions
     SET manual_plan = NULL, manual_until = NULL, manual_note = NULL,
         manual_granted_by = NULL, manual_granted_at = NULL
   WHERE organization_id = p_org;

  PERFORM public._audit(p_org, 'plan_grant_removed', NULL, jsonb_build_object(
    'subject_name', initcap(v_old.manual_plan),
    'changes', jsonb_build_array(jsonb_build_object('field', 'plan',
      'old', initcap(v_old.manual_plan) || ' · gift',
      'new', public._plan_label(public._effective_plan((SELECT s FROM public.subscriptions s WHERE s.organization_id = p_org)), 'active')))));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_org_plan(uuid, text, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_org_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_org_plan(uuid, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_org_plan(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
