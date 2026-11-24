// =============================================================================
// SHARED: Telegram Bot API client + helpers (telegram-webhook, send-push)
// -----------------------------------------------------------------------------
// Secrets:
//   TELEGRAM_BOT_TOKEN       — from @BotFather (never logged)
//   TELEGRAM_WEBHOOK_SECRET  — the setWebhook secret_token; also keys the HMAC
//                              that signs inline-button callback data
//   TELEGRAM_BOT_USERNAME    — the bot's @username (without @)
// Optional: APP_URL (already set for billing) — "Open app" buttons; default
// https://shiftella.app.
//
// Messages use parse_mode HTML; everything interpolated goes through escapeHtml.
// tgCall never throws: Telegram/network failures come back as a result, so a
// notification fan-out or a webhook reply can't crash the caller.
// =============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { render, type Lang, type PushMessage } from './notify.ts';

export type { Lang };

// --- Small pure helpers --------------------------------------------------------

/** Escape text for Telegram's HTML parse mode (the only three it requires, plus quotes for attributes). */
export function escapeHtml(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Czech (and Slovak) speakers get Czech; everyone else English. */
export function normalizeLang(code: string | null | undefined): Lang {
    return /^(cs|sk)\b/i.test(code ?? '') ? 'cs' : 'en';
}

/** Cut to `max` characters with an ellipsis (counts code points, never splits an emoji). */
export function truncate(s: string, max: number): string {
    const chars = Array.from(s);
    return chars.length <= max ? s : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/** Constant-time string comparison (secrets, signatures). */
export function timingSafeEqual(a: string, b: string): boolean {
    const ea = new TextEncoder().encode(a);
    const eb = new TextEncoder().encode(b);
    let diff = ea.length ^ eb.length;
    const n = Math.max(ea.length, eb.length);
    for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
    return diff === 0;
}

/** The app's public https URL for "Open app" buttons (Telegram refuses non-https / localhost buttons). */
export function appUrl(env: string | undefined = Deno.env.get('APP_URL')): string {
    const u = (env ?? '').trim().replace(/\/+$/, '');
    return /^https:\/\/(?!localhost|127\.)[^/\s]+/.test(u) ? u : 'https://shiftella.app';
}

// --- Inline-button callback data (≤ 64 bytes, HMAC-signed per chat) -----------
//
//   d:<t|n|s|m>:<uuid hex>:<a|r>   decide a request (time off / name / swap / member)
//   c:<from base36 s>:<to base36 s>[:<week>] confirm my published shifts in [from, to);
//                                   with <week> it came from the /shifts view, which
//                                   is then redrawn (✓ marks) instead of just losing the button
//   l:<cs|en>                       set the bot's language
//   v:<s|h|t>:<offset>              page a view: shifts week (0…8 ahead), hours month
//                                   (0…−12 back), today (0, refresh)
// Each is followed by ":<sig>", sig = first 12 bytes of HMAC-SHA256(key,
// "<chat_id>|<payload>") base64url. Signing binds a button to the chat it was
// sent to; the server re-checks every permission anyway.

export type RequestKind = 'timeoff' | 'name' | 'swap' | 'member';
const KIND_CODE: Record<RequestKind, string> = { timeoff: 't', name: 'n', swap: 's', member: 'm' };
const CODE_KIND: Record<string, RequestKind> = { t: 'timeoff', n: 'name', s: 'swap', m: 'member' };

export type NavView = 'shifts' | 'hours' | 'today';
const VIEW_CODE: Record<NavView, string> = { shifts: 's', hours: 'h', today: 't' };
const CODE_VIEW: Record<string, NavView> = { s: 'shifts', h: 'hours', t: 'today' };
/** Allowed offsets per view (anything else is rejected when decoding). */
const VIEW_RANGE: Record<NavView, [number, number]> = { shifts: [0, 8], hours: [-12, 0], today: [0, 0] };
const inRange = (view: NavView, n: number) => Number.isInteger(n) && n >= VIEW_RANGE[view][0] && n <= VIEW_RANGE[view][1];

export type CallbackAction =
    | { type: 'decide'; kind: RequestKind; id: string; approve: boolean }
    | { type: 'confirm'; from: Date; to: Date; week?: number }
    | { type: 'nav'; view: NavView; offset: number }
    | { type: 'lang'; lang: Lang };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCallback(a: CallbackAction): string {
    if (a.type === 'decide') {
        if (!UUID_RE.test(a.id)) throw new Error('bad id');
        return `d:${KIND_CODE[a.kind]}:${a.id.replace(/-/g, '').toLowerCase()}:${a.approve ? 'a' : 'r'}`;
    }
    if (a.type === 'lang') {
        if (a.lang !== 'cs' && a.lang !== 'en') throw new Error('bad lang');
        return `l:${a.lang}`;
    }
    if (a.type === 'nav') {
        if (!inRange(a.view, a.offset)) throw new Error('bad offset');
        return `v:${VIEW_CODE[a.view]}:${a.offset}`;
    }
    const s = (d: Date) => Math.floor(d.getTime() / 1000).toString(36);
    if (a.week !== undefined && !inRange('shifts', a.week)) throw new Error('bad week');
    return `c:${s(a.from)}:${s(a.to)}${a.week !== undefined ? `:${a.week}` : ''}`;
}

export function decodeCallback(payload: string): CallbackAction | null {
    let m = /^d:([tnsm]):([0-9a-f]{32}):([ar])$/.exec(payload);
    if (m) {
        const h = m[2];
        const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
        return { type: 'decide', kind: CODE_KIND[m[1]], id, approve: m[3] === 'a' };
    }
    m = /^c:([0-9a-z]{1,8}):([0-9a-z]{1,8})(?::(\d))?$/.exec(payload);
    if (m) {
        const from = new Date(parseInt(m[1], 36) * 1000);
        const to = new Date(parseInt(m[2], 36) * 1000);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
        if (m[3] === undefined) return { type: 'confirm', from, to };
        const week = Number(m[3]);
        return inRange('shifts', week) ? { type: 'confirm', from, to, week } : null;
    }
    m = /^l:(cs|en)$/.exec(payload);
    if (m) return { type: 'lang', lang: m[1] as Lang };
    m = /^v:([sht]):(-?\d{1,2})$/.exec(payload);
    if (m) {
        const view = CODE_VIEW[m[1]];
        const offset = Number(m[2]);
        return inRange(view, offset) ? { type: 'nav', view, offset: offset === 0 ? 0 : offset } : null;
    }
    return null;
}

function b64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(`shiftella-tg-callback:${secret}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
    return b64url(sig.slice(0, 12));
}

/** `<payload>:<sig>` — the whole thing stays ≤ 64 bytes for every action above. */
export async function signCallback(secret: string, chatId: number | string, action: CallbackAction): Promise<string> {
    const payload = encodeCallback(action);
    return `${payload}:${await hmac(secret, `${chatId}|${payload}`)}`;
}

/** The action, when the data was signed for THIS chat with our secret; otherwise null. */
export async function verifyCallback(secret: string, chatId: number | string, data: string | undefined | null): Promise<CallbackAction | null> {
    if (!secret || !data || data.length > 64) return null;
    const i = data.lastIndexOf(':');
    if (i <= 0) return null;
    const payload = data.slice(0, i);
    const sig = data.slice(i + 1);
    if (!timingSafeEqual(sig, await hmac(secret, `${chatId}|${payload}`))) return null;
    return decodeCallback(payload);
}

// --- Bot API client --------------------------------------------------------------

export interface TgResult<T = unknown> {
    ok: boolean;
    status: number;
    result?: T;
    description?: string;
    /** 429: seconds Telegram asked us to wait (after one short in-place retry). */
    retryAfter?: number;
    /** 403: the user blocked the bot / deleted their account — unlink them. */
    blocked?: boolean;
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the Bot API. Never throws; never logs the token (it is in the URL). */
export async function tgCall<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    opts: { token?: string; fetchImpl?: Fetch; maxInlineWaitS?: number } = {},
): Promise<TgResult<T>> {
    const token = opts.token ?? Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) return { ok: false, status: 0, description: 'TELEGRAM_BOT_TOKEN is not set' };
    const doFetch = opts.fetchImpl ?? fetch;
    const maxWait = opts.maxInlineWaitS ?? 3;
    for (let attempt = 0; attempt < 2; attempt++) {
        let res: Response;
        try {
            res = await doFetch(`https://api.telegram.org/bot${token}/${method}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });
        } catch {
            return { ok: false, status: 0, description: 'network error' };
        }
        let body: { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } } = {};
        try {
            body = await res.json();
        } catch { /* non-JSON error page */ }
        if (res.ok && body.ok) return { ok: true, status: res.status, result: body.result };
        if (res.status === 429) {
            const retryAfter = Math.max(1, Number(body.parameters?.retry_after ?? 1));
            if (attempt === 0 && retryAfter <= maxWait) {
                await sleep(retryAfter * 1000);
                continue;
            }
            return { ok: false, status: 429, description: body.description, retryAfter };
        }
        return { ok: false, status: res.status, description: body.description, blocked: res.status === 403 };
    }
    return { ok: false, status: 429, description: 'rate limited' };
}

