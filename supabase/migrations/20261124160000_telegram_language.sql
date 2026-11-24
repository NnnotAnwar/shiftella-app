-- =============================================================================
-- TELEGRAM — language chosen in the bot
-- -----------------------------------------------------------------------------
-- Until now the bot spoke the app's language (notification_preferences.language),
-- falling back to the Telegram client's. A person can now pick the bot's own
-- language (🌐 button / /language). Once picked (language_chosen = true) it wins
-- for bot replies AND for notifications sent to Telegram; push in the app keeps
-- the app language.
-- =============================================================================

ALTER TABLE public.telegram_links ADD COLUMN IF NOT EXISTS language_chosen boolean NOT NULL DEFAULT false;

-- Same as 20261124150000_telegram_bot, except the bot's chosen language wins.
CREATE OR REPLACE FUNCTION public.telegram_context(p_chat_id bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := public._telegram_act_as(p_chat_id);
  v_org  uuid;
  v_lang text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_org := public.get_my_org_id();
  SELECT CASE WHEN l.language_chosen THEN l.language ELSE COALESCE(np.language, l.language) END INTO v_lang
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

-- The bot's language for this chat ('cs' | 'en'). True when the chat is linked.
CREATE OR REPLACE FUNCTION public.telegram_set_language(p_chat_id bigint, p_language text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_language IS NULL OR p_language NOT IN ('cs', 'en') THEN
    RAISE EXCEPTION 'Unknown language.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.telegram_links SET language = p_language, language_chosen = true WHERE chat_id = p_chat_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_set_language(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_set_language(bigint, text) TO service_role;

NOTIFY pgrst, 'reload schema';
