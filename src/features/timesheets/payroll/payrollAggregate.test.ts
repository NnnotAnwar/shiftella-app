import { describe, it, expect } from 'vitest';
import {
    buildPayrollReport,
    clipAbsence,
    countDays,
    splitShiftHours,
    type PayrollShift,
    type PayrollTimeOff,
} from './payrollAggregate';
import { buildMoneyS3Xml } from './moneyS3Xml';
import { payrollCsv } from './payrollExport';

// Local-time helpers so the tests hold in any runner timezone.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const shift = (start: string, end: string | null, user_id = 'u1'): PayrollShift => ({ user_id, started_at: start, ended_at: end });
const leave = (p: Partial<PayrollTimeOff>): PayrollTimeOff => ({
    user_id: 'u1',
    kind: 'vacation',
    starts_on: '2026-11-02',
    ends_on: '2026-11-02',
    hours: 8,
    status: 'approved',
    ...p,
});

// 2026: 28 Oct (Wed), 17 Nov (Tue), 24–26 Dec (Thu–Sat).
const HOLIDAYS = new Set(['2026-10-28', '2026-11-17', '2026-12-24', '2026-12-25', '2026-12-26']);
const PEOPLE = [{ id: 'u1', name: 'Anna Nováková', personalNumber: '0001' }];

const report = (shifts: PayrollShift[], timeOff: PayrollTimeOff[] = [], month = '2026-11') =>
    buildPayrollReport({ month, people: PEOPLE, shifts, timeOff, holidays: HOLIDAYS });

describe('splitShiftHours', () => {
    it('cuts a night shift at 22:00, midnight and 06:00', () => {
        // Fri 6 Nov 20:00 → Sat 7 Nov 04:00
        const s = splitShiftHours(new Date(2026, 10, 6, 20).getTime(), new Date(2026, 10, 7, 4).getTime(), HOLIDAYS);
        expect(s.night).toBe(6);
        expect(s.weekend).toBe(4);
        expect(s.holiday).toBe(0);
    });

    it('counts early morning before 06:00 as night', () => {
        const s = splitShiftHours(new Date(2026, 10, 4, 4).getTime(), new Date(2026, 10, 4, 10).getTime(), HOLIDAYS);
        expect(s.night).toBe(2);
    });
});

