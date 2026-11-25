// =============================================================================
// EDGE FUNCTION: username-login   (verify_jwt = false — this IS the login)
// -----------------------------------------------------------------------------
// Lets users sign in with a username instead of an email WITHOUT exposing the
// username -> email mapping to the public.
//
// Previously the client called the `get_email_by_username` RPC (granted to
// `anon`) to turn a username into an email, then signed in. That let anyone
// enumerate usernames and harvest email addresses (PII).
//
// Here the lookup AND the sign-in happen server-side; the response only ever
// contains session tokens or a single generic error, so it leaks neither which
// usernames exist nor any email address.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

const GENERIC = 'Invalid username or password.';
const TOO_MANY = 'Too many sign-in attempts. Try again in 15 minutes.';

// Attempt limit (migration 20261125220000_login_rate_limit): failures counted per
// IP and per username in a 15-minute window, stored only as SHA-256 hashes.
const IP_LIMIT = 30;
const USER_LIMIT = 8;

async function sha256(s: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The caller's IP as the edge sees it (first hop of x-forwarded-for). */
function clientIp(req: Request): string {
    const fwd = req.headers.get('x-forwarded-for') ?? '';
    return (fwd.split(',')[0] || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown').trim();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const body = await req.json().catch(() => ({}));
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');
        if (!username || !password) return json({ error: GENERIC }, 400);

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // 0. Attempt limit: refuse early while this IP or username is locked.
        const ipKey = 'ip:' + (await sha256(clientIp(req)));
        const userKey = 'u:' + (await sha256(username.toLowerCase()));
        const { data: locked } = await admin.rpc('login_locked', { p_keys: [ipKey, userKey] });
        if (locked) return json({ error: TOO_MANY, code: 'too_many_attempts' }, 429);
        const failed = async () => {
            await admin.rpc('login_failed', { p_keys: [ipKey, userKey], p_limits: [IP_LIMIT, USER_LIMIT] });
            return json({ error: GENERIC }, 400);
        };

        // 1. Resolve username -> email with the service role (never returned).
        const { data: profile } = await admin
            .from('profiles')
            .select('email')
            .eq('username', username)
            .maybeSingle();

        // Same generic error whether the username exists or not (no oracle).
        if (!profile?.email) return await failed();

        // 2. Verify the password by actually signing in (anon client).
        const authClient = createClient(SUPABASE_URL, ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data, error } = await authClient.auth.signInWithPassword({
            email: profile.email,
            password,
        });
        // Unconfirmed email: GoTrue only reports this AFTER the password matched,
        // so passing the code on is no oracle — it lets the app say "confirm
        // your email" instead of the misleading "wrong password".
        if (error?.code === 'email_not_confirmed') {
            return json({ error: GENERIC, code: 'email_not_confirmed' }, 400);
        }
        if (error || !data.session) return await failed();
        await admin.rpc('login_succeeded', { p_key: userKey });

        // 3. Return only the tokens; the client adopts them via setSession().
        return json(
            {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            },
            200,
        );
    } catch {
        // Never leak internals on the login path.
        return json({ error: GENERIC }, 400);
    }
});