export function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}, opts?: { fetchImpl?: Fetch }) {
    return tgCall<{ message_id: number }>(
        'sendMessage',
        { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra },
        opts,
    );
}

// --- Notifications → Telegram ------------------------------------------------------

const TG_TEXT: Record<Lang, { open: string; confirm: string }> = {
    en: { open: 'Open app', confirm: 'Confirm' },
    cs: { open: 'Otevřít aplikaci', confirm: 'Potvrdit' },
};

/** The message text for a notification (HTML). Announcements carry their full body. */
export function notificationText(msg: PushMessage, lang: Lang): string {
    if (msg.announcement) {
        const title = escapeHtml(truncate(msg.announcement.title || (lang === 'cs' ? 'Oznámení' : 'Announcement'), 200));
        const body = escapeHtml(truncate(msg.announcement.body, 3500));
        return `📣 <b>${title}</b>${body ? `\n\n${body}` : ''}`;
    }
    const { title, body } = render(msg, lang);
    return [title && `<b>${escapeHtml(title)}</b>`, body && escapeHtml(body)].filter(Boolean).join('\n');
}

/** Buttons under a notification: Confirm (signed, when offered) + Open app. */
export function notificationKeyboard(msg: PushMessage, lang: Lang, confirmData: string | null, baseUrl: string): InlineKeyboard {
    const row: InlineButton[] = [];
    if (confirmData) row.push({ text: `✓ ${TG_TEXT[lang].confirm}`, callback_data: confirmData });
    const route = msg.route && msg.route.startsWith('/') ? msg.route : '/';
    row.push({ text: TG_TEXT[lang].open, url: `${baseUrl}${route}` });
    return { inline_keyboard: [row] };
}

