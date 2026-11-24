// Deno tests for the bot's pure helpers. Run from a copy outside the repo:
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test
import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import {
    calculateNetHours,
    daysWindow,
    fmtDateRange,
    fmtHours,
    formatHours,
    formatNews,
    formatRequest,
    formatShifts,
    isLinkCode,
    monthWindow,
    parseCommand,
    pragueDate,
    pragueMidnight,
    workedNetHours,
} from './bot.ts';

Deno.test('parseCommand: aliases, @bot suffix, args, other bots, plain text', () => {
    deepStrictEqual(parseCommand('/smeny', 'ShiftellaBot'), { cmd: 'shifts', arg: '' });
    deepStrictEqual(parseCommand('/shifts', 'ShiftellaBot'), { cmd: 'shifts', arg: '' });
    deepStrictEqual(parseCommand('/DNES', 'ShiftellaBot'), { cmd: 'today', arg: '' });
    deepStrictEqual(parseCommand('/hodiny@shiftellabot', 'ShiftellaBot'), { cmd: 'hours', arg: '' });
    deepStrictEqual(parseCommand('/oznameni', 'x'), { cmd: 'news', arg: '' });
    deepStrictEqual(parseCommand('/zadosti', 'x'), { cmd: 'requests', arg: '' });
    deepStrictEqual(parseCommand('/requests', 'x'), { cmd: 'requests', arg: '' });
    deepStrictEqual(parseCommand('/start abc123', 'x'), { cmd: 'start', arg: 'abc123' });
    deepStrictEqual(parseCommand('  /help  ', 'x'), { cmd: 'help', arg: '' });
    deepStrictEqual(parseCommand('/stop', '@x'), { cmd: 'stop', arg: '' });
    deepStrictEqual(parseCommand('/whatever', 'x'), { cmd: 'unknown', arg: '' });
    strictEqual(parseCommand('/smeny@OtherBot', 'ShiftellaBot'), null);
    strictEqual(parseCommand('hello', 'x'), null);
    strictEqual(parseCommand('', 'x'), null);
    strictEqual(parseCommand(undefined, 'x'), null);
});

Deno.test('isLinkCode: exactly 40 lowercase hex', () => {
    ok(isLinkCode('a'.repeat(40)));
    ok(isLinkCode('0123456789abcdef0123456789abcdef01234567'));
    ok(!isLinkCode('A'.repeat(40)));
    ok(!isLinkCode('a'.repeat(39)));
    ok(!isLinkCode('a'.repeat(40) + ' x'));
});

Deno.test('Prague time: midnight across DST, day/month windows', () => {
    // CET (+1) in winter, CEST (+2) in summer.
    strictEqual(pragueMidnight(2026, 11, 24).toISOString(), '2026-11-23T23:00:00.000Z');
    strictEqual(pragueMidnight(2026, 7, 1).toISOString(), '2026-06-30T22:00:00.000Z');
    // The DST switch days themselves.
    strictEqual(pragueMidnight(2026, 3, 29).toISOString(), '2026-03-28T23:00:00.000Z');
    strictEqual(pragueMidnight(2026, 10, 25).toISOString(), '2026-10-24T22:00:00.000Z');
    // Month overflow → next year.
    strictEqual(pragueMidnight(2026, 13, 1).toISOString(), '2026-12-31T23:00:00.000Z');

    // 23:30 UTC on Nov 24 is already Nov 25 in Prague.
    deepStrictEqual(pragueDate(new Date('2026-11-24T23:30:00Z')), { y: 2026, m: 11, d: 25 });
    const w = daysWindow(new Date('2026-11-24T23:30:00Z'), 7);
    strictEqual(w.from.toISOString(), '2026-11-24T23:00:00.000Z');
    strictEqual(w.to.toISOString(), '2026-12-01T23:00:00.000Z');
    const m = monthWindow(new Date('2026-12-15T12:00:00Z'));
    strictEqual(m.from.toISOString(), '2026-11-30T23:00:00.000Z');
    strictEqual(m.to.toISOString(), '2026-12-31T23:00:00.000Z');
});

Deno.test('hours: the My hours break rule', () => {
    strictEqual(calculateNetHours(0), 0);
    strictEqual(calculateNetHours(6), 6); // exactly 6h — no break yet
    strictEqual(calculateNetHours(6.1), 5.6);
    strictEqual(calculateNetHours(8), 7.5);
    strictEqual(calculateNetHours(12.5), 11.5);
    const now = Date.parse('2026-11-24T12:00:00Z');
    const total = workedNetHours(
        [
            { started_at: '2026-11-02T06:00:00Z', ended_at: '2026-11-02T14:00:00Z' }, // 8h → 7.5
            { started_at: '2026-11-24T08:00:00Z', ended_at: null }, // open, 4h so far
        ],
        now,
    );
    strictEqual(total, 11.5);
    strictEqual(fmtHours(11.5, 'cs'), '11,5 h');
    strictEqual(fmtHours(11.54, 'en'), '11.5 h');
});

