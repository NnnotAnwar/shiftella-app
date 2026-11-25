-- =============================================================================
-- SHIFT NOTES & HANDOVER
-- -----------------------------------------------------------------------------
-- A member leaves a short note on their own clock record (while on it, or up to
-- 12 h after clocking out): "milk delivery came, coffee machine descaled".
-- `handover = true` means "for the next shift": the next people on shift at that
-- location see it on their dashboard (last 24 h) and tap "Read".
--
-- Who sees what (RLS):
--   • the author — their own notes;
--   • everyone in the organization — handover notes;
--   • whoever can read timesheets (has_permission('timesheets','read')) — all
--     notes of the organization (timesheet row, the per-location/day list).
-- Writes:
--   • insert — only on your own shift (open, or ended in the last 12 h);
--   • edit — the author, within 15 minutes of writing it;
--   • delete — the author within 15 minutes, or timesheets 'delete'.
-- organization_id / location_id are copied from the shift by a trigger (the
-- location the shift is at when the note is written) and can't be changed.
--
-- Read receipts (shift_note_reads) follow announcement_reads: one row per
-- (note, member); you mark only your own.
--
-- Demo data: notes carry demo_batch (stamped by _demo_stamp while seeding);
-- seed_demo_data now also writes a few. They hang off demo shifts and go with
-- the demo people on clear (ON DELETE CASCADE).
--
-- Not logged to the activity log on purpose: notes are content, not events,
-- and every shift_audit_log row may push.
-- =============================================================================

-- --- 1. Tables -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id        uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  location_id     uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  handover        boolean NOT NULL DEFAULT false,
  demo_batch      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_notes_shift_idx        ON public.shift_notes (shift_id);
CREATE INDEX IF NOT EXISTS shift_notes_author_idx       ON public.shift_notes (author_id);
CREATE INDEX IF NOT EXISTS shift_notes_org_created_idx  ON public.shift_notes (organization_id, created_at DESC);
-- The handover card: latest notes at one location.
CREATE INDEX IF NOT EXISTS shift_notes_location_created_idx ON public.shift_notes (location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shift_note_reads (
  note_id         uuid NOT NULL REFERENCES public.shift_notes(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX IF NOT EXISTS shift_note_reads_user_idx ON public.shift_note_reads (user_id);
CREATE INDEX IF NOT EXISTS shift_note_reads_org_idx  ON public.shift_note_reads (organization_id);

-- --- 2. Trigger: copy org/location from the shift, keep the rest immutable -------------
CREATE OR REPLACE FUNCTION public._shift_note_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shift public.shifts;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_shift FROM public.shifts WHERE id = NEW.shift_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That shift does not exist.' USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.organization_id := v_shift.organization_id;
    NEW.location_id     := v_shift.location_id;
    NEW.body            := btrim(NEW.body);
    NEW.updated_at      := NEW.created_at;
  ELSE
    -- Only the text and the handover flag can change.
    NEW.id              := OLD.id;
    NEW.organization_id := OLD.organization_id;
    NEW.shift_id        := OLD.shift_id;
    NEW.location_id     := OLD.location_id;
    NEW.author_id       := OLD.author_id;
    NEW.created_at      := OLD.created_at;
    NEW.body            := btrim(NEW.body);
    NEW.updated_at      := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._shift_note_defaults() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order: the defaults ("a00_") must fill
-- organization_id before _demo_stamp ("a0_") looks at it.
DROP TRIGGER IF EXISTS a00_shift_note_defaults ON public.shift_notes;
CREATE TRIGGER a00_shift_note_defaults BEFORE INSERT OR UPDATE ON public.shift_notes
  FOR EACH ROW EXECUTE FUNCTION public._shift_note_defaults();
DROP TRIGGER IF EXISTS a0_demo_stamp ON public.shift_notes;
CREATE TRIGGER a0_demo_stamp BEFORE INSERT OR UPDATE ON public.shift_notes
  FOR EACH ROW EXECUTE FUNCTION public._demo_stamp();

-- --- 3. RLS helper: may I write a note on this shift? ----------------------------------
-- Own shift, still open or ended within the last 12 hours ("at clock-out").
CREATE OR REPLACE FUNCTION public.can_note_shift(p_shift uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shifts s
     WHERE s.id = p_shift
       AND s.user_id = auth.uid()
       AND s.organization_id = public.get_my_org_id()
       AND (s.ended_at IS NULL OR s.ended_at > now() - interval '12 hours'))
$$;
-- Used inside an RLS policy → stays callable by authenticated (asks only about the caller).
REVOKE ALL ON FUNCTION public.can_note_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_note_shift(uuid) TO authenticated, service_role;

-- --- 4. RLS: shift_notes ----------------------------------------------------------------
ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_notes_select" ON public.shift_notes;
CREATE POLICY "shift_notes_select" ON public.shift_notes FOR SELECT TO authenticated
  USING (
    is_superadmin()
    OR (organization_id = get_my_org_id()
        AND (author_id = (SELECT auth.uid())
             OR handover
             OR (SELECT has_permission('timesheets', 'read'))))
  );

DROP POLICY IF EXISTS "shift_notes_insert" ON public.shift_notes;
CREATE POLICY "shift_notes_insert" ON public.shift_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND public.can_note_shift(shift_id));

DROP POLICY IF EXISTS "shift_notes_update" ON public.shift_notes;
CREATE POLICY "shift_notes_update" ON public.shift_notes FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) AND created_at > now() - interval '15 minutes')
  WITH CHECK (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "shift_notes_delete" ON public.shift_notes;
CREATE POLICY "shift_notes_delete" ON public.shift_notes FOR DELETE TO authenticated
  USING (
    is_superadmin()
    OR (author_id = (SELECT auth.uid()) AND created_at > now() - interval '15 minutes')
    OR ((SELECT has_permission('timesheets', 'delete')) AND organization_id = get_my_org_id())
  );

-- --- 5. RLS: shift_note_reads (same shape as announcement_reads) -----------------------
ALTER TABLE public.shift_note_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_note_reads_select" ON public.shift_note_reads;
CREATE POLICY "shift_note_reads_select" ON public.shift_note_reads FOR SELECT TO authenticated
  USING (
    is_superadmin()
    OR user_id = (SELECT auth.uid())
    OR ((SELECT has_permission('timesheets', 'read')) AND organization_id = get_my_org_id())
  );

-- Mark read: yourself, in your org, a note you can see (the subquery runs under RLS).
DROP POLICY IF EXISTS "shift_note_reads_insert" ON public.shift_note_reads;
CREATE POLICY "shift_note_reads_insert" ON public.shift_note_reads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND organization_id = get_my_org_id()
    AND EXISTS (SELECT 1 FROM public.shift_notes n
                 WHERE n.id = shift_note_reads.note_id AND n.organization_id = shift_note_reads.organization_id)
  );

