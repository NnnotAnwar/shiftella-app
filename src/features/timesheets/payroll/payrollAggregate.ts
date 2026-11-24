import type { Shift, TimeOff } from '@shared/types';
import { calculateNetHours, shiftGrossHours } from '@features/shifts/shiftStats';
import { LEAVE_KINDS, type LeaveKind } from '@features/schedule/timeOffShared';

/**
 * --- PAYROLL AGGREGATION ("Podklady pro mzdy") ---
 * Turns a month of clocked shifts + approved absences into one row per person
 * for the accountant: worked hours net of breaks, of which hours on public
 * holidays, on Saturday/Sunday and at night (22:00–06:00, §2 zákoník práce),
 * and absences by type with hours. Pure — the exporters and the tests share it.
 *
 * Rules (documented in docs/payroll-export.md):
 *  • A shift belongs to the month it STARTED in — the same rule the timesheet
 *    the employee signs uses. Open (still running) shifts are left out and
 *    counted in `openShifts` so the accountant can ask about them.
 *  • Breaks: the app's rule, 30 min per started 6 h (calculateNetHours). The
 *    holiday / weekend / night parts are the clocked overlap scaled by the
 *    shift's net/gross ratio — the same way the DB counts holiday hours for
 *    the náhradní volno bank (_holiday_hours_worked).
 *  • The splits are "of which" figures and may overlap: a Saturday night on a
 *    public holiday counts in all three, as each is its own surcharge.
 *  • Time is the device's local time (Czech teams: Europe/Prague).
 *  • Absences: approved only. An absence crossing the month edge is clipped to
 *    the month; its hours are split by the working days (Mon–Fri, not a public
 *    holiday) on each side, or by calendar days when it has none.
 */

export type PayrollShift = Pick<Shift, 'user_id' | 'started_at' | 'ended_at'>;
export type PayrollTimeOff = Pick<TimeOff, 'user_id' | 'kind' | 'starts_on' | 'ends_on' | 'hours' | 'status'>;

export interface PayrollPerson {
    id: string;
    name: string;
    /** Osobní číslo in the accountant's payroll software (pairs the XML import). */
    personalNumber?: string | null;
}

export interface PayrollWage {
    rate: number;
    currency: string;
}

export interface PayrollInput {
    /** `YYYY-MM`. */
    month: string;
    people: PayrollPerson[];
    shifts: PayrollShift[];
    timeOff: PayrollTimeOff[];
    /** Public-holiday dates (`YYYY-MM-DD`) — must cover every absence's full range. */
    holidays: ReadonlySet<string>;
    /** Hourly rates by person id — only when the viewer may see pay. */
    wages?: ReadonlyMap<string, PayrollWage> | null;
}

export interface PayrollAbsence {
    kind: LeaveKind;
    /** The whole absence as recorded (may start/end in another month). */
    startsOn: string;
    endsOn: string;
    /** The part inside the month. */
    from: string;
    to: string;
    calendarDays: number;
    /** Mon–Fri days that are not a public holiday. */
    workDays: number;
    /** Public holidays falling on Mon–Fri inside the absence. */
    holidayWorkDays: number;
    hours: number;
}

export interface PayrollRow {
    personId: string;
    name: string;
    personalNumber: string | null;
    shiftCount: number;
    /** Distinct days with a (finished) shift start. */
    daysWorked: number;
    grossHours: number;
    breakHours: number;
    /** Net of breaks — the "worked hours" figure. */
    workedHours: number;
    holidayHours: number;
    weekendHours: number;
    nightHours: number;
    /** Days worked that are not a public holiday on Mon–Fri (Money S3 "Odpracováno"). */
    regularDays: number;
    /** Public holidays on Mon–Fri the person worked (Money S3 "Svátky"). */
    holidayWorkdayDays: number;
    holidayWorkdayHours: number;
    openShifts: number;
    absences: PayrollAbsence[];
    absenceHours: Partial<Record<LeaveKind, number>>;
    absenceTotalHours: number;
    rate: number | null;
    currency: string | null;
}

