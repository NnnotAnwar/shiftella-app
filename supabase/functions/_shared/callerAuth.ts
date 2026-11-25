// SHARED: who may call a server-to-server function (send-push).
// The function runs with verify_jwt = false (Database Webhooks call it), and the
// public anon key is a valid JWT too, so the gateway can't tell callers apart.
// Only our own Database Webhooks may call it: they send a service-role key as
// the bearer token. That key may be in the legacy JWT format while the runtime's
// SUPABASE_SERVICE_ROLE_KEY is the new secret key, so a token that isn't the
// runtime key is checked with Supabase itself: only a service-role key may list
// auth users. Verified tokens are remembered (as a hash) for the instance's life.

/** Constant-time string comparison (no early exit on the first differing byte). */
export function sameSecret(a: string, b: string): boolean {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    let diff = x.length ^ y.length;
    for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
    return diff === 0;
}

export function bearer(req: Request): string {
    return (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

async function sha256(s: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const verified = new Set<string>();

/** Asks the project's Auth admin API whether `token` is a service-role key. */
export async function isServiceRoleToken(token: string, supabaseUrl: string, fetcher: typeof fetch = fetch): Promise<boolean> {
    const res = await fetcher(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
        headers: { apikey: token, Authorization: `Bearer ${token}` },
    });
    await res.body?.cancel();
    return res.status === 200;
}

export async function isTrustedCaller(
    req: Request,
    opts: { serviceKey: string; supabaseUrl: string; fetcher?: typeof fetch },
): Promise<boolean> {
    const token = bearer(req);
    if (!token) return false;
    if (opts.serviceKey && sameSecret(token, opts.serviceKey)) return true;
    const h = await sha256(token);
    if (verified.has(h)) return true;
    const ok = await isServiceRoleToken(token, opts.supabaseUrl, opts.fetcher);
    if (ok) verified.add(h);
    return ok;
}