describe('buildPayrollReport — worked hours', () => {
    it('plain weekday: net of the 30-min break, no surcharges', () => {
        const [r] = report([shift(at(2026, 11, 4, 8), at(2026, 11, 4, 16))]).rows;
        expect(r.workedHours).toBe(7.5);
        expect(r.breakHours).toBe(0.5);
        expect(r.grossHours).toBe(8);
        expect([r.holidayHours, r.weekendHours, r.nightHours]).toEqual([0, 0, 0]);
        expect(r.daysWorked).toBe(1);
    });

    it('scales the night / weekend parts by the net/gross ratio', () => {
        // 8 h gross → 7.5 net, ratio 0.9375: night 6 h → 5.63, Saturday 4 h → 3.75
        const [r] = report([shift(at(2026, 11, 6, 20), at(2026, 11, 7, 4))]).rows;
        expect(r.workedHours).toBe(7.5);
        expect(r.nightHours).toBe(5.63);
        expect(r.weekendHours).toBe(3.75);
    });

    it('public holiday on a weekday: holiday hours + Money "Svátky" day', () => {
        const [r] = report([shift(at(2026, 11, 17, 10), at(2026, 11, 17, 14))]).rows;
        expect(r.holidayHours).toBe(4);
        expect(r.holidayWorkdayDays).toBe(1);
        expect(r.holidayWorkdayHours).toBe(4);
        expect(r.regularDays).toBe(0);
    });

    it('a holiday on Saturday counts as both holiday and weekend, but not a workday holiday', () => {
        const [r] = report([shift(at(2026, 12, 26, 8), at(2026, 12, 26, 12))], [], '2026-12').rows;
        expect(r.holidayHours).toBe(4);
        expect(r.weekendHours).toBe(4);
        expect(r.holidayWorkdayDays).toBe(0);
    });

    it('a night shift running into a holiday splits at midnight', () => {
        // Mon 16 Nov 22:00 → Tue 17 Nov (holiday) 06:00, ratio 0.9375
        const [r] = report([shift(at(2026, 11, 16, 22), at(2026, 11, 17, 6))]).rows;
        expect(r.nightHours).toBe(7.5);
        expect(r.holidayHours).toBe(5.63);
        expect(r.daysWorked).toBe(1);
        expect(r.regularDays).toBe(1);
        expect(r.holidayWorkdayDays).toBe(1);
    });

    it('belongs to the month the shift started in; open shifts are only counted', () => {
        const rows = report([
            shift(at(2026, 10, 31, 22), at(2026, 11, 1, 6)), // October
            shift(at(2026, 11, 30, 22), at(2026, 12, 1, 6)), // November
            shift(at(2026, 11, 20, 8), null), // still running
        ]).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0].shiftCount).toBe(1);
        expect(rows[0].workedHours).toBe(7.5);
        expect(rows[0].openShifts).toBe(1);
    });

    it('leaves out people with nothing in the month, includes wages only when given', () => {
        const r = buildPayrollReport({
            month: '2026-11',
            people: [...PEOPLE, { id: 'u2', name: 'Bob' }],
            shifts: [shift(at(2026, 11, 4, 8), at(2026, 11, 4, 12))],
            timeOff: [],
            holidays: HOLIDAYS,
            wages: new Map([['u1', { rate: 180, currency: 'CZK' }]]),
        });
        expect(r.rows.map((x) => x.personId)).toEqual(['u1']);
        expect(r.rows[0].rate).toBe(180);
        expect(report([shift(at(2026, 11, 4, 8), at(2026, 11, 4, 12))]).rows[0].rate).toBeNull();
    });
});

describe('absences', () => {
    it('counts calendar, working and holiday days', () => {
        expect(countDays('2026-11-16', '2026-11-22', HOLIDAYS)).toEqual({ calendar: 7, work: 4, holidayWork: 1 });
    });

    it('a week of vacation inside the month keeps its hours', () => {
        const r = report([], [leave({ starts_on: '2026-11-02', ends_on: '2026-11-06', hours: 40 })]);
        expect(r.rows[0].absenceHours.vacation).toBe(40);
        expect(r.rows[0].absences[0]).toMatchObject({ calendarDays: 5, workDays: 5, hours: 40 });
        expect(r.kinds).toEqual(['vacation']);
    });

    it('splits a cross-month absence by working days on each side', () => {
        // Thu 29 Oct – Tue 3 Nov: work days 29, 30 Oct + 2, 3 Nov (28 Oct holiday is outside).
        const a = clipAbsence(leave({ kind: 'sick', starts_on: '2026-10-29', ends_on: '2026-11-03', hours: 32 }), '2026-11', HOLIDAYS)!;
        expect(a).toMatchObject({ from: '2026-11-01', to: '2026-11-03', calendarDays: 3, workDays: 2, hours: 16 });
        expect(a.startsOn).toBe('2026-10-29');
    });

    it('notes a public holiday inside an absence', () => {
        const a = clipAbsence(leave({ starts_on: '2026-11-16', ends_on: '2026-11-18', hours: 16 }), '2026-11', HOLIDAYS)!;
        expect(a).toMatchObject({ workDays: 2, holidayWorkDays: 1, hours: 16 });
    });

    it('falls back to calendar days for a weekend-only absence', () => {
        const a = clipAbsence(leave({ kind: 'other', starts_on: '2026-10-31', ends_on: '2026-11-01', hours: 10 }), '2026-11', HOLIDAYS)!;
        expect(a.hours).toBe(5);
    });

    it('ignores pending and declined requests and other months', () => {
        const r = report([], [
            leave({ status: 'pending' }),
            leave({ status: 'declined' }),
            leave({ starts_on: '2026-12-01', ends_on: '2026-12-02' }),
        ]);
        expect(r.rows).toHaveLength(0);
    });

    it('sums by kind in picker order', () => {
        const r = report([], [
            leave({ kind: 'doctor', starts_on: '2026-11-10', ends_on: '2026-11-10', hours: 3 }),
            leave({ kind: 'vacation', starts_on: '2026-11-11', ends_on: '2026-11-11', hours: 8 }),
            leave({ kind: 'doctor', starts_on: '2026-11-12', ends_on: '2026-11-12', hours: 2 }),
        ]);
        expect(r.kinds).toEqual(['vacation', 'doctor']);
        expect(r.rows[0].absenceHours).toEqual({ vacation: 8, doctor: 5 });
        expect(r.rows[0].absenceTotalHours).toBe(13);
    });
});

