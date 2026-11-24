import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { can } from '@shared/auth/permissions';
import type { ScheduledShift, User } from '@shared/types';
import { useEntitlements } from '@features/billing/useBilling';
import { useWages } from '@features/wages/useWages';
import { useLeaveSettings, useMemberWeeklyHours } from '@features/leave/useLeave';
import { scheduleService } from './scheduleService';
import { DEFAULT_WEEKLY_HOURS, isoWeeksSpan, monthWeeks, overtimeByPerson, rotaCost, type PersonOvertime, type Rate } from './rotaCost';

/**
 * --- useRotaCost ---
 * Planned hours, labour cost and overtime of the month on the team rota.
 *   - hours and overtime: for people who plan the rota (or may see wages);
 *   - money: only for people who may see wages (`wages.edit`, the Wages plan
 *     feature) — and even then only for the rates RLS returns (their
 *     subordinates), so nobody's pay leaks through the rota.
 * Overtime is judged on whole ISO weeks, so the weeks around the month are
 * loaded too (a week that straddles two months still counts whole).
 */
export function useRotaCost({ user, enabled, monthKey, shifts }: { user: User | null; enabled: boolean; monthKey: string; shifts: ScheduledShift[] }) {
    const ent = useEntitlements();
    const showMoney = enabled && !!user && ent.can('wages') && can(user, 'wages.edit');
    const wages = useWages(showMoney ? user : null);
    const settings = useLeaveSettings();
    const memberWeekly = useMemberWeeklyHours(enabled);

    const span = useMemo(() => isoWeeksSpan(monthKey), [monthKey]);
    // Under the ['schedule'] key, so every rota change refreshes it too.
    const weeksQ = useQuery({
        queryKey: ['schedule', monthKey, 'weeks'],
        queryFn: () => scheduleService.getRange(span.from.toISOString(), span.to.toISOString()),
        enabled: enabled && !!user,
    });

    const rates = useMemo(() => {
        const map = new Map<string, Rate>();
        if (!showMoney) return map;
        for (const w of wages.org.data ?? []) map.set(w.user_id, { hourly_rate: w.hourly_rate, currency: w.currency });
        return map;
    }, [showMoney, wages.org.data]);

    const orgWeekly = settings.data?.weekly_hours ?? DEFAULT_WEEKLY_HOURS;
    const weekly = memberWeekly.data;
    const weeklyOf = useMemo(() => (userId: string) => weekly?.get(userId) ?? orgWeekly, [weekly, orgWeekly]);
    const rateOf = useMemo(() => (userId: string) => rates.get(userId), [rates]);

    const cost = useMemo(() => rotaCost(enabled ? shifts : [], rateOf, weeklyOf), [enabled, shifts, rateOf, weeklyOf]);
    const overtime = useMemo(
        () => (enabled ? overtimeByPerson(weeksQ.data ?? shifts, weeklyOf, monthWeeks(monthKey)) : new Map<string, PersonOvertime>()),
        [enabled, weeksQ.data, shifts, weeklyOf, monthKey],
    );

    return { enabled, showMoney, cost, overtime, rateOf, weeklyOf };
}
