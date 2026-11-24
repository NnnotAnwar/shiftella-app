import { describe, expect, it } from 'vitest';
import {
    formatMoney,
    isoWeekKey,
    isoWeeksSpan,
    monthWeeks,
    overtimeByPerson,
    overtimePremium,
    plannedShiftHours,
    rotaCost,
    type CostShift,
    type Rate,
} from './rotaCost';

/** A shift on a local day, `from`–`to` hours (to > 24 runs past midnight). */
const shift = (user: string, day: string, from: number, to: number, opts: Partial<CostShift> = {}): CostShift => {
    const [y, m, d] = day.split('-').map(Number);
    return {
        user_id: user,
        location_id: 'loc-a',
        starts_at: new Date(y, m - 1, d, 0, from * 60).toISOString(),
        ends_at: new Date(y, m - 1, d, 0, to * 60).toISOString(),
        all_day: false,
        published: true,
        ...opts,
    };
};
const allDay = (user: string, day: string, opts: Partial<CostShift> = {}): CostShift => {
    const [y, m, d] = day.split('-').map(Number);
    return shift(user, day, 0, 0, { starts_at: new Date(y, m - 1, d).toISOString(), ends_at: new Date(y, m - 1, d + 1).toISOString(), all_day: true, ...opts });
};

const CZK = (hourly_rate: number): Rate => ({ hourly_rate, currency: 'CZK' });

describe('plannedShiftHours', () => {
    it('deducts the mandatory breaks like the timesheets', () => {
        expect(plannedShiftHours(shift('a', '2026-11-02', 8, 14))).toBe(6); // exactly 6 h: no break
        expect(plannedShiftHours(shift('a', '2026-11-02', 8, 16))).toBe(7.5); // 8 h − 30 min
        expect(plannedShiftHours(shift('a', '2026-11-02', 8, 21))).toBe(12); // 13 h − 2 × 30 min
    });

    it('counts a night shift over midnight whole', () => {
        expect(plannedShiftHours(shift('a', '2026-11-02', 22, 30))).toBe(7.5);
    });

    it('counts an all-day mark as one normal working day', () => {
        expect(plannedShiftHours(allDay('a', '2026-11-02'))).toBe(8);
        expect(plannedShiftHours(allDay('a', '2026-11-02'), 30)).toBe(6);
    });
});

describe('isoWeekKey', () => {
    it('starts weeks on Monday', () => {
        expect(isoWeekKey(new Date(2026, 10, 23))).toBe('2026-W48'); // Mon
        expect(isoWeekKey(new Date(2026, 10, 29))).toBe('2026-W48'); // Sun
        expect(isoWeekKey(new Date(2026, 10, 30))).toBe('2026-W49'); // Mon
    });

    it('puts early-January days into the previous year when the week belongs to it', () => {
        expect(isoWeekKey(new Date(2027, 0, 1))).toBe('2026-W53'); // Fri 1 Jan 2027
        expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01'); // Thu 1 Jan 2026
        expect(isoWeekKey(new Date(2024, 11, 30))).toBe('2025-W01'); // Mon 30 Dec 2024
    });
});

describe('isoWeeksSpan / monthWeeks', () => {
    it('covers whole weeks around the month', () => {
        const { from, to } = isoWeeksSpan('2026-11'); // 1 Nov is a Sunday, 30 Nov a Monday
        expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 9, 26]); // Mon 26 Oct
        expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 11, 7]); // Mon 7 Dec
        expect(monthWeeks('2026-11').size).toBe(6); // W44 … W49
    });
});