describe('Money S3 XML', () => {
    const rep = buildPayrollReport({
        month: '2026-11',
        people: [...PEOPLE, { id: 'u2', name: 'Bob <&>', personalNumber: '' }],
        shifts: [
            shift(at(2026, 11, 4, 8), at(2026, 11, 4, 16)),
            shift(at(2026, 11, 17, 10), at(2026, 11, 17, 14)),
            shift(at(2026, 11, 5, 8), at(2026, 11, 5, 12), 'u2'),
        ],
        timeOff: [
            leave({ kind: 'sick', starts_on: '2026-10-29', ends_on: '2026-11-03', hours: 32 }),
            leave({ kind: 'doctor', starts_on: '2026-11-10', ends_on: '2026-11-10', hours: 3 }),
            leave({ kind: 'comp_time', starts_on: '2026-11-12', ends_on: '2026-11-12', hours: 8 }),
        ],
        holidays: HOLIDAYS,
    });
    const { xml, included, missing } = buildMoneyS3Xml(rep);

    it('has one period and pairs by osobní číslo; people without one are reported', () => {
        expect(xml).toContain('<Obdobi>\n    <Mesic>11</Mesic>\n    <Rok>2026</Rok>');
        expect(included).toBe(1);
        expect(missing.map((r) => r.personId)).toEqual(['u2']);
        expect(xml).toContain('<OsobniCislo>0001</OsobniCislo>');
        expect(xml).not.toContain('Bob');
    });

    it('maps absences to Dochazka.xsd codes with real start/end dates', () => {
        expect(xml).toMatch(/<Typ>4<\/Typ>\s*<Zacatek><Datum>2026-10-29<\/Datum><\/Zacatek>\s*<Konec><Datum>2026-11-03<\/Datum><\/Konec>\s*<KalDnu>3<\/KalDnu>\s*<PracDnu>2<\/PracDnu>\s*<PracHodin>16<\/PracHodin>/);
        expect(xml).toMatch(/<Typ>1<\/Typ>[\s\S]*?<Nazev>Lékař<\/Nazev>/);
        expect(xml).not.toContain('<Typ>99</Typ>');
        expect(xml).toContain('not imported, enter by hand: comp_time 2026-11-12..2026-11-12 8 h');
    });

    it('splits work into Odpracováno (without workday holidays) and Svátky', () => {
        expect(xml).toContain('<Odpracovano>\n        <OdpracDnu>1</OdpracDnu>\n        <OdpracHodin>7.5</OdpracHodin>');
        expect(xml).toContain('<Svatky>\n        <OdpracDnu>1</OdpracDnu>\n        <OdpracHodin>4</OdpracHodin>');
        expect(xml).toContain('<SvatkyHodin>4</SvatkyHodin>');
    });

    it('escapes names in the CSV and uses Czech separators', () => {
        const t = (k: string) => k;
        const csv = payrollCsv(rep, t as never, false, true);
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv).toContain('0001;Anna Nováková;2;11,5;4;0;0;0,5');
        expect(csv).toContain(';Bob <&>;');
    });
});
