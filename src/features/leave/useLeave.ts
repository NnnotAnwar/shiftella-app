import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@features/auth/AuthContext';
import { leaveService, type LeaveSettings } from './leaveService';

export const leaveKeys = {
    all: ['leave'] as const,
    settings: (orgId: string) => ['leave', 'settings', orgId] as const,
    balances: (year: number) => ['leave', 'balances', year] as const,
    member: (userId: string) => ['leave', 'member', userId] as const,
    weekly: (orgId: string) => ['leave', 'weekly', orgId] as const,
    adjustments: (userId: string, year: number) => ['leave', 'adjustments', userId, year] as const,
};

export const currentYear = () => new Date().getFullYear();

/** The organization's absence settings (defaults until it saves its own). */
export function useLeaveSettings() {
    const { user } = useAuthContext();
    const orgId = user?.organization_id ?? '';
    return useQuery({ queryKey: leaveKeys.settings(orgId), queryFn: () => leaveService.getSettings(orgId), enabled: !!orgId, staleTime: 5 * 60_000 });
}

export function useSaveLeaveSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (s: LeaveSettings) => leaveService.saveSettings(s),
        onSuccess: () => void qc.invalidateQueries({ queryKey: leaveKeys.all }),
    });
}

/** Each member's own weekly hours (only those set; the org default covers the rest). */
export function useMemberWeeklyHours(enabled = true) {
    const { user } = useAuthContext();
    const orgId = user?.organization_id ?? '';
    return useQuery({ queryKey: leaveKeys.weekly(orgId), queryFn: () => leaveService.weeklyHoursAll(), enabled: enabled && !!orgId, staleTime: 5 * 60_000 });
}

/** Balances for a year: the caller's own row, or everyone's for people who see requests. */
export function useLeaveBalances(year: number, enabled = true) {
    const { user } = useAuthContext();
    return useQuery({ queryKey: leaveKeys.balances(year), queryFn: () => leaveService.balances(year), enabled: enabled && !!user, staleTime: 60_000 });
}

/** Anything that moves a balance (a decision, a new request, an adjustment) refreshes them all. */
export function useInvalidateLeave() {
    const qc = useQueryClient();
    return () => void qc.invalidateQueries({ queryKey: leaveKeys.all });
}
