import { assertEquals } from 'jsr:@std/assert';
import { isTrustedCaller, sameSecret } from './callerAuth.ts';

const req = (auth?: string) => new Request('https://x/functions/v1/send-push', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
// A fake Auth admin API: only "legacy-service" may list users.
let calls = 0;
const fetcher = ((url: string, init?: RequestInit) => {
    calls++;
    const key = new Headers(init?.headers).get('apikey');
    return Promise.resolve(new Response('{}', { status: String(url).includes('/auth/v1/admin/users') && key === 'legacy-service' ? 200 : 401 }));
}) as typeof fetch;
const opts = { serviceKey: 'sb_secret_runtime', supabaseUrl: 'https://p.supabase.co', fetcher };

Deno.test('sameSecret: equal, different, different length', () => {
    assertEquals(sameSecret('abc', 'abc'), true);
    assertEquals(sameSecret('abc', 'abd'), false);
    assertEquals(sameSecret('abc', 'abcd'), false);
});

Deno.test('the runtime service key passes without a network call', async () => {
    calls = 0;
    assertEquals(await isTrustedCaller(req('Bearer sb_secret_runtime'), opts), true);
    assertEquals(calls, 0);
});

Deno.test('a legacy service-role key is verified once, then remembered', async () => {
    calls = 0;
    assertEquals(await isTrustedCaller(req('Bearer legacy-service'), opts), true);
    assertEquals(await isTrustedCaller(req('bearer legacy-service'), opts), true);
    assertEquals(calls, 1);
});

Deno.test('anon key, garbage and no header are refused', async () => {
    assertEquals(await isTrustedCaller(req('Bearer anon-jwt'), opts), false);
    assertEquals(await isTrustedCaller(req('Bearer '), opts), false);
    assertEquals(await isTrustedCaller(req(), opts), false);
});
