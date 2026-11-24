import type { AnalyticsDay, AnalyticsLocation, AnalyticsMember, HeatCell, Lateness } from './types';

/**
 * --- ANALYTICS TRANSFORMS ---
 * Pure shaping of the `org_analytics` payload for the charts and tables. The
 * database does the heavy sums; these only bucket, rank and scale.
 */

/** Months a period can span, ending with the picked month. */
export const SPANS = [1, 3, 6, 12] as const;
export type Span = (typeof SPANS)[number];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** First and last day of `span` months that end with `month` (YYYY-MM). */
export function periodRange(month: string, span: Span): { from: string; to: string } {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - span, 1));
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: iso(start.getUTCFullYear(), start.getUTCMonth() + 1, 1), to: iso(y, m, last) };
}

/** ISO weekday of a YYYY-MM-DD date: 1 = Monday … 7 = Sunday. */
export function isoDow(day: string): number {
    const [y, m, d] = day.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dow === 0 ? 7 : dow;
}

/** The Monday of the week a date falls in (YYYY-MM-DD). */
export function weekStart(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - (isoDow(day) - 1)));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export interface HoursBucket {
    /** First day of the bucket (YYYY-MM-DD). */
    key: string;
    /** Last day of the bucket inside the period. */
    end: string;
    worked: number;
    planned: number;
}

/**
 * Bars for the hours chart: one per day while that stays readable (up to
 * `maxDays`), otherwise one per week (Monday-first, clipped to the period).
 */
export function bucketDays(days: AnalyticsDay[], maxDays = 45): { unit: 'day' | 'week'; buckets: HoursBucket[] } {
    if (days.length <= maxDays) {
        return { unit: 'day', buckets: days.map((d) => ({ key: d.day, end: d.day, worked: d.worked, planned: d.planned })) };
    }
    const byWeek = new Map<string, HoursBucket>();
    for (const d of days) {
        const k = weekStart(d.day);
        const b = byWeek.get(k);
        if (b) {
            b.worked += d.worked;
            b.planned += d.planned;
            b.end = d.day;
        } else {
            byWeek.set(k, { key: d.day, end: d.day, worked: d.worked, planned: d.planned });
        }
    }
    return { unit: 'week', buckets: [...byWeek.values()] };
}

export interface WeekdayAvg {
    dow: number; // 1 = Monday
    /** Such weekdays in the period / of them already past (worked averages over these). */
    days: number;
    elapsed: number;
    worked: number; // average hours per such day
    planned: number;
}

/**
 * Average worked / planned hours per weekday (Monday-first, all seven).
 * Worked hours average over the days up to `today` only, so a month still
 * running isn't diluted by days nobody could have worked yet.
 */
export function weekdayAverages(days: AnalyticsDay[], today = '9999-12-31'): WeekdayAvg[] {
    const acc = Array.from({ length: 7 }, (_, i) => ({ dow: i + 1, days: 0, elapsed: 0, worked: 0, planned: 0 }));
    for (const d of days) {
        const a = acc[isoDow(d.day) - 1];
        a.days += 1;
        a.planned += d.planned;
        if (d.day <= today) {
            a.elapsed += 1;
            a.worked += d.worked;
        }
    }
    return acc.map((a) => ({
        ...a,
        worked: a.elapsed ? a.worked / a.elapsed : 0,
        planned: a.days ? a.planned / a.days : 0,
    }));
}

export interface HeatGrid {
    /** values[dow - 1][hour] = average people on the clock. */
    values: number[][];
    max: number;
    /** Hours to draw (inclusive); trims the empty night unless there is data. */
    fromHour: number;
    toHour: number;
}

