import { calculateNetHours } from '@features/shifts/shiftStats';

/**
 * --- ROTA COST ---
 * What the planned month costs before it is published: net planned hours
 * (breaks deducted like the timesheets) × each person's hourly rate, plus
 * overtime — planned hours in an ISO week above the person's weekly hours
 * (member_leave → org_leave_settings → 40, the same rule as `_weekly_hours`).
 *
 * Pure: the page hands in the shifts, the rates the caller may read (RLS keeps
 * peers' pay private, so a missing rate just means "no money shown") and the
 * weekly hours. Informative only — nothing here blocks planning.
 */

export interface CostShift {
    user_id: string;
    location_id: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    published: boolean;
}

export interface Rate {
    hourly_rate: number;
    currency: string;
}

/** Czech labour code § 114: overtime pay is at least +25 % of the average wage. */
export const OVERTIME_PREMIUM = 0.25;
export const DEFAULT_WEEKLY_HOURS = 40;

const MS_PER_HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Net hours a planned shift counts. An all-day mark (a location without
 * opening hours) has no real times, so it counts as one normal working day:
 * weekly hours / 5.
 */
export function plannedShiftHours(s: Pick<CostShift, 'starts_at' | 'ends_at' | 'all_day'>, weeklyHours = DEFAULT_WEEKLY_HOURS): number {
    if (s.all_day) return weeklyHours / 5;
    const gross = (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / MS_PER_HOUR;
    return calculateNetHours(gross);
}

/** ISO week of a local date as `YYYY-Www` (weeks start on Monday; week 1 holds the first Thursday). */
export function isoWeekKey(date: Date): string {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dow + 3); // the Thursday of this week decides the year
    const year = d.getFullYear();
    const firstThu = new Date(year, 0, 4);
    firstThu.setDate(firstThu.getDate() - ((firstThu.getDay() + 6) % 7) + 3);
    const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86_400_000));
    return `${year}-W${pad(week)}`;
}

/** Monday 00:00 of the ISO week holding the 1st of `YYYY-MM`, and the Monday after the week holding its last day. */
export function isoWeeksSpan(monthKey: string): { from: Date; to: Date } {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const from = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7));
    const to = new Date(y, m - 1, last.getDate() + (7 - ((last.getDay() + 6) % 7)));
    return { from, to };
}

export interface PersonOvertime {
    /** Planned hours above the weekly hours, summed over the ISO weeks. */
    hours: number;
    /** Each week over the limit: its key, planned hours and the limit. */
    weeks: { week: string; planned: number; limit: number }[];
}

/**
 * Overtime per person: planned net hours in each ISO week above their weekly
 * hours. Pass the shifts of every week touching the month (not only the month),
 * so a week that straddles two months is judged as a whole. With `onlyWeeks`,
 * weeks outside it are ignored.
 */
export function overtimeByPerson(
    shifts: CostShift[],
    weeklyOf: (userId: string) => number,
    onlyWeeks?: Set<string>,
): Map<string, PersonOvertime> {
    const perWeek = new Map<string, Map<string, number>>(); // user → week → hours
    for (const s of shifts) {
        const week = isoWeekKey(new Date(s.starts_at));
        if (onlyWeeks && !onlyWeeks.has(week)) continue;
        const weeks = perWeek.get(s.user_id) ?? new Map<string, number>();
        weeks.set(week, (weeks.get(week) ?? 0) + plannedShiftHours(s, weeklyOf(s.user_id)));
        perWeek.set(s.user_id, weeks);
    }
    const out = new Map<string, PersonOvertime>();
    for (const [userId, weeks] of perWeek) {
        const limit = weeklyOf(userId);
        const over = [...weeks]
            .filter(([, planned]) => planned > limit + 1e-9)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week, planned]) => ({ week, planned: round2(planned), limit }));
        if (over.length === 0) continue;
        out.set(userId, { hours: round2(over.reduce((sum, w) => sum + w.planned - w.limit, 0)), weeks: over });
    }
    return out;
}

/** ISO weeks that touch a month — the weeks its overtime is judged on. */
export function monthWeeks(monthKey: string): Set<string> {
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const set = new Set<string>();
    for (let d = 1; d <= days; d++) set.add(isoWeekKey(new Date(y, m - 1, d)));
    return set;
}

export interface CostLine {
    hours: number;
    draftHours: number;
    /** Money per currency — only for people whose rate the caller can read. */
    cost: Record<string, number>;
    draftCost: Record<string, number>;
    /** People with planned hours but no readable rate. */
    unpriced: Set<string>;
}

const emptyLine = (): CostLine => ({ hours: 0, draftHours: 0, cost: {}, draftCost: {}, unpriced: new Set() });

export interface RotaCost {
    total: CostLine;
    /** Keyed by location id ('none' for shifts without a location). */
    byLocation: Map<string, CostLine>;
    /** Keyed by `${locationKey}|${userId}` — one roster-grid row. */
    byRow: Map<string, CostLine>;
    /** Keyed by user id, across every location. */
    byPerson: Map<string, CostLine>;
}

export const locKey = (id: string | null) => id ?? 'none';

function add(line: CostLine, userId: string, hours: number, draft: boolean, rate: Rate | undefined) {
    line.hours += hours;
    if (draft) line.draftHours += hours;
    if (!rate) {
        line.unpriced.add(userId);
        return;
    }
    const money = hours * rate.hourly_rate;
    line.cost[rate.currency] = (line.cost[rate.currency] ?? 0) + money;
    if (draft) line.draftCost[rate.currency] = (line.draftCost[rate.currency] ?? 0) + money;
}

/** Planned hours and labour cost of a month's shifts (drafts and published). */
export function rotaCost(
    shifts: CostShift[],
    rateOf: (userId: string) => Rate | undefined,
    weeklyOf: (userId: string) => number = () => DEFAULT_WEEKLY_HOURS,
): RotaCost {
    const res: RotaCost = { total: emptyLine(), byLocation: new Map(), byRow: new Map(), byPerson: new Map() };
    const get = (map: Map<string, CostLine>, key: string) => {
        let line = map.get(key);
        if (!line) map.set(key, (line = emptyLine()));
        return line;
    };
    for (const s of shifts) {
        const hours = plannedShiftHours(s, weeklyOf(s.user_id));
        if (hours <= 0) continue;
        const rate = rateOf(s.user_id);
        const draft = !s.published;
        const loc = locKey(s.location_id);
        add(res.total, s.user_id, hours, draft, rate);
        add(get(res.byLocation, loc), s.user_id, hours, draft, rate);
        add(get(res.byRow, `${loc}|${s.user_id}`), s.user_id, hours, draft, rate);
        add(get(res.byPerson, s.user_id), s.user_id, hours, draft, rate);
    }
    return res;
}

/** Extra pay the overtime premium adds (the base hours are already in the cost). */
export function overtimePremium(overtimeHours: number, rate: Rate | undefined): number {
    return rate ? round2(overtimeHours * rate.hourly_rate * OVERTIME_PREMIUM) : 0;
}

/** Whole-currency money, e.g. `12 400 Kč`; several currencies are joined with " + ". */
export function formatMoney(byCurrency: Record<string, number>, locale?: string): string {
    return Object.entries(byCurrency)
        .filter(([, v]) => v > 0)
        .map(([currency, v]) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v))
        .join(' + ');
}

/** Compact hours: 7.5 → "7,5 h" in Czech, "7.5 h" in English. */
export function formatPlannedHours(h: number, locale?: string): string {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Math.round(h * 10) / 10)} h`;
}
