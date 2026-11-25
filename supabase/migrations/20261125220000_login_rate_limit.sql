-- =============================================================================
-- SIGN-IN RATE LIMIT for the username-login Edge Function
-- -----------------------------------------------------------------------------
-- Security review 2026-11-25: username-login had no attempt limit of its own,
-- so passwords could be guessed. The function now records failures per key —
-- the caller's IP and the username, both stored only as SHA-256 hashes — in a
-- 15-minute window. A key over its limit is locked for 15 minutes:
--   ip:<hash>  30 failures      u:<hash>  8 failures
-- A successful sign-in clears the username's counter. Only the service role
-- (the Edge Function) can touch any of this.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_attempts (
  key          text PRIMARY KEY,
  fails        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;   -- no policies: service role only
REVOKE ALL ON public.login_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.login_locked(p_keys text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.login_attempts WHERE key = ANY (p_keys) AND locked_until > now());
$$;

CREATE OR REPLACE FUNCTION public.login_failed(p_keys text[], p_limits integer[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  FOR i IN 1 .. coalesce(array_length(p_keys, 1), 0) LOOP
    INSERT INTO public.login_attempts AS a (key, fails, window_start)
    VALUES (p_keys[i], 1, now())
    ON CONFLICT (key) DO UPDATE SET
      fails        = CASE WHEN a.window_start < now() - interval '15 minutes' THEN 1 ELSE a.fails + 1 END,
      window_start = CASE WHEN a.window_start < now() - interval '15 minutes' THEN now() ELSE a.window_start END;
    UPDATE public.login_attempts
       SET locked_until = now() + interval '15 minutes'
     WHERE key = p_keys[i] AND fails >= p_limits[i];
  END LOOP;
  -- Housekeeping: forget old, unlocked counters.
  DELETE FROM public.login_attempts
   WHERE window_start < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now());
END;
$$;

CREATE OR REPLACE FUNCTION public.login_succeeded(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.login_attempts WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION public.login_locked(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_failed(text[], integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_succeeded(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_locked(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_failed(text[], integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_succeeded(text) TO service_role;
