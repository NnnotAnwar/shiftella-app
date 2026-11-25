// Supabase Edge Function: send-push
//
// Sends Firebase Cloud Messaging (HTTP v1) push notifications. Invoked either by
// a Database Webhook (on INSERT into `shift_audit_log` / `name_change_requests`)
// or directly with `{ userId, title, body, route }`.
//
// Required secrets (set with `supabase secrets set ...`):
//   SUPABASE_URL                — project URL
//   SUPABASE_SERVICE_ROLE_KEY   — service-role key (read device_tokens / profiles)
//   FCM_SERVICE_ACCOUNT         — Firebase service-account JSON (single line)
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// (Database Webhooks call it server-to-server; recipients are derived here.)
//
// Telegram: every message is also sent to the recipient's linked Telegram chat
// (their Telegram switches + the same Team+ gate) when TELEGRAM_BOT_TOKEN is
// set — see _shared/telegram.ts and docs/telegram.md. FCM delivery is unchanged.
// Event → message mapping and the localized copy live in _shared/notify.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTrustedCaller } from '../_shared/callerAuth.ts';
import { messagesFromWebhook, normalizeLang, render, type Lang, type PrefCategory, type PushMessage } from '../_shared/notify.ts';
import { sendTelegramNotification } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// --- FCM HTTP v1 auth (service-account JWT -> OAuth access token) -------------

let cachedToken: { token: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
}

function b64url(data: string | Uint8Array): string {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const s = btoa(String.fromCharCode(...bytes));
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

    const sa = JSON.parse(FCM_SERVICE_ACCOUNT);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(
        JSON.stringify({
            iss: sa.client_email,
            scope: 'https://www.googleapis.com/auth/firebase.messaging',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
        }),
    );
    const signingInput = `${header}.${claim}`;

    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(sa.private_key),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
    const jwt = `${signingInput}.${b64url(sig)}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const json = await res.json();
    if (!json.access_token) throw new Error(`OAuth failed: ${JSON.stringify(json)}`);
    cachedToken = { token: json.access_token, exp: now + 3600 };
    return json.access_token;
}

async function projectId(): Promise<string> {
    return JSON.parse(FCM_SERVICE_ACCOUNT).project_id;
}

// --- Send to all of a user's devices ------------------------------------------

/**
 * The recipient's push preferences + language in one read (missing row = all on,
 * English). Category gating and localization both use this.
 */
async function fetchPrefs(userId: string, category?: PrefCategory): Promise<{ allow: boolean; lang: Lang }> {
    const { data } = await admin
        .from('notification_preferences')
        .select('push_enabled, shifts, account, requests, language')
        .eq('user_id', userId)
        .maybeSingle();
    const lang: Lang = normalizeLang(data?.language);
    if (!data) return { allow: true, lang };
    if (!data.push_enabled) return { allow: false, lang };
    const allow = category ? data[category] !== false : true;
    return { allow, lang };
}

async function sendToUser(msg: PushMessage): Promise<number> {
    const { userId, route, category } = msg;
    const { allow, lang } = await fetchPrefs(userId, category);
    if (!allow) return 0;
    const { title, body } = render(msg, lang);

    const { data: tokens } = await admin.from('device_tokens').select('token').eq('user_id', userId);
    if (!tokens || tokens.length === 0) return 0;

    const accessToken = await getAccessToken();
    const pid = await projectId();
    const url = `https://fcm.googleapis.com/v1/projects/${pid}/messages:send`;

    let sent = 0;
    await Promise.all(
        tokens.map(async ({ token }) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: {
                        token,
                        notification: { title, body },
                        data: route ? { route } : {},
                        android: { priority: 'HIGH' },
                    },
                }),
            });
            if (res.ok) {
                sent++;
            } else {
                const txt = await res.text();
                // Drop tokens FCM reports as unregistered/invalid.
                if (res.status === 404 || res.status === 400) {
                    await admin.from('device_tokens').delete().eq('token', token);
                }
                console.warn('[send-push] FCM error', res.status, txt);
            }
        }),
    );
    return sent;
}

// --- Caller check ---------------------------------------------------------------
// The function runs with verify_jwt = false (Database Webhooks call it), and the
// public anon key is a valid JWT too, so the gateway can't tell callers apart.
// Only our own Database Webhooks may call it: they send the project's
// service-role key as the bearer token. Anyone else gets 401.

// --- HTTP entry ---------------------------------------------------------------

Deno.serve(async (req) => {
    if (!(await isTrustedCaller(req, { serviceKey: SERVICE_ROLE ?? '', supabaseUrl: SUPABASE_URL }))) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    try {
        const payload = await req.json();

        // Demo data (seed_demo_data) never notifies anyone. The webhook triggers
        // already skip demo rows (WHEN demo_batch IS NULL); this is the backstop.
        if (payload?.record?.demo_batch) {
            return new Response(JSON.stringify({ ok: true, skipped: 'demo' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Push notifications are a Team+ feature: Free organizations (incl. an
        // expired trial) keep the in-app bell but get no device pushes.
        const orgId = payload?.record?.organization_id as string | undefined;
        if (orgId) {
            const { data: plan } = await admin.rpc('org_plan', { p_org: orgId });
            if (plan === 'free') {
                return new Response(JSON.stringify({ ok: true, skipped: 'plan' }), { headers: { 'Content-Type': 'application/json' } });
            }
        }

        let messages: PushMessage[];
        if (payload?.type === 'INSERT' && payload?.table && payload?.record) {
            messages = await messagesFromWebhook(admin, payload.table, payload.record);
        } else if (payload?.userId && payload?.title) {
            // Telegram-only fields (buttons, full announcement) come from webhook rows only.
            messages = [{ ...(payload as PushMessage), announcement: undefined, confirm: undefined }];
        } else {
            return new Response(JSON.stringify({ error: 'unrecognized payload' }), { status: 400 });
        }

        // Webhook rows passed the org plan gate above; direct calls get checked per recipient.
        const planChecked = !!orgId;
        let sent = 0;
        let telegram = 0;
        let retryAfter: number | undefined;
        let fcmError: unknown = null;
        for (const m of messages) {
            // A failing FCM send must not stop the Telegram copy (and vice versa).
            try {
                sent += await sendToUser(m);
            } catch (err) {
                fcmError ??= err;
            }
            const tg = await sendTelegramNotification(admin, m, { planChecked });
            telegram += tg.sent;
            if (tg.retryAfter) retryAfter = Math.max(retryAfter ?? 0, tg.retryAfter);
        }
        if (fcmError) throw fcmError;
        return new Response(JSON.stringify({ ok: true, recipients: messages.length, sent, telegram, ...(retryAfter ? { telegram_retry_after: retryAfter } : {}) }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('[send-push]', err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
});
