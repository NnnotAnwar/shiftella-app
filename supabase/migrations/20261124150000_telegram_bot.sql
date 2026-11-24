-- =============================================================================
-- TELEGRAM BOT — account links, one-time link codes, bot RPCs
-- -----------------------------------------------------------------------------
-- • telegram_links       — one Telegram private chat per user (and one user per
--                          chat). Users read / delete / tune their own row; only
--                          the bot (service role) creates it.
-- • telegram_link_codes  — single-use, 10-minute codes. The app asks for one
--                          (create_telegram_link_code), opens t.me/<bot>?start=<code>,
--                          the bot consumes it. Only a SHA-256 hash is stored.
-- • Bot RPCs (service role only) take the reviewer from the VERIFIED link
--   (chat_id → user_id) and run the app's own logic as that user: auth.uid() is
--   switched to the linked user for the rest of the transaction, so
--   can_review_request / has_permission / four-eyes rules apply exactly as in
--   the app. Nothing here trusts identity typed into the chat.
-- • Activity log: telegram_linked / telegram_unlinked (signed-in actor only).
-- Push gate: Telegram is part of push (Team+), checked with org_plan().
-- =============================================================================

-- --- Tables -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_links (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id       bigint NOT NULL UNIQUE,
  username      text CHECK (username IS NULL OR char_length(username) <= 64),
  language      text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'cs')),
  linked_at     timestamptz NOT NULL DEFAULT now(),
  muted         boolean NOT NULL DEFAULT false,
  -- What the bot sends (Telegram's own switches; push has notification_preferences).
  shifts        boolean NOT NULL DEFAULT true,
  account       boolean NOT NULL DEFAULT true,
  requests      boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  code_hash  text PRIMARY KEY,            -- hex sha256 of the code; the code itself is never stored
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx ON public.telegram_link_codes (user_id);

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Own row only. No INSERT for users — only the bot links a chat.
DROP POLICY IF EXISTS telegram_links_select ON public.telegram_links;
CREATE POLICY telegram_links_select ON public.telegram_links FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS telegram_links_update ON public.telegram_links;
CREATE POLICY telegram_links_update ON public.telegram_links FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS telegram_links_delete ON public.telegram_links;
CREATE POLICY telegram_links_delete ON public.telegram_links FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.telegram_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.telegram_links TO authenticated;
GRANT UPDATE (muted, shifts, account, requests, announcements) ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;

-- Codes: no policies at all — service role + the SECURITY DEFINER RPCs only.
REVOKE ALL ON public.telegram_link_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.telegram_link_codes TO service_role;

-- --- Activity log -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_telegram_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
BEGIN
  -- Cascades (a person deleted) and the bot's own clean-up run without a user.
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public._audit((SELECT organization_id FROM public.profiles WHERE id = v_user), 'telegram_unlinked', v_user, '{}'::jsonb);
  ELSIF TG_OP = 'INSERT' OR NEW.chat_id IS DISTINCT FROM OLD.chat_id THEN
    PERFORM public._audit((SELECT organization_id FROM public.profiles WHERE id = v_user), 'telegram_linked', v_user, '{}'::jsonb);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_telegram_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_telegram_link ON public.telegram_links;
CREATE TRIGGER audit_telegram_link
  AFTER INSERT OR UPDATE OF chat_id OR DELETE ON public.telegram_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_telegram_link();

-- --- App: a one-time link code for the signed-in user --------------------------
CREATE OR REPLACE FUNCTION public.create_telegram_link_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;
  IF NOT public.is_superadmin() AND public.org_plan(v_org) = 'free' THEN
    RAISE EXCEPTION 'plan_required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- One live code per user; sweep expired ones while here.
  DELETE FROM public.telegram_link_codes WHERE user_id = v_uid OR expires_at < now();
  -- 128 random bits, hex (Telegram's start parameter allows [A-Za-z0-9_-], ≤ 64).
  v_code := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  INSERT INTO public.telegram_link_codes (code_hash, user_id, expires_at)
  VALUES (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_uid, now() + interval '10 minutes');
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_telegram_link_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_telegram_link_code() TO authenticated;

-- --- Bot internals: act as the linked user ------------------------------------
-- Resolves the user linked to a chat and makes auth.uid() return them for the
-- rest of THIS transaction (each RPC call is its own transaction). Callable only
-- from the SECURITY DEFINER bot RPCs below.
CREATE OR REPLACE FUNCTION public._telegram_act_as(p_chat_id bigint)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid FROM public.telegram_links WHERE chat_id = p_chat_id;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public._telegram_act_as(bigint) FROM PUBLIC, anon, authenticated, service_role;

-- --- Bot: link / unlink ---------------------------------------------------------
-- Consumes a code (single use, unexpired) and links the chat to its owner.
-- Returns {ok, first_name} or {ok:false, reason:'invalid'}.
CREATE OR REPLACE FUNCTION public.telegram_link_consume(p_code text, p_chat_id bigint, p_username text, p_language text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid;
  v_lang text := CASE WHEN lower(coalesce(p_language, '')) ~ '^(cs|sk)' THEN 'cs' ELSE 'en' END;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-f0-9]{40}$' OR p_chat_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  DELETE FROM public.telegram_link_codes
   WHERE code_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex') AND expires_at > now()
  RETURNING user_id INTO v_uid;
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;

  -- Activity-log entries are made by the person linking.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  -- A chat belongs to one account: a re-link from another account moves it.
  DELETE FROM public.telegram_links WHERE chat_id = p_chat_id AND user_id <> v_uid;
  INSERT INTO public.telegram_links (user_id, chat_id, username, language)
  VALUES (v_uid, p_chat_id, NULLIF(left(btrim(p_username), 64), ''), v_lang)
  ON CONFLICT (user_id) DO UPDATE
    SET chat_id = EXCLUDED.chat_id, username = EXCLUDED.username, language = EXCLUDED.language,
        linked_at = now(), muted = false;

  RETURN jsonb_build_object('ok', true, 'first_name', (SELECT first_name FROM public.profiles WHERE id = v_uid));
END;
$$;

-- /stop — unlink this chat. True when something was unlinked.
CREATE OR REPLACE FUNCTION public.telegram_unlink_chat(p_chat_id bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public._telegram_act_as(p_chat_id);
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  DELETE FROM public.telegram_links WHERE chat_id = p_chat_id;
  RETURN true;
END;
$$;

-- Who is this chat? {user_id, organization_id, first_name, language, allowed, can_review}
-- or NULL when the chat isn't linked. `allowed` = the push plan gate (Team+, or Superadmin).
CREATE OR REPLACE FUNCTION public.telegram_context(p_chat_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := public._telegram_act_as(p_chat_id);
  v_org  uuid;
  v_lang text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_org := public.get_my_org_id();
  -- The app's language wins (the client keeps it in notification_preferences).
  SELECT COALESCE(np.language, l.language) INTO v_lang
    FROM public.telegram_links l
    LEFT JOIN public.notification_preferences np ON np.user_id = l.user_id
   WHERE l.user_id = v_uid;
  RETURN jsonb_build_object(
    'user_id', v_uid,
    'organization_id', v_org,
    'first_name', (SELECT first_name FROM public.profiles WHERE id = v_uid),
    'language', COALESCE(v_lang, 'en'),
    'allowed', public.is_superadmin() OR public.org_plan(v_org) <> 'free',
    'can_review', public.is_superadmin() OR public.has_permission('requests', 'write'));
END;
$$;

-- --- Bot: requests waiting for this user's decision ---------------------------
-- The same rows the Requests inbox lets them decide: time off, name changes,
-- swaps (not ones they take part in) and member requests (role rules included).
-- Anonymous senders stay anonymous; complaint bodies are never sent.
CREATE OR REPLACE FUNCTION public.telegram_pending_requests(p_chat_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._telegram_act_as(p_chat_id);
  v_org uuid;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_org := public.get_my_org_id();
  SELECT COALESCE(jsonb_agg(q.x ORDER BY q.created_at), '[]'::jsonb) INTO v_out FROM (
    SELECT t.created_at, jsonb_build_object('kind', 'timeoff', 'id', t.id, 'who', public._display_name(t.user_id),
             'type', t.kind, 'starts_on', t.starts_on, 'ends_on', t.ends_on) AS x
      FROM public.time_off t
     WHERE t.organization_id = v_org AND t.status = 'pending'
       AND public.can_review_request(t.user_id, t.organization_id)
    UNION ALL
    SELECT n.created_at, jsonb_build_object('kind', 'name', 'id', n.id, 'who', public._display_name(n.user_id),
             'from', btrim(concat_ws(' ', n.current_first_name, n.current_last_name)),
             'to', btrim(concat_ws(' ', n.requested_first_name, n.requested_last_name)))
      FROM public.name_change_requests n
     WHERE n.organization_id = v_org AND n.status = 'pending'
       AND public.can_review_request(n.user_id, n.organization_id)
    UNION ALL
    SELECT s.created_at, jsonb_build_object('kind', 'swap', 'id', s.id,
             'who', public._display_name(s.from_user), 'taker', public._display_name(s.taker_id),
             'starts_at', ss.starts_at, 'ends_at', ss.ends_at, 'all_day', ss.all_day, 'location', l.name)
      FROM public.shift_swaps s
      JOIN public.scheduled_shifts ss ON ss.id = s.shift_id
      LEFT JOIN public.locations l ON l.id = ss.location_id
     WHERE s.organization_id = v_org AND s.status = 'taken'
       AND public.can_review_request(s.from_user, s.organization_id)
       AND s.taker_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT r.created_at, jsonb_build_object('kind', 'member', 'id', r.id,
             'who', CASE WHEN r.anonymous THEN NULL ELSE public._display_name(r.user_id) END,
             'type', r.kind, 'subject', CASE WHEN r.kind = 'complaint' THEN NULL ELSE r.subject END,
             'role', ro.name)
      FROM public.member_requests r
      LEFT JOIN public.org_roles ro ON ro.id = r.org_role_id
     WHERE r.organization_id = v_org AND r.status = 'pending'
       AND public._may_review_member_request(r)
  ) q;
  RETURN v_out;
END;
$$;

-- --- Bot: decide one request, as the linked user -------------------------------
-- Calls the app's own review RPCs (time off: the same check and update its RLS
-- policy allows). Returns 'ok' or an error code the bot turns into a message:
-- not_linked | not_allowed | not_found | already | blocked | overlap | gone | error.
CREATE OR REPLACE FUNCTION public.telegram_decide(p_chat_id bigint, p_kind text, p_id uuid, p_approve boolean)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._telegram_act_as(p_chat_id);
  v_to  public.time_off;
BEGIN
  IF v_uid IS NULL THEN RETURN 'not_linked'; END IF;
  BEGIN
    CASE p_kind
      WHEN 'member' THEN PERFORM public.review_member_request(p_id, p_approve, NULL);
      WHEN 'swap'   THEN PERFORM public.review_shift_swap(p_id, p_approve, NULL);
      WHEN 'name'   THEN PERFORM public.review_name_change_request(p_id, p_approve, NULL);
      WHEN 'timeoff' THEN
        SELECT * INTO v_to FROM public.time_off WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN 'not_found'; END IF;
        -- = the time_off UPDATE policy (USING + WITH CHECK) for this reviewer.
        IF NOT public.can_review_request(v_to.user_id, v_to.organization_id) THEN RETURN 'not_allowed'; END IF;
        IF v_to.status <> 'pending' THEN RETURN 'already'; END IF;
        UPDATE public.time_off
           SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
               reviewed_by = v_uid, reviewed_at = now(), review_note = NULL
         WHERE id = p_id;
      ELSE RETURN 'error';
    END CASE;
  EXCEPTION
    WHEN insufficient_privilege THEN RETURN 'not_allowed';
    WHEN no_data_found THEN RETURN 'not_found';
    WHEN exclusion_violation THEN RETURN 'overlap';
    WHEN check_violation THEN
      IF SQLERRM LIKE 'swap_blocked:%' THEN RETURN 'blocked'; END IF;
      IF SQLERRM = 'request_role_gone' THEN RETURN 'gone'; END IF;
      RETURN 'already';
    WHEN OTHERS THEN RETURN 'error';
  END;
  RETURN 'ok';
END;
$$;

-- --- Bot: confirm my published shifts in a window ------------------------------
-- = the shift_confirmations INSERT policy: own, published, own org. Upcoming
-- (not yet ended) shifts only; window capped at 62 days. Returns how many were
-- newly confirmed, or -1 when the chat isn't linked.
CREATE OR REPLACE FUNCTION public.telegram_confirm_shifts(p_chat_id bigint, p_from timestamptz, p_to timestamptz)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public._telegram_act_as(p_chat_id);
  v_org uuid;
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN RETURN -1; END IF;
  v_org := public.get_my_org_id();
  WITH ins AS (
    INSERT INTO public.shift_confirmations (scheduled_shift_id, user_id, organization_id)
    SELECT s.id, v_uid, v_org
      FROM public.scheduled_shifts s
     WHERE s.user_id = v_uid AND s.organization_id = v_org AND s.published = true
       AND s.starts_at >= p_from AND s.starts_at < LEAST(p_to, p_from + interval '62 days')
       AND s.ends_at > now()
    ON CONFLICT (scheduled_shift_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins;
  RETURN v_n;
END;
$$;

-- Bot RPCs: service role only (the Edge Function, after verifying Telegram's secret).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.telegram_link_consume(text, bigint, text, text)',
    'public.telegram_unlink_chat(bigint)',
    'public.telegram_context(bigint)',
    'public.telegram_pending_requests(bigint)',
    'public.telegram_decide(bigint, text, uuid, boolean)',
    'public.telegram_confirm_shifts(bigint, timestamptz, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