interface LinkRow {
    chat_id: number;
    muted: boolean;
    shifts: boolean;
    account: boolean;
    requests: boolean;
    announcements: boolean;
    language: string;
    /** Picked in the bot (🌐 / /language) — then it beats the app's language. */
    language_chosen?: boolean;
}

export interface TelegramSendResult {
    sent: number;
    skipped?: 'not_configured' | 'not_linked' | 'muted' | 'category' | 'plan';
    retryAfter?: number;
    unlinked?: boolean;
}

/**
 * Deliver one notification to the recipient's linked Telegram chat, honouring
 * their Telegram switches (mute + categories) and the push plan gate. Pass
 * `planChecked` when the caller already verified the org's plan (send-push does
 * for webhook rows). A 403 (bot blocked) unlinks the chat; a 429 reports
 * retry_after. Never throws.
 */
export async function sendTelegramNotification(
    admin: SupabaseClient,
    msg: PushMessage,
    opts: { planChecked?: boolean; fetchImpl?: Fetch } = {},
): Promise<TelegramSendResult> {
    if (!Deno.env.get('TELEGRAM_BOT_TOKEN')) return { sent: 0, skipped: 'not_configured' };
    try {
        const { data: link } = await admin
            .from('telegram_links')
            .select('chat_id, muted, shifts, account, requests, announcements, language, language_chosen')
            .eq('user_id', msg.userId)
            .maybeSingle<LinkRow>();
        if (!link) return { sent: 0, skipped: 'not_linked' };
        if (link.muted) return { sent: 0, skipped: 'muted' };
        if (msg.announcement ? link.announcements === false : msg.category ? link[msg.category] === false : false) {
            return { sent: 0, skipped: 'category' };
        }

        if (!opts.planChecked) {
            const { data: prof } = await admin.from('profiles').select('organization_id').eq('id', msg.userId).maybeSingle();
            const { data: plan } = await admin.rpc('org_plan', { p_org: prof?.organization_id ?? null });
            if (!plan || plan === 'free') return { sent: 0, skipped: 'plan' };
        }

        // The language picked in the bot wins; otherwise the app's, then the link's.
        let lang: Lang = normalizeLang(link.language);
        if (!link.language_chosen) {
            const { data: prefs } = await admin.from('notification_preferences').select('language').eq('user_id', msg.userId).maybeSingle();
            if (prefs?.language === 'cs' || prefs?.language === 'en') lang = prefs.language;
        }

        const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
        const confirmData =
            msg.confirm && secret
                ? await signCallback(secret, link.chat_id, { type: 'confirm', from: new Date(msg.confirm.from), to: new Date(msg.confirm.to) })
                : null;

        const res = await sendMessage(
            link.chat_id,
            notificationText(msg, lang),
            { reply_markup: notificationKeyboard(msg, lang, confirmData, appUrl()) },
            { fetchImpl: opts.fetchImpl },
        );
        if (res.ok) return { sent: 1 };
        if (res.blocked) {
            await admin.from('telegram_links').delete().eq('user_id', msg.userId).eq('chat_id', link.chat_id);
            return { sent: 0, unlinked: true };
        }
        console.warn('[telegram] send failed', res.status, res.retryAfter ?? '');
        return { sent: 0, retryAfter: res.retryAfter };
    } catch (err) {
        console.error('[telegram] notification error', err instanceof Error ? err.message : 'unknown');
        return { sent: 0 };
    }
}
