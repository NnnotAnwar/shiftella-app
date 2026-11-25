-- =============================================================================
-- OSOBNÍ ČÍSLO — the member's personal number in the accountant's payroll
-- program, so the payroll export (Timesheets → Podklady pro mzdy) can pair
-- people in Money S3 (Dochazka.xsd `OsobniCislo`, max 10 characters).
-- -----------------------------------------------------------------------------
-- • Own table, not a profiles column: profiles are readable by the whole
--   organization; this is HR data.
-- • read   the member themself; Timesheets VIEW or Team VIEW in the same org
--          (the export runs on the Timesheets page).
-- • write  set_member_personal_number() only — Team CHANGE (members.write) over
--          members below you (Head Admin also for themself); Superadmin always.
-- • Unique per organization (two people with one number would be merged by
--   the payroll import) → 'PERSONAL_NUMBER_TAKEN'.
-- • `personal_number_changed` lands in the Activity Log (subject = the member).
-- • GDPR: the row cascades with the profile.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.member_payroll (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  personal_number text NOT NULL CHECK (char_length(personal_number) BETWEEN 1 AND 10 AND personal_number = btrim(personal_number)),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS member_payroll_org_number_key ON public.member_payroll (organization_id, personal_number);
CREATE INDEX IF NOT EXISTS member_payroll_updated_by_idx ON public.member_payroll (updated_by);

ALTER TABLE public.member_payroll ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_payroll FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_payroll TO authenticated;
GRANT ALL ON public.member_payroll TO service_role;

DROP POLICY IF EXISTS "member_payroll_select" ON public.member_payroll;
CREATE POLICY "member_payroll_select" ON public.member_payroll FOR SELECT TO authenticated
  USING (
    (SELECT public.is_superadmin())
    OR user_id = (SELECT auth.uid())
    OR (((SELECT public.has_permission('timesheets', 'read')) OR (SELECT public.has_permission('members', 'read')))
        AND organization_id = (SELECT public.get_my_org_id()))
  );

-- Set or clear (NULL / blank) a member's osobní číslo.
CREATE OR REPLACE FUNCTION public.set_member_personal_number(p_user uuid, p_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org  uuid;
  v_num  text := NULLIF(btrim(COALESCE(p_number, '')), '');
  v_prev text;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = p_user;
  IF v_org IS NULL OR NOT (
       public.is_superadmin()
       OR (public.has_permission('members', 'write') AND v_org = public.get_my_org_id()
           AND (public.is_my_subordinate(p_user) OR (p_user = auth.uid() AND public.my_role_rank() >= 40)))
     ) THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_num IS NOT NULL AND char_length(v_num) > 10 THEN
    RAISE EXCEPTION 'PERSONAL_NUMBER_LENGTH' USING ERRCODE = 'check_violation';
  END IF;

  SELECT personal_number INTO v_prev FROM public.member_payroll WHERE user_id = p_user;
  IF v_prev IS NOT DISTINCT FROM v_num THEN RETURN; END IF;

  IF v_num IS NULL THEN
    DELETE FROM public.member_payroll WHERE user_id = p_user;
  ELSE
    BEGIN
      INSERT INTO public.member_payroll AS m (user_id, organization_id, personal_number, updated_by)
      VALUES (p_user, v_org, v_num, auth.uid())
      ON CONFLICT (user_id) DO UPDATE
         SET personal_number = EXCLUDED.personal_number, organization_id = EXCLUDED.organization_id,
             updated_at = now(), updated_by = EXCLUDED.updated_by;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'PERSONAL_NUMBER_TAKEN' USING ERRCODE = 'unique_violation';
    END;
  END IF;

  PERFORM public._audit(v_org, 'personal_number_changed', p_user,
    jsonb_build_object('personal_number', v_num, 'previous', v_prev));
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_personal_number(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_personal_number(uuid, text) TO authenticated, service_role;