-- Upsert on an existing receipt is an UPDATE: allow it on your own row.
DROP POLICY IF EXISTS "shift_note_reads_update" ON public.shift_note_reads;
CREATE POLICY "shift_note_reads_update" ON public.shift_note_reads FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND organization_id = get_my_org_id());

-- Un-mark (Undo): your own.
DROP POLICY IF EXISTS "shift_note_reads_delete" ON public.shift_note_reads;
CREATE POLICY "shift_note_reads_delete" ON public.shift_note_reads FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_note_reads TO authenticated;
REVOKE ALL ON public.shift_notes FROM anon;
REVOKE ALL ON public.shift_note_reads FROM anon;

-- --- 6. Demo data: a few notes ----------------------------------------------------------
-- seed_demo_data (20261125140000) stays as it is, renamed to _seed_demo_data_base;
-- the public seed_demo_data runs it and then adds the demo notes in the same
-- transaction, under the same batch (so _demo_stamp tags them).
DO $do$
BEGIN
  IF to_regprocedure('public._seed_demo_data_base(text)') IS NULL THEN
    ALTER FUNCTION public.seed_demo_data(text) RENAME TO _seed_demo_data_base;
  END IF;
END
$do$;
REVOKE ALL ON FUNCTION public._seed_demo_data_base(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._demo_seed_shift_notes(p_org uuid, p_batch uuid, p_en boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r   record;
  v_i integer := 0;
  v_n integer := 0;
BEGIN
  -- The latest finished demo shift at each demo location → a handover note.
  FOR r IN
    SELECT DISTINCT ON (s.location_id) s.id, s.user_id, s.location_id, s.ended_at
      FROM public.shifts s
      JOIN public.profiles p ON p.id = s.user_id AND p.demo_batch = p_batch
      JOIN public.locations l ON l.id = s.location_id AND l.demo_batch = p_batch
     WHERE s.organization_id = p_org AND s.ended_at IS NOT NULL
     ORDER BY s.location_id, s.ended_at DESC
  LOOP
    v_i := v_i + 1;
    INSERT INTO public.shift_notes (shift_id, author_id, body, handover, created_at)
    VALUES (r.id, r.user_id,
      CASE v_i
        WHEN 1 THEN CASE WHEN p_en THEN 'Milk delivery came, it''s in the storeroom. Coffee machine descaled, the grinder needs new beans first thing.'
                         ELSE 'Dorazilo mléko, je ve skladu. Kávovar odvápněný, do mlýnku ráno doplnit zrna.' END
        ELSE CASE WHEN p_en THEN 'We ran out of 0.3 l cups — ordered, they come tomorrow by 10. Use the 0.4 l ones until then.'
                  ELSE 'Došly kelímky 0,3 l — objednáno, přijdou zítra do 10. Do té doby berte 0,4 l.' END
      END,
      true, r.ended_at - interval '6 minutes');
    v_n := v_n + 1;
  END LOOP;

  -- An earlier, manager-only note (not a handover).
  SELECT s.id, s.user_id, s.ended_at INTO r
    FROM public.shifts s
    JOIN public.profiles p ON p.id = s.user_id AND p.demo_batch = p_batch
   WHERE s.organization_id = p_org AND s.ended_at IS NOT NULL AND s.ended_at < now() - interval '1 day'
   ORDER BY s.ended_at DESC LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.shift_notes (shift_id, author_id, body, handover, created_at)
    VALUES (r.id, r.user_id,
      CASE WHEN p_en THEN 'A customer returned a cake (dry sponge) — refunded 85 CZK, receipt in the drawer.'
           ELSE 'Zákazník reklamoval dort (suchý korpus), vráceno 85 Kč, účtenka v šuplíku.' END,
      false, r.ended_at - interval '3 minutes');
    v_n := v_n + 1;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._demo_seed_shift_notes(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_demo_data(p_lang text DEFAULT 'cs')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res   jsonb;
  v_batch uuid;
  v_org   uuid;
BEGIN
  v_res   := public._seed_demo_data_base(p_lang);   -- checks the caller is the owner
  v_batch := (v_res ->> 'batch')::uuid;
  v_org   := public.get_my_org_id();
  PERFORM set_config('shiftella.demo_seed', v_batch::text, true);
  PERFORM public._demo_seed_shift_notes(v_org, v_batch, lower(coalesce(p_lang, 'cs')) = 'en');
  PERFORM set_config('shiftella.demo_seed', '', true);
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_demo_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
