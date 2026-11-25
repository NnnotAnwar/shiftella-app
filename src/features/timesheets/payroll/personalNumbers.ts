import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@shared/api/supabaseClient';
import { can, isSuperAdmin, outranks, rankOf, RANK } from '@shared/auth/permissions';
import type { Profile, User } from '@shared/types';

/**
 * --- OSOBNÍ ČÍSLO (personal number) ---
 * The member's number in the accountant's payroll program (Money S3 pairs the
 * attendance import by it, max 10 characters). Stored in `member_payroll`
 * (migration 20261125120000): readable by the member and by Timesheets / Team
 * viewers in the org; written only through `set_member_personal_number`
 * (Team CHANGE over people below you; a Head Admin also for themself). Unique
 * per organization.
 */

const RowSchema = z.object({ user_id: z.string(), personal_number: z.string() });

export const personalNumberService = {
    /** userId → number, for everyone the caller may see (RLS). */
    async getAll(): Promise<Map<string, string>> {
        const { data, error } = await supabase.from('member_payroll').select('user_id, personal_number');
        if (error) throw error;
        return new Map(z.array(RowSchema).parse(data ?? []).map((r) => [r.user_id, r.personal_number]));
    },

    /** Set, change or clear (blank) one member's number. */
    async set(userId: string, value: string): Promise<void> {
        const { error } = await supabase.rpc('set_member_personal_number', { p_user: userId, p_number: value.trim() || null });
        if (error) throw new Error(error.message.includes('PERSONAL_NUMBER_TAKEN') ? 'PERSONAL_NUMBER_TAKEN' : error.message);
    },
};

/** Mirrors the RPC's rule, so the UI only offers the field where saving works. */
export function canSetPersonalNumber(user: User | null | undefined, target: Pick<Profile, 'id' | 'role' | 'org_role'>): boolean {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    if (!can(user, 'members.manage')) return false;
    return outranks(user, target) || (target.id === user.id && rankOf(user) >= RANK.OWNER);
}

const KEY = ['member-payroll', 'personal-numbers'] as const;

export function usePersonalNumbers(enabled = true) {
    const qc = useQueryClient();
    const query = useQuery({ queryKey: KEY, queryFn: () => personalNumberService.getAll(), enabled });
    const save = useMutation({
        mutationFn: ({ userId, value }: { userId: string; value: string }) => personalNumberService.set(userId, value),
        // Show the saved value at once (no flicker back to the old one before the refetch).
        onSuccess: (_d, { userId, value }) =>
            qc.setQueryData<Map<string, string>>(KEY, (old) => {
                const next = new Map(old ?? []);
                if (value.trim()) next.set(userId, value.trim());
                else next.delete(userId);
                return next;
            }),
        onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    });
    return { numbers: query.data ?? new Map<string, string>(), isLoading: query.isLoading, save };
}
