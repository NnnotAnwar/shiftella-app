import { z } from 'zod';
import { supabase } from '@shared/api/supabaseClient';
import { DEFAULT_ENABLED_KINDS, LEAVE_KINDS, type LeaveKind } from '@features/schedule/timeOffShared';

/**
 * --- LEAVE SERVICE ---
 * The organization's absence settings, everyone's balances and the manual
 * adjustments. Balances are computed in the database (leave_balances):
 *   vacation  = entitlement (hours / year) + adjustments − approved vacation
 *   náhradní volno = hours clocked on public holidays + adjustments − approved comp_time
 * Writes go through RPCs that only deciders may call, and never for themselves.
 */

const num = z.coerce.number();

export const LeaveSettingsSchema = z.object({
    enabled_kinds: z.array(z.enum(LEAVE_KINDS as [LeaveKind, ...LeaveKind[]])),
    weekly_hours: num,
    vacation_weeks: num,
    holiday_comp_time: z.boolean(),
});
export type LeaveSettings = z.infer<typeof LeaveSettingsSchema>;

export const DEFAULT_LEAVE_SETTINGS: LeaveSettings = {
    enabled_kinds: [...DEFAULT_ENABLED_KINDS],
    weekly_hours: 40,
    vacation_weeks: 4,
    holiday_comp_time: true,
};

export const LeaveBalanceSchema = z.object({
    user_id: z.string(),
    name: z.string().nullable().transform((v) => v ?? '—'),
    weekly_hours: num,
    vacation_entitlement: num,
    vacation_custom: z.boolean(),
    vacation_adjust: num,
    vacation_used: num,
    vacation_pending: num,
    vacation_left: num,
    comp_earned: num,
    comp_adjust: num,
    comp_used: num,
    comp_pending: num,
    comp_left: num,
});
export type LeaveBalance = z.infer<typeof LeaveBalanceSchema>;

export const LeaveAdjustmentSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    bucket: z.enum(['vacation', 'comp_time']),
    year: z.number().nullable(),
    hours: num,
    note: z.string().nullable(),
    created_at: z.string(),
});
export type LeaveAdjustment = z.infer<typeof LeaveAdjustmentSchema>;

export const MemberLeaveSchema = z.object({
    user_id: z.string(),
    weekly_hours: num.nullable(),
    vacation_hours: num.nullable(),
});
export type MemberLeave = z.infer<typeof MemberLeaveSchema>;

export const leaveService = {
    async getSettings(orgId: string): Promise<LeaveSettings> {
        const { data, error } = await supabase
            .from('org_leave_settings')
            .select('enabled_kinds, weekly_hours, vacation_weeks, holiday_comp_time')
            .eq('organization_id', orgId)
            .maybeSingle();
        if (error) throw error;
        return data ? LeaveSettingsSchema.parse(data) : DEFAULT_LEAVE_SETTINGS;
    },

    async saveSettings(s: LeaveSettings): Promise<void> {
        const { error } = await supabase.rpc('set_org_leave_settings', {
            p_enabled_kinds: s.enabled_kinds,
            p_weekly_hours: s.weekly_hours,
            p_vacation_weeks: s.vacation_weeks,
            p_holiday_comp_time: s.holiday_comp_time,
        });
        if (error) throw error;
    },

    /** Own row for members; everyone in the organization for people who see requests. */
    async balances(year: number): Promise<LeaveBalance[]> {
        const { data, error } = await supabase.rpc('leave_balances', { p_year: year });
        if (error) throw error;
        return z.array(LeaveBalanceSchema).parse(data ?? []);
    },

    async memberLeave(userId: string): Promise<MemberLeave | null> {
        const { data, error } = await supabase.from('member_leave').select('user_id, weekly_hours, vacation_hours').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data ? MemberLeaveSchema.parse(data) : null;
    },

    /** Weekly hours and yearly vacation entitlement (null = the organization's default). */
    async setMemberLeave(userId: string, weeklyHours: number | null, vacationHours: number | null): Promise<void> {
        const { error } = await supabase.rpc('set_member_leave', { p_user: userId, p_weekly_hours: weeklyHours, p_vacation_hours: vacationHours });
        if (error) throw error;
    },

    async adjustments(userId: string, year: number): Promise<LeaveAdjustment[]> {
        const { data, error } = await supabase
            .from('leave_adjustments')
            .select('id, user_id, bucket, year, hours, note, created_at')
            .eq('user_id', userId)
            .or(`bucket.eq.comp_time,year.eq.${year}`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return z.array(LeaveAdjustmentSchema).parse(data ?? []);
    },

    async addAdjustment(userId: string, bucket: 'vacation' | 'comp_time', hours: number, note: string | null, year: number): Promise<void> {
        const { error } = await supabase.rpc('add_leave_adjustment', {
            p_user: userId,
            p_bucket: bucket,
            p_hours: hours,
            p_note: note,
            p_year: bucket === 'vacation' ? year : null,
        });
        if (error) throw error;
    },

    async deleteAdjustment(id: string): Promise<void> {
        const { error } = await supabase.rpc('delete_leave_adjustment', { p_id: id });
        if (error) throw error;
    },
};
