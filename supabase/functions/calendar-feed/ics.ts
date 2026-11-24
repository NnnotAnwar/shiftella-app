// =============================================================================
// ICS BUILDER (RFC 5545) — pure, no I/O, so it is unit-tested in ics_test.ts.
// -----------------------------------------------------------------------------
// • Timed shifts are written in UTC (…Z): every calendar app shows them in the
//   viewer's own zone, and no VTIMEZONE block is needed.
// • All-day rota entries store the LOCAL (Europe/Prague) day bounds in
//   starts_at / ends_at, so their DATE is taken in Prague, not UTC (midnight in
//   Prague is 22:00/23:00 UTC the day before).
// • Approved time off is a DATE range; DTEND is exclusive (the day after).
// • UID is stable per row, DTSTAMP is the row's last change, so the same data
//   always gives the same bytes (good for ETag / 304 responses).
// =============================================================================

export type FeedLanguage = 'en' | 'cs';

export interface FeedShift {
    id: string;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    note: string | null;
    location_name: string | null;
    updated_at: string | null;
    created_at: string | null;
}

export interface FeedTimeOff {
    id: string;
    kind: 'vacation' | 'sick' | 'other';
    starts_on: string; // YYYY-MM-DD
    ends_on: string; // YYYY-MM-DD, inclusive
    created_at: string | null;
}

export interface FeedInput {
    language: FeedLanguage;
    shifts: FeedShift[];
    timeOff?: FeedTimeOff[];
    /** Shown as the calendar's name, e.g. "Shiftella · Směny". */
    calendarName?: string;
    /** Fallback DTSTAMP for rows without a timestamp (defaults to the epoch, keeps output stable). */
    fallbackStamp?: string;
}

export const TIME_ZONE = 'Europe/Prague';
const UID_DOMAIN = 'shiftella.app';

const LABELS: Record<FeedLanguage, { shift: string; calendar: string; vacation: string; sick: string; other: string }> = {
    en: { shift: 'Shift', calendar: 'Shiftella · Shifts', vacation: 'Vacation', sick: 'Sick leave', other: 'Time off' },
    cs: { shift: 'Směna', calendar: 'Shiftella · Směny', vacation: 'Dovolená', sick: 'Nemoc', other: 'Volno' },
};

/** "Směna · U Mostu" / "Shift" (no location). */
export function shiftSummary(language: FeedLanguage, locationName: string | null): string {
    const base = LABELS[language].shift;
    const loc = locationName?.trim();
    return loc ? `${base} · ${loc}` : base;
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Fold a content line to ≤75 octets per line (§3.1), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
    if (encoder.encode(line).length <= 75) return line;
    const parts: string[] = [];
    let current = '';
    let bytes = 0;
    let limit = 75; // continuation lines start with a space, so they carry 74
    for (const ch of line) {
        const size = encoder.encode(ch).length;
        if (bytes + size > limit) {
            parts.push(current);
            current = '';
            bytes = 0;
            limit = 74;
        }
        current += ch;
        bytes += size;
    }
    parts.push(current);
    return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-12-01T07:00:00Z → 20261201T070000Z */
export function utcStamp(iso: string): string {
    const d = new Date(iso);
    return (
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    );
}

const pragueDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day (YYYY-MM-DD) an instant falls on in Prague. */
export function pragueDate(iso: string | number): string {
    return pragueDay.format(new Date(iso)); // en-CA formats as YYYY-MM-DD
}

/** YYYY-MM-DD + n days (pure calendar arithmetic). */
export function addDays(ymd: string, n: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const dateValue = (ymd: string) => ymd.replace(/-/g, '');

/** First Prague day of an all-day entry and the (exclusive) day after its last one. */
export function allDayRange(startsAt: string, endsAt: string): { start: string; end: string } {
    const start = pragueDate(startsAt);
    // ends_at is the next local midnight; step back a minute to land on the last day.
    const last = pragueDate(new Date(endsAt).getTime() - 60_000);
    const end = addDays(last < start ? start : last, 1);
    return { start, end };
}

function shiftEvent(s: FeedShift, language: FeedLanguage, fallbackStamp: string): string[] {
    const stamp = utcStamp(s.updated_at ?? s.created_at ?? fallbackStamp);
    const lines = ['BEGIN:VEVENT', `UID:shift-${s.id}@${UID_DOMAIN}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`];
    if (s.all_day) {
        const { start, end } = allDayRange(s.starts_at, s.ends_at);
        lines.push(`DTSTART;VALUE=DATE:${dateValue(start)}`, `DTEND;VALUE=DATE:${dateValue(end)}`);
    } else {
        lines.push(`DTSTART:${utcStamp(s.starts_at)}`, `DTEND:${utcStamp(s.ends_at)}`);
    }
    lines.push(`SUMMARY:${escapeText(shiftSummary(language, s.location_name))}`);
    if (s.location_name?.trim()) lines.push(`LOCATION:${escapeText(s.location_name.trim())}`);
    if (s.note?.trim()) lines.push(`DESCRIPTION:${escapeText(s.note.trim())}`);
    lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
    return lines;
}

function timeOffEvent(o: FeedTimeOff, language: FeedLanguage, fallbackStamp: string): string[] {
    const stamp = utcStamp(o.created_at ?? fallbackStamp);
    const end = addDays(o.ends_on < o.starts_on ? o.starts_on : o.ends_on, 1);
    return [
        'BEGIN:VEVENT',
        `UID:timeoff-${o.id}@${UID_DOMAIN}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateValue(o.starts_on)}`,
        `DTEND;VALUE=DATE:${dateValue(end)}`,
        `SUMMARY:${escapeText(LABELS[language][o.kind] ?? LABELS[language].other)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
    ];
}

/** The whole VCALENDAR as a CRLF-terminated string. */
export function buildCalendar(input: FeedInput): string {
    const language: FeedLanguage = input.language === 'cs' ? 'cs' : 'en';
    const fallback = input.fallbackStamp ?? '1970-01-01T00:00:00Z';
    const name = input.calendarName ?? LABELS[language].calendar;
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `PRODID:-//Shiftella//Calendar feed//${language.toUpperCase()}`,
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:${escapeText(name)}`,
        `X-WR-TIMEZONE:${TIME_ZONE}`,
        // Hints for how often to re-fetch (Apple / Outlook honour these; Google polls on its own).
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
    ];
    const shifts = [...input.shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
    for (const s of shifts) lines.push(...shiftEvent(s, language, fallback));
    const timeOff = [...(input.timeOff ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id));
    for (const o of timeOff) lines.push(...timeOffEvent(o, language, fallback));
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Tokens are 64 lowercase hex chars (see the calendar_feeds migration). */
export const isValidToken = (token: string | null | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token);

/** The feed window: from 30 days ago to 180 days ahead. */
export function feedWindow(now: number, pastDays = 30, futureDays = 180): { fromISO: string; toISO: string; fromDate: string; toDate: string } {
    const from = new Date(now - pastDays * 86_400_000);
    const to = new Date(now + futureDays * 86_400_000);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), fromDate: pragueDate(from.getTime()), toDate: pragueDate(to.getTime()) };
}
