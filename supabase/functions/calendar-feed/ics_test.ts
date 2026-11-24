// Deno tests for the pure ICS builder. Run from a copy outside the repo (the
// root package.json confuses Deno's npm resolution):
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test calendar-feed
import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import {
    addDays,
    allDayRange,
    buildCalendar,
    escapeText,
    feedWindow,
    foldLine,
    isValidToken,
    pragueDate,
    shiftSummary,
    utcStamp,
    type FeedShift,
} from './ics.ts';

const shift = (over: Partial<FeedShift> = {}): FeedShift => ({
    id: 's1',
    starts_at: '2026-12-01T07:00:00Z', // 08:00 in Prague (CET)
    ends_at: '2026-12-01T15:30:00Z',
    all_day: false,
    note: null,
    location_name: 'U Mostu',
    updated_at: '2026-11-20T10:00:00Z',
    created_at: '2026-11-19T10:00:00Z',
    ...over,
});

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

Deno.test('summary is localized and includes the location', () => {
    strictEqual(shiftSummary('cs', 'U Mostu'), 'Směna · U Mostu');
    strictEqual(shiftSummary('en', 'U Mostu'), 'Shift · U Mostu');
    strictEqual(shiftSummary('en', null), 'Shift');
    strictEqual(shiftSummary('cs', '  '), 'Směna');
});

Deno.test('escapeText escapes backslash, separators and newlines', () => {
    strictEqual(escapeText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne');
});

Deno.test('foldLine keeps every line within 75 octets and never splits a UTF-8 char', () => {
    const long = 'DESCRIPTION:' + 'Příliš žluťoučký kůň úpěl ďábelské ódy. '.repeat(6);
    const folded = foldLine(long);
    const enc = new TextEncoder();
    for (const line of folded.split('\r\n')) ok(enc.encode(line).length <= 75, line);
    strictEqual(folded.replace(/\r\n /g, ''), long);
    strictEqual(foldLine('SHORT:x'), 'SHORT:x');
});

Deno.test('dates: UTC stamps, Prague days across DST, day arithmetic', () => {
    strictEqual(utcStamp('2026-12-01T07:00:00Z'), '20261201T070000Z');
    // Prague midnight is the previous UTC day.
    strictEqual(pragueDate('2026-11-30T23:00:00Z'), '2026-12-01');
    strictEqual(pragueDate('2026-07-14T22:00:00Z'), '2026-07-15');
    strictEqual(addDays('2026-12-31', 1), '2027-01-01');
    strictEqual(addDays('2028-02-28', 1), '2028-02-29');
});

Deno.test('all-day range uses the Prague day, end exclusive', () => {
    // One day: 1 Dec local midnight → 2 Dec local midnight.
    deepStrictEqual(allDayRange('2026-11-30T23:00:00Z', '2026-12-01T23:00:00Z'), { start: '2026-12-01', end: '2026-12-02' });
    // Summer (CEST, UTC+2).
    deepStrictEqual(allDayRange('2026-07-14T22:00:00Z', '2026-07-15T22:00:00Z'), { start: '2026-07-15', end: '2026-07-16' });
    // Spanning the DST switch (29 Mar 2026): still one day.
    deepStrictEqual(allDayRange('2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'), { start: '2026-03-29', end: '2026-03-30' });
    // Degenerate end before start → at least one day.
    deepStrictEqual(allDayRange('2026-11-30T23:00:00Z', '2026-11-30T23:00:30Z'), { start: '2026-12-01', end: '2026-12-02' });
});

Deno.test('buildCalendar: valid envelope, CRLF, timed + all-day + time off', () => {
    const ics = buildCalendar({
        language: 'cs',
        shifts: [
            shift({ id: 'b', note: 'Klíče u baru, prosím; díky\nAnna' }),
            shift({ id: 'a', all_day: true, starts_at: '2026-11-30T23:00:00Z', ends_at: '2026-12-01T23:00:00Z', location_name: null, updated_at: null }),
        ],
        timeOff: [{ id: 't1', kind: 'vacation', starts_on: '2026-12-20', ends_on: '2026-12-24', created_at: '2026-11-01T08:00:00Z' }],
    });
    ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
    ok(ics.endsWith('END:VCALENDAR\r\n'));
    ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
    const text = unfold(ics);
    strictEqual(text.match(/BEGIN:VEVENT/g)?.length, 3);
    strictEqual(text.match(/END:VEVENT/g)?.length, 3);
    ok(text.includes('X-WR-CALNAME:Shiftella · Směny'));

    // Timed shift in UTC with location + escaped note.
    ok(text.includes('UID:shift-b@shiftella.app'));
    ok(text.includes('DTSTART:20261201T070000Z\r\nDTEND:20261201T153000Z'));
    ok(text.includes('SUMMARY:Směna · U Mostu\r\nLOCATION:U Mostu'));
    ok(text.includes('DESCRIPTION:Klíče u baru\\, prosím\\; díky\\nAnna'));
    ok(text.includes('DTSTAMP:20261120T100000Z'));

    // All-day shift: Prague date, exclusive end, created_at as stamp, no LOCATION.
    ok(text.includes('UID:shift-a@shiftella.app\r\nDTSTAMP:20261119T100000Z'));
    ok(text.includes('DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\nSUMMARY:Směna\r\nSTATUS'));

    // Time off: 20–24 Dec inclusive → DTEND 25 Dec.
    ok(text.includes('UID:timeoff-t1@shiftella.app'));
    ok(text.includes('DTSTART;VALUE=DATE:20261220\r\nDTEND;VALUE=DATE:20261225\r\nSUMMARY:Dovolená'));

    // All-day "a" sorts before timed "b" (earlier start).
    ok(text.indexOf('shift-a@') < text.indexOf('shift-b@'));
});

Deno.test('buildCalendar is deterministic and English by default', () => {
    const input = { language: 'en' as const, shifts: [shift()] };
    strictEqual(buildCalendar(input), buildCalendar(input));
    const text = unfold(buildCalendar(input));
    ok(text.includes('SUMMARY:Shift · U Mostu'));
    ok(text.includes('X-WR-CALNAME:Shiftella · Shifts'));
    // Unknown language falls back to English.
    ok(unfold(buildCalendar({ language: 'de' as unknown as 'en', shifts: [] })).includes('Shiftella · Shifts'));
});

Deno.test('tokens and the feed window', () => {
    ok(isValidToken('a'.repeat(64)));
    ok(!isValidToken('A'.repeat(64)));
    ok(!isValidToken('a'.repeat(63)));
    ok(!isValidToken("' or 1=1 --"));
    ok(!isValidToken(null));
    const w = feedWindow(Date.parse('2026-12-01T12:00:00Z'));
    strictEqual(w.fromISO, '2026-11-01T12:00:00.000Z');
    strictEqual(w.toISO, '2027-05-30T12:00:00.000Z');
    strictEqual(w.fromDate, '2026-11-01');
    strictEqual(w.toDate, '2027-05-30');
});