describe('overtimeByPerson', () => {
    const fortyHours = () => 40;

    it('flags the hours above the weekly limit, per ISO week', () => {
        // Mon–Sat, 8–17 = 8.5 h net each → 51 h in W48.
        const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
        const ot = overtimeByPerson(days.map((d) => shift('a', d, 8, 17)), fortyHours);
        expect(ot.get('a')).toEqual({ hours: 11, weeks: [{ week: '2026-W48', planned: 51, limit: 40 }] });
    });

    it('does not flag a week at or under the limit', () => {
        const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
        expect(overtimeByPerson(days.map((d) => shift('a', d, 8, 16.5)), fortyHours).size).toBe(0); // 5 × 8 h
    });

    it('uses each person their own weekly hours (part-time)', () => {
        const days = ['2026-11-23', '2026-11-24', '2026-11-25'];
        const shifts = days.flatMap((d) => [shift('part', d, 8, 16.5), shift('full', d, 8, 16.5)]); // 24 h each
        const ot = overtimeByPerson(shifts, (u) => (u === 'part' ? 20 : 40));
        expect(ot.get('part')?.hours).toBe(4);
        expect(ot.has('full')).toBe(false);
    });

    it('judges a week across the month boundary as a whole, and can be limited to the month', () => {
        // W49 runs Mon 30 Nov – Sun 6 Dec: one day in November, the rest in December.
        const shifts = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'].map((d) => shift('a', d, 8, 17));
        const all = overtimeByPerson(shifts, fortyHours);
        expect(all.get('a')?.hours).toBe(11);
        const novOnly = overtimeByPerson(shifts, fortyHours, monthWeeks('2026-11'));
        expect(novOnly.get('a')?.hours).toBe(11); // W49 touches November, so it counts whole
        const octOnly = overtimeByPerson(shifts, fortyHours, monthWeeks('2026-10'));
        expect(octOnly.size).toBe(0);
    });
});

describe('rotaCost', () => {
    const rates: Record<string, Rate> = { a: CZK(200), b: CZK(150) };
    const rateOf = (u: string) => rates[u];

    it('sums hours × rate per row, location, person and month', () => {
        const shifts = [
            shift('a', '2026-11-02', 8, 16), // 7.5 h × 200 = 1500
            shift('a', '2026-11-03', 8, 16, { location_id: 'loc-b' }), // 7.5 h × 200
            shift('b', '2026-11-02', 8, 14), // 6 h × 150 = 900
        ];
        const c = rotaCost(shifts, rateOf);
        expect(c.total.hours).toBe(21);
        expect(c.total.cost).toEqual({ CZK: 3900 });
        expect(c.byLocation.get('loc-a')?.cost).toEqual({ CZK: 2400 });
        expect(c.byLocation.get('loc-b')?.hours).toBe(7.5);
        expect(c.byRow.get('loc-a|a')?.cost).toEqual({ CZK: 1500 });
        expect(c.byPerson.get('a')?.hours).toBe(15);
    });

    it('labels the draft part', () => {
        const c = rotaCost([shift('a', '2026-11-02', 8, 16), shift('a', '2026-11-03', 8, 16, { published: false })], rateOf);
        expect(c.total.hours).toBe(15);
        expect(c.total.draftHours).toBe(7.5);
        expect(c.total.cost).toEqual({ CZK: 3000 });
        expect(c.total.draftCost).toEqual({ CZK: 1500 });
    });

    it('never prices people whose rate the caller cannot read', () => {
        const c = rotaCost([shift('a', '2026-11-02', 8, 16), shift('boss', '2026-11-02', 8, 16)], rateOf);
        expect(c.total.hours).toBe(15);
        expect(c.total.cost).toEqual({ CZK: 1500 });
        expect([...c.total.unpriced]).toEqual(['boss']);
        expect(c.byRow.get('loc-a|boss')?.cost).toEqual({});
    });

    it('buckets shifts without a location under "none"', () => {
        const c = rotaCost([shift('a', '2026-11-02', 8, 16, { location_id: null })], rateOf);
        expect(c.byLocation.get('none')?.hours).toBe(7.5);
    });

    it('prices all-day marks at weekly / 5', () => {
        const c = rotaCost([allDay('b', '2026-11-02')], rateOf, () => 30);
        expect(c.total.hours).toBe(6);
        expect(c.total.cost).toEqual({ CZK: 900 });
    });
});

describe('overtimePremium / formatMoney', () => {
    it('adds 25 % of the rate for each overtime hour', () => {
        expect(overtimePremium(6, CZK(200))).toBe(300);
        expect(overtimePremium(6, undefined)).toBe(0);
    });

    it('formats whole money and joins currencies', () => {
        const fmt = (v: Record<string, number>) => formatMoney(v, 'en-GB').replace(/\s/g, ' ');
        expect(fmt({ CZK: 1234.6 })).toBe('CZK 1,235');
        expect(fmt({ CZK: 100, EUR: 0 })).toBe('CZK 100');
        expect(fmt({ CZK: 100, EUR: 20 })).toBe('CZK 100 + €20');
    });
});