Deno.test('formatShifts: empty + lines with confirmation marks, escaped location', () => {
    strictEqual(formatShifts([], 'cs'), 'Na příštích 7 dní nemáte žádnou směnu.');
    const text = formatShifts(
        [
            { starts_at: '2026-11-25T07:00:00Z', ends_at: '2026-11-25T15:00:00Z', all_day: false, location: 'Café <Old Town>', confirmed: true },
            { starts_at: '2026-11-26T07:00:00Z', ends_at: '2026-11-26T15:00:00Z', all_day: true, location: null, confirmed: false },
        ],
        'cs',
    );
    const lines = text.split('\n');
    strictEqual(lines[0], '<b>Vaše směny · příštích 7 dní</b>');
    ok(lines[1].startsWith('✓ <b>'), lines[1]);
    ok(lines[1].includes('8:00–16:00'), lines[1]);
    ok(lines[1].endsWith('Café &lt;Old Town&gt;'), lines[1]);
    ok(lines[2].startsWith('○ '), lines[2]);
    ok(lines[2].includes('celý den'), lines[2]);
});

Deno.test('formatHours: both languages', () => {
    const at = new Date('2026-11-15T12:00:00Z');
    const cs = formatHours({ hours: 82.5, shifts: 11 }, { hours: 120, shifts: 15 }, at, 'cs');
    ok(cs.startsWith('<b>Hodiny · listopad 2026</b>'), cs);
    ok(cs.includes('Odpracováno: <b>82,5 h</b> · 11 směn'), cs);
    ok(cs.includes('Naplánováno: 120 h · 15 směn'), cs);
    const en = formatHours({ hours: 1, shifts: 1 }, { hours: 0, shifts: 0 }, at, 'en');
    ok(en.includes('Worked: <b>1 h</b> · 1 shift'), en);
    ok(en.includes('Planned: 0 h · 0 shifts'), en);
});

Deno.test('formatNews: empty, pinned, escaped + truncated body', () => {
    strictEqual(formatNews([], 'en'), 'No announcements yet.');
    const text = formatNews([{ title: 'A & B', body: '<script>'.repeat(200), pinned: true, created_at: '2026-11-20T10:00:00Z' }], 'cs');
    ok(text.includes('📌 <b>A &amp; B</b>'), text);
    ok(!text.includes('<script>'), 'body must be escaped');
    ok(text.endsWith('…'), 'long body is truncated');
});

Deno.test('formatRequest: kinds, anonymity, no complaint text', () => {
    strictEqual(
        formatRequest({ kind: 'timeoff', id: 'x', who: 'Jana', type: 'vacation', starts_on: '2026-12-22', ends_on: '2026-12-31' }, 'cs'),
        '<b>Dovolená</b> · Jana\n22. 12. – 31. 12.',
    );
    strictEqual(fmtDateRange('2026-12-22', '2026-12-22', 'en'), '22 Dec');
    strictEqual(
        formatRequest({ kind: 'name', id: 'x', who: 'Jana N', from: 'Jana Nová', to: 'Jana <Stará>' }, 'en'),
        '<b>Name change</b> · Jana N\nJana Nová → Jana &lt;Stará&gt;',
    );
    strictEqual(formatRequest({ kind: 'member', id: 'x', who: null, type: 'complaint', subject: null }, 'cs'), '<b>Stížnost</b> · Anonymně');
    strictEqual(formatRequest({ kind: 'member', id: 'x', who: 'Petr', type: 'role', role: 'Shift lead' }, 'en'), '<b>Role request</b> · Petr\nShift lead');
    strictEqual(formatRequest({ kind: 'member', id: 'x', who: 'Petr', type: 'other', subject: 'New apron' }, 'cs'), '<b>Žádost</b> · Petr\nNew apron');
    const swap = formatRequest(
        { kind: 'swap', id: 'x', who: 'Ana', taker: 'Bo', starts_at: '2026-12-01T07:00:00Z', ends_at: '2026-12-01T15:00:00Z', all_day: false, location: 'Bar' },
        'en',
    );
    ok(swap.startsWith('<b>Shift swap</b> · Ana → Bo\n'), swap);
    ok(swap.endsWith('08:00–16:00 · Bar'), swap);
});
