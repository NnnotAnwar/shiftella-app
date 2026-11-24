-- =============================================================================
-- BILLING — free beta switch.
-- -----------------------------------------------------------------------------
-- The owner has no business registration (IČO) yet, so nothing may be sold.
-- While `app_settings.free_beta` is on:
--   • org_plan() answers 'business' for every organization, so every server
--     gate opens: member / location limits, PLAN_FEATURE triggers, push, invites.
--   • billing-checkout refuses (409 FREE_BETA) and billing-change-plan refuses
--     moves to a paid plan; cancelling / resuming an existing subscription
--     still works.
--   • The app reads the flag through billing_free_beta() (anon too, for the
--     landing page): no prices to buy, a "free during beta" note instead.
-- Subscription rows are left as they are, so switching the flag off restores
-- billing exactly. Before switching it off, give organizations created during
-- the beta a fresh trial (see docs/free-beta.md).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),  -- exactly one row
  free_beta  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.app_settings TO service_role;

INSERT INTO public.app_settings (id, free_beta) VALUES (true, true)
ON CONFLICT (id) DO UPDATE SET free_beta = true, updated_at = now();

CREATE OR REPLACE FUNCTION public.billing_free_beta()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT free_beta FROM public.app_settings WHERE id), false) $$;
REVOKE ALL ON FUNCTION public.billing_free_beta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_free_beta() TO anon, authenticated, service_role;

-- Same as 20261121120000_billing_subscriptions, plus the beta override.
CREATE OR REPLACE FUNCTION public.org_plan(p_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.billing_free_beta() THEN 'business'
    ELSE COALESCE((SELECT public._effective_plan(s) FROM public.subscriptions s WHERE s.organization_id = p_org), 'free')
  END
$$;
REVOKE ALL ON FUNCTION public.org_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_plan(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
