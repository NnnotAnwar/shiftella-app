-- =============================================================================
-- CALENDAR SYNC (ICS FEED) + BULK MEMBER IMPORT LOG
-- -----------------------------------------------------------------------------
-- 1. calendar_feeds — one secret feed token per member. The `calendar-feed`
--    Edge Function (verify_jwt = false) takes ?token=… as its only credential
--    and serves that member's PUBLISHED rota as text/calendar, so Google /
--    Apple Calendar / Outlook can subscribe without signing in.
--      • Clients may only READ their own row (to show the link) and DELETE it
--        (turn the feed off). Creating and replacing tokens goes through
--        calendar_feed_token(), never a direct write.
--      • calendar_feed_token(false) returns the current token (creating one on
--        first use); calendar_feed_token(true) replaces it — the old link stops
--        working at once — and logs 'calendar_link_reset'.
--      • Tokens are 64 hex chars from two gen_random_uuid() (≈244 random bits);
--        no extension needed.
-- 2. log_members_imported() — one summary entry ('members_imported') after an
--    admin imports members from Excel / CSV. The invites themselves go through
--    the invite-employee Edge Function one by one (each logs 'member_invited').
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_feeds (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE CHECK (token ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_feeds FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.calendar_feeds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feeds TO service_role;

-- Own row only — even a Superadmin can't read someone else's feed link.
DROP POLICY IF EXISTS "calendar_feeds_select" ON public.calendar_feeds;
CREATE POLICY "calendar_feeds_select" ON public.calendar_feeds FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "calendar_feeds_delete" ON public.calendar_feeds;
CREATE POLICY "calendar_feeds_delete" ON public.calendar_feeds FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Get (and create on first use) or replace the caller's feed token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calendar_feed_token(p_reset boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_token text;
  v_had   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT token INTO v_token FROM public.calendar_feeds WHERE user_id = v_uid;
  v_had := v_token IS NOT NULL;
  IF v_had AND NOT p_reset THEN RETURN v_token; END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.calendar_feeds (user_id, token, created_at)
  VALUES (v_uid, v_token, now())
  ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = EXCLUDED.created_at;

  IF v_had THEN
    PERFORM public._audit(v_org, 'calendar_link_reset', v_uid, '{}'::jsonb);
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.calendar_feed_token(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calendar_feed_token(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Summary entry after a bulk import (who imported how many into which org).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_members_imported(p_org uuid, p_invited integer, p_failed integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_superadmin()
          OR (p_org = public.get_my_org_id() AND public.has_permission('members', 'write'))) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF COALESCE(p_invited, 0) <= 0 AND COALESCE(p_failed, 0) <= 0 THEN RETURN; END IF;
  PERFORM public._audit(p_org, 'members_imported', NULL, jsonb_build_object(
    'invited', GREATEST(LEAST(COALESCE(p_invited, 0), 10000), 0),
    'failed', GREATEST(LEAST(COALESCE(p_failed, 0), 10000), 0)));
END;
$$;
REVOKE ALL ON FUNCTION public.log_members_imported(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_members_imported(uuid, integer, integer) TO authenticated;