/** 7 × 24 grid of average headcount, plus the hour window worth drawing. */
export function heatGrid(cells: HeatCell[]): HeatGrid {
    const values = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    let max = 0;
    let lo = 24;
    let hi = -1;
    for (const c of cells) {
        if (c.dow < 1 || c.dow > 7 || c.hour < 0 || c.hour > 23) continue;
        values[c.dow - 1][c.hour] = c.people;
        if (c.people > 0) {
            max = Math.max(max, c.people);
            lo = Math.min(lo, c.hour);
            hi = Math.max(hi, c.hour);
        }
    }
    if (hi < 0) return { values, max: 0, fromHour: 6, toHour: 22 };
    // A little context either side, never past the day.
    return { values, max, fromHour: Math.max(0, Math.min(lo, 6)), toHour: Math.min(23, Math.max(hi, 20)) };
}

/** Sequential bin 0…bins: 0 means nobody; otherwise scaled to the busiest cell. */
export function heatBin(value: number, max: number, bins = 5): number {
    if (value <= 0 || max <= 0) return 0;
    return Math.min(bins, Math.max(1, Math.ceil((value / max) * bins)));
}

/** The busiest slots, for the one-line summary under the heatmap. */
export function peakSlots(cells: HeatCell[], n = 3): HeatCell[] {
    return [...cells].filter((c) => c.people > 0).sort((a, b) => b.people - a.people || a.dow - b.dow || a.hour - b.hour).slice(0, n);
}

export interface Overtime {
    user_id: string;
    name: string;
    worked: number;
    planned: number;
    over: number;
}

/** People who worked more than planned, most first (ignores rounding noise). */
export function topOvertime(members: AnalyticsMember[], n = 5, minHours = 0.25): Overtime[] {
    return members
        .map((m) => ({ user_id: m.user_id, name: m.name, worked: m.worked, planned: m.planned, over: m.worked - m.planned }))
        .filter((m) => m.over >= minHours)
        .sort((a, b) => b.over - a.over || a.name.localeCompare(b.name))
        .slice(0, n);
}

export interface LateRow {
    user_id: string;
    name: string;
    late: number; // late_15 + late_60
    noShow: number;
    checked: number;
    avgLateMin: number | null;
}

/** Members with late arrivals or no-shows, worst first. */
export function topLate(members: AnalyticsMember[], n = 5): LateRow[] {
    return members
        .map((m) => ({
            user_id: m.user_id,
            name: m.name,
            late: m.late_15 + m.late_60,
            noShow: m.no_show,
            checked: m.on_time + m.late_15 + m.late_60 + m.no_show,
            avgLateMin: m.avg_late_min,
        }))
        .filter((m) => m.late + m.noShow > 0)
        .sort((a, b) => b.late + b.noShow - (a.late + a.noShow) || a.name.localeCompare(b.name))
        .slice(0, n);
}

/** Shifts checked for punctuality and the on-time share (null with nothing to check). */
export function punctuality(l: Lateness): { checked: number; onTimeShare: number | null } {
    const checked = l.on_time + l.late_15 + l.late_60 + l.no_show;
    return { checked, onTimeShare: checked ? l.on_time / checked : null };
}

/** Relative difference of worked to planned (0.1 = 10 % over); null with no plan. */
export function variance(worked: number, planned: number): number | null {
    return planned > 0 ? (worked - planned) / planned : null;
}

export interface LocationShare extends AnalyticsLocation {
    /** Share of the measure (cost when visible, else worked hours), 0…1. */
    share: number;
}

/** Each location's share of labour cost — or of worked hours when cost isn't visible. */
export function locationShares(locations: AnalyticsLocation[], byCost: boolean): LocationShare[] {
    const value = (l: AnalyticsLocation) => (byCost ? (l.cost ?? 0) : l.worked);
    const total = locations.reduce((s, l) => s + value(l), 0);
    return locations
        .filter((l) => value(l) > 0 || l.planned > 0)
        .map((l) => ({ ...l, share: total > 0 ? value(l) / total : 0 }))
        .sort((a, b) => value(b) - value(a));
}

/** A tidy axis top for hours: steps of 1 / 2 / 5 / 10 / 20 / 50 … */
export function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return step * exp;
}