export interface PayrollReport {
    month: string;
    rows: PayrollRow[];
    /** Absence kinds present this month, in picker order (drives the columns). */
    kinds: LeaveKind[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOUR_MS = 3_600_000;

/** Local `YYYY-MM-DD` of a Date. */
export function localDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Round to 2 decimals (Money S3 `cisloType`: fractionDigits 2), no float drift. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Parse `YYYY-MM-DD` as a local calendar day (no UTC shift). */
function parseDay(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function isWeekendDay(d: Date): boolean {
    const wd = d.getDay();
    return wd === 0 || wd === 6;
}

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: string): { first: string; last: string } {
    const [y, m] = month.split('-').map(Number);
    return { first: `${month}-01`, last: localDate(new Date(y, m, 0)) };
}

/**
 * Clocked hours of one shift split into holiday / weekend / night parts
 * (gross overlap — the caller scales them to net). Walks the shift in pieces cut
 * at each local midnight, 06:00 and 22:00, so DST days stay correct.
 */
export function splitShiftHours(
    startMs: number,
    endMs: number,
    holidays: ReadonlySet<string>,
): { holiday: number; weekend: number; night: number; holidayWorkday: Map<string, number> } {
    let holiday = 0;
    let weekend = 0;
    let night = 0;
    const holidayWorkday = new Map<string, number>();
    if (endMs <= startMs) return { holiday, weekend, night, holidayWorkday };

    const start = new Date(startMs);
    let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (day.getTime() < endMs) {
        const y = day.getFullYear();
        const mo = day.getMonth();
        const d = day.getDate();
        const nextDay = new Date(y, mo, d + 1);
        const cuts = [day, new Date(y, mo, d, 6), new Date(y, mo, d, 22), nextDay].map((x) => x.getTime());
        const dateStr = localDate(day);
        const isHoliday = holidays.has(dateStr);
        const isWeekend = isWeekendDay(day);
        for (let i = 0; i < 3; i++) {
            const a = Math.max(cuts[i], startMs);
            const b = Math.min(cuts[i + 1], endMs);
            if (b <= a) continue;
            const h = (b - a) / HOUR_MS;
            if (isHoliday) {
                holiday += h;
                if (!isWeekend) holidayWorkday.set(dateStr, (holidayWorkday.get(dateStr) ?? 0) + h);
            }
            if (isWeekend) weekend += h;
            if (i !== 1) night += h; // 00–06 and 22–24
        }
        day = nextDay;
    }
    return { holiday, weekend, night, holidayWorkday };
}

/** Days of [from, to] (inclusive, `YYYY-MM-DD`) by type. */
export function countDays(from: string, to: string, holidays: ReadonlySet<string>): { calendar: number; work: number; holidayWork: number } {
    let calendar = 0;
    let work = 0;
    let holidayWork = 0;
    const end = parseDay(to).getTime();
    for (let d = parseDay(from); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        calendar++;
        if (isWeekendDay(d)) continue;
        if (holidays.has(localDate(d))) holidayWork++;
        else work++;
    }
    return { calendar, work, holidayWork };
}

/** One approved absence's share of the month, or null when it doesn't touch it. */
export function clipAbsence(t: PayrollTimeOff, month: string, holidays: ReadonlySet<string>): PayrollAbsence | null {
    const { first, last } = monthRange(month);
    const from = t.starts_on > first ? t.starts_on : first;
    const to = t.ends_on < last ? t.ends_on : last;
    if (from > to) return null;
    const inMonth = countDays(from, to, holidays);
    const whole = countDays(t.starts_on, t.ends_on, holidays);
    const total = Number(t.hours ?? 0);
    const share =
        whole.work > 0 ? inMonth.work / whole.work : whole.calendar > 0 ? inMonth.calendar / whole.calendar : 0;
    return {
        kind: t.kind,
        startsOn: t.starts_on,
        endsOn: t.ends_on,
        from,
        to,
        calendarDays: inMonth.calendar,
        workDays: inMonth.work,
        holidayWorkDays: inMonth.holidayWork,
        hours: round2(total * share),
    };
}

/** Build the month's payroll rows: one per person with a finished shift or an approved absence. */
export function buildPayrollReport(input: PayrollInput): PayrollReport {
    const { month, holidays } = input;
    const kindsSeen = new Set<LeaveKind>();
    const rows: PayrollRow[] = [];

    for (const person of input.people) {
        const mine = input.shifts.filter((s) => s.user_id === person.id && localDate(new Date(s.started_at)).startsWith(month));
        const finished = mine.filter((s) => !!s.ended_at);

        let gross = 0;
        let net = 0;
        let holiday = 0;
        let weekend = 0;
        let night = 0;
        const days = new Set<string>();
        const holidayWorkday = new Map<string, number>();

        for (const s of finished) {
            const g = shiftGrossHours(s);
            if (g <= 0) continue;
            const n = calculateNetHours(g);
            const ratio = n / g;
            gross += g;
            net += n;
            days.add(localDate(new Date(s.started_at)));
            const split = splitShiftHours(new Date(s.started_at).getTime(), new Date(s.ended_at!).getTime(), holidays);
            holiday += split.holiday * ratio;
            weekend += split.weekend * ratio;
            night += split.night * ratio;
            for (const [d, h] of split.holidayWorkday) holidayWorkday.set(d, (holidayWorkday.get(d) ?? 0) + h * ratio);
        }

        const absences = input.timeOff
            .filter((t) => t.user_id === person.id && t.status === 'approved')
            .map((t) => clipAbsence(t, month, holidays))
            .filter((a): a is PayrollAbsence => a !== null)
            .sort((a, b) => a.from.localeCompare(b.from));

        if (finished.length === 0 && mine.length === 0 && absences.length === 0) continue;

        const absenceHours: Partial<Record<LeaveKind, number>> = {};
        for (const a of absences) {
            absenceHours[a.kind] = round2((absenceHours[a.kind] ?? 0) + a.hours);
            kindsSeen.add(a.kind);
        }
        const wage = input.wages?.get(person.id) ?? null;

        rows.push({
            personId: person.id,
            name: person.name,
            personalNumber: person.personalNumber?.trim() || null,
            shiftCount: finished.length,
            daysWorked: days.size,
            regularDays: [...days].filter((d) => !(holidays.has(d) && !isWeekendDay(parseDay(d)))).length,
            grossHours: round2(gross),
            breakHours: round2(gross - net),
            workedHours: round2(net),
            holidayHours: round2(holiday),
            weekendHours: round2(weekend),
            nightHours: round2(night),
            holidayWorkdayDays: holidayWorkday.size,
            holidayWorkdayHours: round2([...holidayWorkday.values()].reduce((a, b) => a + b, 0)),
            openShifts: mine.length - finished.length,
            absences,
            absenceHours,
            absenceTotalHours: round2(absences.reduce((a, b) => a + b.hours, 0)),
            rate: wage ? wage.rate : null,
            currency: wage ? wage.currency : null,
        });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    return { month, rows, kinds: LEAVE_KINDS.filter((k) => kindsSeen.has(k)) };
}
