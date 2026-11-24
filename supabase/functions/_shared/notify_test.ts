// Deno tests for the reminder + digest copy (send-push / Telegram).
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test _shared/notify_test.ts
import { deepStrictEqual, strictEqual } from 'node:assert';
import { digestBody, messagesFromWebhook, pragueClock, render } from './notify.ts';

Deno.test('pragueClock: Prague time, both languages (winter UTC+1)', () => {
    strictEqual(pragueClock('2026-11-25T07:00:00Z', 'cs'), '8:00');
    strictEqual(pragueClock('2026-11-25T07:00:00Z', 'en'), '08:00');
});

Deno.test('shift_reminder: time + location, localized', () => {
    const msg = { userId: 'u', key: 'shift_reminder', vars: { start: '2026-11-25T07:00:00Z', loc: 'U Mostu' } };
    deepStrictEqual(render(msg, 'cs'), { title: 'Směna za hodinu', body: 'Vaše směna začíná v 8:00 · U Mostu.' });
    deepStrictEqual(render(msg, 'en'), { title: 'Shift in an hour', body: 'Your shift starts at 08:00 · U Mostu.' });
    deepStrictEqual(render({ userId: 'u', key: 'shift_reminder', vars: {} }, 'en'), { title: 'Shift in an hour', body: 'Your shift starts soon.' });
});

Deno.test('digestBody: counts with Czech plurals; only what matters', () => {
    strictEqual(digestBody({ shifts: 5, people: 4, open: 1, requests: 2 }, 'cs'), '5 směn · 4 lidé · 1 volná směna · 2 žádosti čekají');
    strictEqual(digestBody({ shifts: 1, people: 1, open: 0, requests: 0 }, 'en'), '1 shift · 1 person');
    strictEqual(digestBody({ shifts: 0, people: 0, open: 3, requests: 5 }, 'cs'), 'dnes žádné směny · 3 volné směny · 5 žádostí čeká');
    strictEqual(digestBody({ shifts: 0, people: 0, open: 0, requests: 1 }, 'en'), 'no shifts today · 1 request waiting');
});

Deno.test('webhook rows → messages for the targeted person', async () => {
    const reminder = await messagesFromWebhook({} as never, 'shift_audit_log', {
        target_user_id: 'u1',
        action: 'shift_reminder',
        details: { scheduled_start: '2026-11-25T07:00:00Z', location_name: 'Bar' },
    });
    deepStrictEqual(reminder, [{ userId: 'u1', key: 'shift_reminder', vars: { start: '2026-11-25T07:00:00Z', loc: 'Bar' }, route: '/', category: 'shifts' }]);
    const digest = await messagesFromWebhook({} as never, 'shift_audit_log', {
        target_user_id: 'a1',
        action: 'daily_digest',
        details: { shifts: 3, people: 3, open: 0, requests: 1 },
    });
    deepStrictEqual(digest, [{ userId: 'a1', key: 'daily_digest', vars: { shifts: 3, people: 3, open: 0, requests: 1 }, route: '/', category: 'shifts' }]);
});

Deno.test('announcements: only the audience the database returns, never the author', async () => {
    const admin = {
        rpc: (fn: string, args: { p_id: string }) => {
            strictEqual(fn, 'announcement_audience_ids');
            strictEqual(args.p_id, 'a1');
            return Promise.resolve({ data: ['u1', 'author', 'u2'], error: null });
        },
    };
    const msgs = await messagesFromWebhook(admin as never, 'announcements', {
        id: 'a1', organization_id: 'o1', author_id: 'author', title: 'Inventura', body: 'Zítra v 8:00', location_id: 'loc1',
    });
    deepStrictEqual(msgs.map((m) => m.userId), ['u1', 'u2']);
    strictEqual(msgs[0].title, '📣 Inventura');
});

Deno.test('announcements: audience lookup failed → a targeted notice goes to nobody (never too wide)', async () => {
    const admin = { rpc: () => Promise.resolve({ data: null, error: { message: 'x' } }), from: () => { throw new Error('must not widen'); } };
    const msgs = await messagesFromWebhook(admin as never, 'announcements', {
        id: 'a2', organization_id: 'o1', author_id: null, title: 'T', body: 'B', org_role_id: 'r1',
    });
    deepStrictEqual(msgs, []);
});
