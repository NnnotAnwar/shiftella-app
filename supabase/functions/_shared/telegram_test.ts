// Deno tests for the Telegram helpers. Run from a copy outside the repo:
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test
import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert';
import {
    appUrl,
    decodeCallback,
    encodeCallback,
    escapeHtml,
    normalizeLang,
    notificationKeyboard,
    notificationText,
    signCallback,
    tgCall,
    timingSafeEqual,
    truncate,
    verifyCallback,
} from './telegram.ts';
import { confirmWindow } from './notify.ts';

const ID = '0f8e6a2c-1b3d-4e5f-8a9b-0c1d2e3f4a5b';

Deno.test('escapeHtml: the HTML parse-mode specials and quotes', () => {
    strictEqual(escapeHtml('<b>Tom & "Jerry"</b>'), '&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
    strictEqual(escapeHtml(null), '');
    strictEqual(escapeHtml(42), '42');
    // Already-escaped input is escaped again (we never trust it as markup).
    strictEqual(escapeHtml('&amp;'), '&amp;amp;');
});

Deno.test('normalizeLang: cs/sk → cs, everything else en', () => {
    strictEqual(normalizeLang('cs'), 'cs');
    strictEqual(normalizeLang('sk'), 'cs');
    strictEqual(normalizeLang('CS-cz'), 'cs');
    strictEqual(normalizeLang('en'), 'en');
    strictEqual(normalizeLang('de'), 'en');
    strictEqual(normalizeLang(undefined), 'en');
    strictEqual(normalizeLang('csb'), 'en'); // Kashubian is not Czech
});

Deno.test('truncate: keeps short strings, cuts long ones by code point', () => {
    strictEqual(truncate('abc', 5), 'abc');
    strictEqual(truncate('abcdef', 4), 'abc…');
    strictEqual(truncate('👍👍👍👍', 3), '👍👍…');
});

Deno.test('timingSafeEqual', () => {
    ok(timingSafeEqual('secret', 'secret'));
    ok(!timingSafeEqual('secret', 'secreT'));
    ok(!timingSafeEqual('secret', 'secret2'));
    ok(!timingSafeEqual('', 'x'));
});

Deno.test('appUrl: https only, no localhost, no trailing slash', () => {
    strictEqual(appUrl('https://shiftella.app/'), 'https://shiftella.app');
    strictEqual(appUrl('https://preprod.shiftella.app'), 'https://preprod.shiftella.app');
    strictEqual(appUrl('http://localhost:5173'), 'https://shiftella.app');
    strictEqual(appUrl('https://localhost:5173'), 'https://shiftella.app');
    strictEqual(appUrl(''), 'https://shiftella.app');
});

Deno.test('callback encode/decode round-trips and rejects junk', () => {
    const d = { type: 'decide', kind: 'swap', id: ID, approve: false } as const;
    const enc = encodeCallback(d);
    strictEqual(enc, `d:s:${ID.replace(/-/g, '')}:r`);
    deepStrictEqual(decodeCallback(enc), d);

    const c = { type: 'confirm', from: new Date('2026-12-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') } as const;
    deepStrictEqual(decodeCallback(encodeCallback(c)), c);

    strictEqual(decodeCallback('d:x:00:a'), null);
    strictEqual(decodeCallback(`d:t:${'g'.repeat(32)}:a`), null);
    strictEqual(decodeCallback('c:zz:aa'), null); // to <= from
    strictEqual(decodeCallback(''), null);
});

Deno.test('signCallback / verifyCallback: ≤ 64 bytes, bound to secret + chat', async () => {
    const action = { type: 'decide', kind: 'timeoff', id: ID, approve: true } as const;
    const data = await signCallback('s3cret', 12345, action);
    ok(new TextEncoder().encode(data).length <= 64, `too long: ${data.length}`);
    deepStrictEqual(await verifyCallback('s3cret', 12345, data), action);

    strictEqual(await verifyCallback('s3cret', 99999, data), null); // another chat
    strictEqual(await verifyCallback('other', 12345, data), null); // another secret
    strictEqual(await verifyCallback('', 12345, data), null);
    strictEqual(await verifyCallback('s3cret', 12345, data.replace(':a:', ':r:')), null); // tampered
    strictEqual(await verifyCallback('s3cret', 12345, `${data}x`), null);
    strictEqual(await verifyCallback('s3cret', 12345, undefined), null);

    const confirm = await signCallback('s3cret', -100123, { type: 'confirm', from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') });
    ok(confirm.length <= 64);
    strictEqual((await verifyCallback('s3cret', -100123, confirm))?.type, 'confirm');
});

Deno.test('notificationText: localized, escaped; announcements carry the full body', () => {
    const shift = notificationText({ userId: 'u', key: 'schedule_published', vars: { actor: 'Ana <3', count: 3 } }, 'cs');
    strictEqual(shift, '<b>Rozpis zveřejněn</b>\nAna &lt;3 zveřejnil(a) váš rozpis — 3 směny.');
    strictEqual(
        notificationText({ userId: 'u', key: 'schedule_published', vars: { actor: 'Ana', count: 1 } }, 'en'),
        '<b>Schedule published</b>\nAna published your schedule — 1 shift.',
    );
    const long = 'x'.repeat(500);
    const ann = notificationText({ userId: 'u', title: '📣 T', body: 'short', announcement: { title: 'Party & <fun>', body: long } }, 'en');
    strictEqual(ann, `📣 <b>Party &amp; &lt;fun&gt;</b>\n\n${long}`);
});

Deno.test('notificationKeyboard: Confirm (when signed) + Open app on the route', () => {
    deepStrictEqual(notificationKeyboard({ userId: 'u', route: '/schedule' }, 'cs', 'c:1:2:sig', 'https://shiftella.app'), {
        inline_keyboard: [[{ text: '✓ Potvrdit', callback_data: 'c:1:2:sig' }, { text: 'Otevřít aplikaci', url: 'https://shiftella.app/schedule' }]],
    });
    deepStrictEqual(notificationKeyboard({ userId: 'u', route: 'javascript:x' }, 'en', null, 'https://a.b'), {
        inline_keyboard: [[{ text: 'Open app', url: 'https://a.b/' }]],
    });
});

Deno.test('confirmWindow: published month / updated +31 days / others none', () => {
    // December in Prague: Dec 1 00:00 CET … Jan 1 00:00 CET (not a UTC month).
    deepStrictEqual(confirmWindow('schedule_published', { month_start: '2026-11-30T23:00:00+00:00' }), {
        from: '2026-11-30T23:00:00.000Z',
        to: '2026-12-31T23:00:00.000Z',
    });
    // March → April crosses the DST switch (CET → CEST).
    deepStrictEqual(confirmWindow('schedule_published', { month_start: '2026-02-28T23:00:00Z' }), {
        from: '2026-02-28T23:00:00.000Z',
        to: '2026-03-31T22:00:00.000Z',
    });
    deepStrictEqual(confirmWindow('schedule_updated', { scheduled_start: '2026-12-05T07:00:00Z' }), {
        from: '2026-12-05T07:00:00.000Z',
        to: '2027-01-05T07:00:00.000Z',
    });
    strictEqual(confirmWindow('schedule_removed', { scheduled_start: '2026-12-05T07:00:00Z' }), null);
    strictEqual(confirmWindow('schedule_published', {}), null);
    strictEqual(confirmWindow('schedule_updated', { scheduled_start: 'nope' }), null);
});

// --- tgCall with a fake fetch ---------------------------------------------------

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

Deno.test('tgCall: ok, 403 → blocked, 429 → one short retry then retry_after, network error', async () => {
    let calls = 0;
    const okRes = await tgCall('sendMessage', { chat_id: 1 }, { token: 't', fetchImpl: () => Promise.resolve(jsonRes(200, { ok: true, result: { message_id: 7 } })) });
    deepStrictEqual(okRes, { ok: true, status: 200, result: { message_id: 7 } });

    const blocked = await tgCall('sendMessage', {}, { token: 't', fetchImpl: () => Promise.resolve(jsonRes(403, { ok: false, description: 'Forbidden: bot was blocked by the user' })) });
    strictEqual(blocked.blocked, true);
    strictEqual(blocked.ok, false);

    // retry_after above the inline budget → reported, not waited for.
    const limited = await tgCall('sendMessage', {}, {
        token: 't',
        fetchImpl: () => {
            calls++;
            return Promise.resolve(jsonRes(429, { ok: false, parameters: { retry_after: 30 } }));
        },
    });
    strictEqual(calls, 1);
    deepStrictEqual({ ok: limited.ok, status: limited.status, retryAfter: limited.retryAfter }, { ok: false, status: 429, retryAfter: 30 });

    // Short retry_after → waits once and retries.
    calls = 0;
    const retried = await tgCall('sendMessage', {}, {
        token: 't',
        maxInlineWaitS: 1,
        fetchImpl: () => Promise.resolve(++calls === 1 ? jsonRes(429, { ok: false, parameters: { retry_after: 1 } }) : jsonRes(200, { ok: true, result: true })),
    });
    strictEqual(calls, 2);
    strictEqual(retried.ok, true);

    const down = await tgCall('sendMessage', {}, { token: 't', fetchImpl: () => Promise.reject(new Error('dns')) });
    deepStrictEqual(down, { ok: false, status: 0, description: 'network error' });
});

Deno.test('nav + view-confirm callbacks: round-trip, ranges enforced, ≤ 64 bytes signed', async () => {
    const secret = 's3cret';
    for (const a of [
        { type: 'nav', view: 'shifts', offset: 0 },
        { type: 'nav', view: 'shifts', offset: 8 },
        { type: 'nav', view: 'hours', offset: -12 },
        { type: 'nav', view: 'today', offset: 0 },
    ] as const) {
        const data = await signCallback(secret, 123456789012, a);
        ok(data.length <= 64, data);
        deepStrictEqual(await verifyCallback(secret, 123456789012, data), a);
        strictEqual(await verifyCallback(secret, 999, data), null); // another chat
    }
    const confirm = { type: 'confirm' as const, from: new Date('2026-12-01T00:00:00Z'), to: new Date('2026-12-08T00:00:00Z'), week: 3 };
    const data = await signCallback(secret, -1001234567890, confirm);
    ok(data.length <= 64, data);
    deepStrictEqual(await verifyCallback(secret, -1001234567890, data), confirm);
    // Out of range / malformed payloads are rejected even with a valid signature shape.
    strictEqual(decodeCallback('v:s:9'), null);
    strictEqual(decodeCallback('v:h:1'), null);
    strictEqual(decodeCallback('v:t:1'), null);
    strictEqual(decodeCallback('v:x:0'), null);
    deepStrictEqual(decodeCallback('v:h:-0'), { type: 'nav', view: 'hours', offset: 0 });
    throws(() => encodeCallback({ type: 'nav', view: 'shifts', offset: 9 }));
});

Deno.test('lang callback: round-trip, only cs / en', async () => {
    for (const lang of ['cs', 'en'] as const) {
        const data = await signCallback('k', 42, { type: 'lang', lang });
        deepStrictEqual(await verifyCallback('k', 42, data), { type: 'lang', lang });
    }
    strictEqual(decodeCallback('l:de'), null);
    throws(() => encodeCallback({ type: 'lang', lang: 'de' as 'cs' }));
});
