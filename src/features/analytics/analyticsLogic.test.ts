import { describe, expect, it } from 'vitest';
import {
    bucketDays,
    heatBin,
    heatGrid,
    isoDow,
    locationShares,
    niceCeil,
    peakSlots,
    periodRange,
    punctuality,
    topLate,
    topOvertime,
    variance,
    weekStart,
    weekdayAverages,
} from './analyticsLogic';
import type { AnalyticsDay, AnalyticsMember } from './types';

const member = (over: Partial<AnalyticsMember>): AnalyticsMember => ({
    user_id: 'u',
    name: 'A',
    worked: 0,
    planned: 0,
    absence_hours: 0,
    on_time: 0,
    late_15: 0,
    late_60: 0,
    no_show: 0,
    avg_late_min: null,
    cost: null,
    ...over,
});

const daysFrom = (from: string, n: number, worked = 8, planned = 7.5): AnalyticsDay[] => {
    const [y, m, d] = from.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => {
        const dt = new Date(Date.UTC(y, m - 1, d + i));
        return { day: dt.toISOString().slice(0, 10), worked, planned };
    });
};

describe('periodRange', () => {
    it('one month', () => expect(periodRange('2026-02', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' }));
    it('three months across the year boundary', () => expect(periodRange('2026-01', 3)).toEqual({ from: '2025-11-01', to: '2026-01-31' }));
    it('twelve months', () => expect(periodRange('2026-11', 12)).toEqual({ from: '2025-12-01', to: '2026-11-30' }));
    it('leap February', () => expect(periodRange('2028-02', 1).to).toBe('2028-02-29'));
});

describe('isoDow / weekStart', () => {
    it('Monday = 1, Sunday = 7', () => {
        expect(isoDow('2026-11-23')).toBe(1);
        expect(isoDow('2026-11-29')).toBe(7);
    });
    it('week starts on Monday, across months', () => {
        expect(weekStart('2026-11-29')).toBe('2026-11-23');
        expect(weekStart('2026-12-02')).toBe('2026-11-30');
        expect(weekStart('2026-11-23')).toBe('2026-11-23');
    });
});

describe('bucketDays', () => {
    it('keeps days for a month', () => {
        const r = bucketDays(daysFrom('2026-11-01', 30));
        expect(r.unit).toBe('day');
        expect(r.buckets).toHaveLength(30);
    });
    it('folds a quarter into Monday weeks, clipped to the period', () => {
        const r = bucketDays(daysFrom('2026-09-01', 91, 1, 2));
        expect(r.unit).toBe('week');
        // 1 Sep 2026 is a Tuesday: first bucket is 1–6 Sep (6 days).
        expect(r.buckets[0]).toEqual({ key: '2026-09-01', end: '2026-09-06', worked: 6, planned: 12 });
        expect(r.buckets[1].key).toBe('2026-09-07');
        const total = r.buckets.reduce((s, b) => s + b.worked, 0);
        expect(total).toBe(91);
    });
});

describe('weekdayAverages', () => {
    it('averages per weekday, Monday first', () => {
        const days: AnalyticsDay[] = [
            { day: '2026-11-23', worked: 10, planned: 8 }, // Mon
            { day: '2026-11-30', worked: 6, planned: 8 }, // Mon
            { day: '2026-11-29', worked: 3, planned: 0 }, // Sun
        ];
        const r = weekdayAverages(days);
        expect(r).toHaveLength(7);
        expect(r[0]).toEqual({ dow: 1, days: 2, elapsed: 2, worked: 8, planned: 8 });
        expect(r[6]).toEqual({ dow: 7, days: 1, elapsed: 1, worked: 3, planned: 0 });
        expect(r[2]).toEqual({ dow: 3, days: 0, elapsed: 0, worked: 0, planned: 0 });
    });
    it('averages worked hours over elapsed days only', () => {
        const days: AnalyticsDay[] = [
            { day: '2026-11-23', worked: 10, planned: 8 }, // Mon, past
            { day: '2026-11-30', worked: 0, planned: 8 }, // Mon, still ahead
        ];
        const [mon] = weekdayAverages(days, '2026-11-25');
        expect(mon).toEqual({ dow: 1, days: 2, elapsed: 1, worked: 10, planned: 8 });
    });
});

describe('heatGrid / heatBin / peakSlots', () => {
    it('places cells and trims the window to the data with context', () => {
        const g = heatGrid([
            { dow: 1, hour: 9, people: 1.5 },
            { dow: 5, hour: 22, people: 3 },
        ]);
        expect(g.values[0][9]).toBe(1.5);
        expect(g.values[4][22]).toBe(3);
        expect(g.max).toBe(3);
        expect(g.fromHour).toBe(6);
        expect(g.toHour).toBe(22);
    });
    it('keeps early starts and ignores junk', () => {
        const g = heatGrid([
            { dow: 2, hour: 4, people: 1 },
            { dow: 9, hour: 4, people: 99 },
        ]);
        expect(g.fromHour).toBe(4);
        expect(g.max).toBe(1);
    });
    it('empty → a default daytime window', () => {
        expect(heatGrid([])).toMatchObject({ max: 0, fromHour: 6, toHour: 22 });
    });
    it('bins: 0 is nobody, top bin is the busiest', () => {
        expect(heatBin(0, 4)).toBe(0);
        expect(heatBin(0.01, 4)).toBe(1);
        expect(heatBin(4, 4)).toBe(5);
        expect(heatBin(2, 4)).toBe(3);
        expect(heatBin(1, 0)).toBe(0);
    });
    it('peak slots: busiest first', () => {
        const p = peakSlots([
            { dow: 1, hour: 9, people: 1 },
            { dow: 6, hour: 19, people: 4 },
            { dow: 5, hour: 19, people: 4 },
            { dow: 2, hour: 9, people: 0 },
        ], 2);
        expect(p.map((c) => `${c.dow}@${c.hour}`)).toEqual(['5@19', '6@19']);
    });
});

describe('topOvertime', () => {
    it('ranks worked over plan and drops noise', () => {
        const r = topOvertime([
            member({ user_id: 'a', name: 'Ana', worked: 170, planned: 160 }),
            member({ user_id: 'b', name: 'Bob', worked: 100, planned: 120 }),
            member({ user_id: 'c', name: 'Cyril', worked: 50.1, planned: 50 }),
            member({ user_id: 'd', name: 'Dana', worked: 30, planned: 0 }),
        ]);
        expect(r.map((x) => x.user_id)).toEqual(['d', 'a']);
        expect(r[1].over).toBe(10);
    });
});

describe('topLate / punctuality', () => {
    it('ranks late + no-shows', () => {
        const r = topLate([
            member({ user_id: 'a', name: 'Ana', on_time: 10, late_15: 1 }),
            member({ user_id: 'b', name: 'Bob', late_60: 2, no_show: 1, avg_late_min: 75 }),
            member({ user_id: 'c', name: 'Cyril', on_time: 5 }),
        ]);
        expect(r.map((x) => x.user_id)).toEqual(['b', 'a']);
        expect(r[0]).toMatchObject({ late: 2, noShow: 1, checked: 3, avgLateMin: 75 });
    });
    it('on-time share', () => {
        expect(punctuality({ on_time: 6, late_15: 1, late_60: 1, no_show: 0, avg_late_min: 30 })).toEqual({ checked: 8, onTimeShare: 0.75 });
        expect(punctuality({ on_time: 0, late_15: 0, late_60: 0, no_show: 0, avg_late_min: null })).toEqual({ checked: 0, onTimeShare: null });
    });
});

describe('variance / locationShares / niceCeil', () => {
    it('variance against the plan', () => {
        expect(variance(110, 100)).toBeCloseTo(0.1);
        expect(variance(5, 0)).toBeNull();
    });
    it('shares by cost when visible, else hours', () => {
        const locs = [
            { location_id: 'a', name: 'A', worked: 10, planned: 10, cost: 1000 },
            { location_id: 'b', name: 'B', worked: 30, planned: 20, cost: 3000 },
            { location_id: 'c', name: 'C', worked: 0, planned: 0, cost: 0 },
        ];
        const byCost = locationShares(locs, true);
        expect(byCost.map((l) => [l.location_id, l.share])).toEqual([['b', 0.75], ['a', 0.25]]);
        const byHours = locationShares(locs.map((l) => ({ ...l, cost: null })), false);
        expect(byHours[0].share).toBe(0.75);
    });
    it('nice axis tops', () => {
        expect(niceCeil(0)).toBe(1);
        expect(niceCeil(7)).toBe(10);
        expect(niceCeil(13)).toBe(20);
        expect(niceCeil(41)).toBe(50);
        expect(niceCeil(100)).toBe(100);
    });
});
