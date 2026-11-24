-- =============================================================================
-- MORE LANGUAGES — Slovak + Ukrainian
-- -----------------------------------------------------------------------------
-- The app UI now speaks en / cs / sk / uk. The client mirrors the UI language
-- onto notification_preferences.language (send-push, Telegram and the calendar
-- feed read it there), so the column must accept the two new codes — otherwise
-- the client's upsert fails for sk/uk users and their old value sticks.
-- Server copy stays cs/en: the Edge Functions map sk → cs, uk → en.
-- telegram_links.language is the bot's own language and stays cs/en.
-- =============================================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.notification_preferences'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%language%'
  LOOP
    EXECUTE format('ALTER TABLE public.notification_preferences DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_language_check
  CHECK (language IN ('en', 'cs', 'sk', 'uk'));
