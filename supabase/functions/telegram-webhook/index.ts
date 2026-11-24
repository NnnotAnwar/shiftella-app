// =============================================================================
// EDGE FUNCTION: telegram-webhook
// -----------------------------------------------------------------------------
// Telegram calls this for every bot update (setWebhook with secret_token). The
// X-Telegram-Bot-Api-Secret-Token header must equal TELEGRAM_WEBHOOK_SECRET.
//
//   /start <code>   link this chat (single-use code from the app)
//   /start /help    how to link / what the bot can do
//   /stop           unlink
//   /smeny /shifts  my published shifts, next 7 days (+ Confirm)
//   /dnes /today    today's shift + who else is on
//   /hodiny /hours  this month's worked hours (My hours rules) vs planned
//   /oznameni /news latest 3 announcements
//   /zadosti /requests  pending requests I may decide, with Approve / Decline
//   buttons         signed callback data → SECURITY DEFINER RPCs that act as
//                   the linked user (the app's own permission + four-eyes rules)
//
// Identity comes only from the linked chat_id (private chats only). Every reply
// is HTML-escaped. User errors never produce a 5xx (Telegram would retry):
// anything unexpected is logged without PII and answered with 200.
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME
// (+ the default SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY; optional APP_URL).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    appUrl,
    escapeHtml,
    normalizeLang,
    sendMessage,
    signCallback,
    tgCall,
    timingSafeEqual,
    verifyCallback,
    type InlineButton,
    type InlineKeyboard,
    type Lang,
} from '../_shared/telegram.ts';
import {
    copy,
    daysWindow,
    formatHours,
    formatNews,
    formatRequest,
    formatShifts,
    formatToday,
    isLinkCode,
    monthWindow,
    parseCommand,
    workedNetHours,
    type PendingRequest,
    type ShiftRow,
} from './bot.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const BOT_USERNAME = (Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '').replace(/^@/, '');
const MAX_REQUEST_CARDS = 5;

// --- Telegram update shapes (only what we read) -----------------------------------

interface TgUser { id: number; is_bot?: boolean; username?: string; language_code?: string }
interface TgChat { id: number; type: string }
interface TgMessage { message_id: number; chat: TgChat; from?: TgUser; text?: string; reply_markup?: InlineKeyboard }
interface TgCallbackQuery { id: string; from: TgUser; message?: TgMessage; data?: string }
interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery }

interface Ctx {
    user_id: string;
    organization_id: string | null;
    first_name: string | null;
    language: Lang;
    allowed: boolean;
    can_review: boolean;
}

const ok = () => new Response('ok', { status: 200 });

// --- Context --------------------------------------------------------------------------

async function context(chatId: number): Promise<Ctx | null> {
    const { data, error } = await admin.rpc('telegram_context', { p_chat_id: chatId });
    if (error) throw new Error(`context: ${error.code ?? 'rpc'}`);
    if (!data) return null;
    return { ...(data as Ctx), language: normalizeLang((data as Ctx).language) };
}

const reply = (chatId: number, text: string, extra: Record<string, unknown> = {}) => sendMessage(chatId, text, extra);
const openAppKeyboard = (lang: Lang, route = '/'): InlineKeyboard => ({ inline_keyboard: [[{ text: copy(lang).openApp, url: `${appUrl()}${route}` }]] });
const siteKeyboard = (): InlineKeyboard => ({ inline_keyboard: [[{ text: 'shiftella.app', url: 'https://shiftella.app' }]] });

// --- Commands --------------------------------------------------------------------------

async function onStart(chatId: number, from: TgUser | undefined, arg: string) {
    const tgLang = normalizeLang(from?.language_code);
    if (!arg) {
        const ctx = await context(chatId);
        if (ctx) return reply(chatId, copy(ctx.language).help);
        return reply(chatId, copy(tgLang).startUnlinked, { reply_markup: siteKeyboard() });
    }
    if (!isLinkCode(arg)) return reply(chatId, copy(tgLang).badCode);
    const { data, error } = await admin.rpc('telegram_link_consume', {
        p_code: arg,
        p_chat_id: chatId,
        p_username: from?.username ?? null,
        p_language: from?.language_code ?? null,
    });
    if (error) throw new Error(`link: ${error.code ?? 'rpc'}`);
    const res = data as { ok: boolean; first_name?: string | null };
    if (!res?.ok) return reply(chatId, copy(tgLang).badCode);
    const ctx = await context(chatId);
    const lang = ctx?.language ?? tgLang;
    return reply(chatId, escapeHtml(copy(lang).welcome(res.first_name ?? '')));
}

async function onStop(chatId: number, lang: Lang) {
    const { data, error } = await admin.rpc('telegram_unlink_chat', { p_chat_id: chatId });
    if (error) throw new Error(`unlink: ${error.code ?? 'rpc'}`);
    return reply(chatId, data ? copy(lang).stopped : copy(lang).stopNotLinked);
}

async function onShifts(chatId: number, ctx: Ctx) {
    const lang = ctx.language;
    const now = new Date();
    const win = daysWindow(now, 7);
    const { data, error } = await admin
        .from('scheduled_shifts')
        .select('id, starts_at, ends_at, all_day, locations(name), shift_confirmations(scheduled_shift_id)')
        .eq('user_id', ctx.user_id)
        .eq('organization_id', ctx.organization_id)
        .eq('published', true)
        .gt('ends_at', now.toISOString())
        .lt('starts_at', win.to.toISOString())
        .order('starts_at')
        .limit(30);
    if (error) throw new Error(`shifts: ${error.code}`);
    const rows: ShiftRow[] = (data ?? []).map((s: Record<string, unknown>) => ({
        starts_at: s.starts_at as string,
        ends_at: s.ends_at as string,
        all_day: !!s.all_day,
        location: (s.locations as { name?: string } | null)?.name ?? null,
        confirmed: Array.isArray(s.shift_confirmations) ? s.shift_confirmations.length > 0 : !!s.shift_confirmations,
    }));
    const keyboard: InlineButton[][] = [];
    if (rows.some((r) => !r.confirmed) && SECRET) {
        const data = await signCallback(SECRET, chatId, { type: 'confirm', from: win.from, to: win.to });
        keyboard.push([{ text: `✓ ${copy(lang).confirmAll}`, callback_data: data }]);
    }
    keyboard.push([{ text: copy(lang).openApp, url: `${appUrl()}/schedule` }]);
    return reply(chatId, formatShifts(rows, lang), { reply_markup: { inline_keyboard: keyboard } });
}

const fullName = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—';

async function onToday(chatId: number, ctx: Ctx) {
    const lang = ctx.language;
    const day = daysWindow(new Date(), 1);
    const { data, error } = await admin
        .from('scheduled_shifts')
        .select('user_id, location_id, starts_at, ends_at, all_day, locations(name), profiles:user_id(first_name, last_name)')
        .eq('organization_id', ctx.organization_id)
        .eq('published', true)
        .lt('starts_at', day.to.toISOString())
        .gt('ends_at', day.from.toISOString())
        .order('starts_at')
        .limit(200);
    if (error) throw new Error(`today: ${error.code}`);
    const all = (data ?? []) as Record<string, unknown>[];
    const mine = all.filter((s) => s.user_id === ctx.user_id);
    // Colleagues at the same place(s) as me today.
    const myLocs = new Set(mine.map((s) => s.location_id ?? null));
    const others = all
        .filter((s) => s.user_id !== ctx.user_id && myLocs.has(s.location_id ?? null))
        .map((s) => ({
            name: fullName(s.profiles as { first_name?: string; last_name?: string }),
            starts_at: s.starts_at as string,
            ends_at: s.ends_at as string,
            all_day: !!s.all_day,
        }));

    const { data: open } = await admin.from('shifts').select('started_at').eq('user_id', ctx.user_id).is('ended_at', null).maybeSingle();
    const text = formatToday(
        mine.map((s) => ({
            starts_at: s.starts_at as string,
            ends_at: s.ends_at as string,
            all_day: !!s.all_day,
            location: (s.locations as { name?: string } | null)?.name ?? null,
        })),
        others.slice(0, 25),
        (open?.started_at as string | undefined) ?? null,
        lang,
    );
    return reply(chatId, text);
}

async function onHours(chatId: number, ctx: Ctx) {
    const lang = ctx.language;
    const now = new Date();
    const month = monthWindow(now);
    const [workedQ, plannedQ] = await Promise.all([
        admin
            .from('shifts')
            .select('started_at, ended_at')
            .eq('user_id', ctx.user_id)
            .gte('started_at', month.from.toISOString())
            .lt('started_at', month.to.toISOString())
            .limit(500),
        admin
            .from('scheduled_shifts')
            .select('starts_at, ends_at, all_day')
            .eq('user_id', ctx.user_id)
            .eq('organization_id', ctx.organization_id)
            .eq('published', true)
            .gte('starts_at', month.from.toISOString())
            .lt('starts_at', month.to.toISOString())
            .limit(500),
    ]);
    if (workedQ.error || plannedQ.error) throw new Error('hours: query');
    const worked = (workedQ.data ?? []) as { started_at: string; ended_at: string | null }[];
    const planned = (plannedQ.data ?? []) as { starts_at: string; ends_at: string; all_day: boolean }[];
    // Planned hours use the same break rule; "all day" rows have no times and count as shifts only.
    const plannedHours = workedNetHours(
        planned.filter((p) => !p.all_day).map((p) => ({ started_at: p.starts_at, ended_at: p.ends_at })),
        now.getTime(),
    );
    return reply(
        chatId,
        formatHours({ hours: workedNetHours(worked, now.getTime()), shifts: worked.length }, { hours: plannedHours, shifts: planned.length }, now, lang),
        { reply_markup: openAppKeyboard(lang, '/overview') },
    );
}

async function onNews(chatId: number, ctx: Ctx) {
    const { data, error } = await admin
        .from('announcements')
        .select('title, body, pinned, created_at')
        .eq('organization_id', ctx.organization_id)
        .order('created_at', { ascending: false })
        .limit(3);
    if (error) throw new Error(`news: ${error.code}`);
    return reply(chatId, formatNews((data ?? []) as { title: string; body: string; pinned: boolean; created_at: string }[], ctx.language), {
        reply_markup: openAppKeyboard(ctx.language, '/announcements'),
    });
}

async function onRequests(chatId: number, ctx: Ctx) {
    const c = copy(ctx.language);
    if (!ctx.can_review) return reply(chatId, c.cantReview);
    const { data, error } = await admin.rpc('telegram_pending_requests', { p_chat_id: chatId });
    if (error) throw new Error(`requests: ${error.code ?? 'rpc'}`);
    const items = (data ?? []) as PendingRequest[];
    if (items.length === 0) return reply(chatId, c.noRequests);
    await reply(chatId, `<b>${escapeHtml(c.requestsTitle(items.length))}</b>`);
    for (const r of items.slice(0, MAX_REQUEST_CARDS)) {
        const [yes, no] = await Promise.all([
            signCallback(SECRET, chatId, { type: 'decide', kind: r.kind, id: r.id, approve: true }),
            signCallback(SECRET, chatId, { type: 'decide', kind: r.kind, id: r.id, approve: false }),
        ]);
        await reply(chatId, formatRequest(r, ctx.language), {
            reply_markup: { inline_keyboard: [[{ text: `✓ ${c.approve}`, callback_data: yes }, { text: `✕ ${c.decline}`, callback_data: no }]] },
        });
    }
    if (items.length > MAX_REQUEST_CARDS) {
        await reply(chatId, escapeHtml(c.moreInApp(items.length - MAX_REQUEST_CARDS)), { reply_markup: openAppKeyboard(ctx.language, '/requests') });
    }
}

async function onMessage(msg: TgMessage) {
    const chatId = msg.chat.id;
    // Private chats only: a group must never see anyone's schedule.
    if (msg.chat.type !== 'private' || !msg.from || msg.from.is_bot || msg.from.id !== chatId) return;
    const parsed = parseCommand(msg.text, BOT_USERNAME);
    const tgLang = normalizeLang(msg.from.language_code);

    if (parsed?.cmd === 'start') return onStart(chatId, msg.from, parsed.arg);

    const ctx = await context(chatId);
    const lang = ctx?.language ?? tgLang;
    const c = copy(lang);

    if (parsed?.cmd === 'stop') return onStop(chatId, lang);
    if (parsed?.cmd === 'help') return reply(chatId, ctx ? c.help : `${c.help}\n\n${c.notLinked}`);
    if (!ctx) return reply(chatId, c.notLinked, { reply_markup: siteKeyboard() });
    if (!parsed || parsed.cmd === 'unknown') return reply(chatId, c.unknown);
    if (!ctx.allowed) return reply(chatId, c.plan);

    switch (parsed.cmd) {
        case 'shifts': return onShifts(chatId, ctx);
        case 'today': return onToday(chatId, ctx);
        case 'hours': return onHours(chatId, ctx);
        case 'news': return onNews(chatId, ctx);
        case 'requests': return onRequests(chatId, ctx);
    }
}

// --- Buttons ------------------------------------------------------------------------------

/** The message's keyboard minus the pressed button (rows left empty are dropped). */
function withoutButton(markup: InlineKeyboard | undefined, data: string): InlineKeyboard {
    const rows = (markup?.inline_keyboard ?? [])
        .map((row) => row.filter((b) => !('callback_data' in b) || b.callback_data !== data))
        .filter((row) => row.length > 0);
    return { inline_keyboard: rows };
}

async function onCallback(q: TgCallbackQuery) {
    const answer = (text?: string) => tgCall('answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) });
    const msg = q.message;
    const chatId = msg?.chat.id;
    if (!msg || !chatId || msg.chat.type !== 'private' || q.from.id !== chatId) return answer();

    const action = await verifyCallback(SECRET, chatId, q.data);
    const ctx = await context(chatId);
    const lang = ctx?.language ?? normalizeLang(q.from.language_code);
    const c = copy(lang);
    if (!action) return answer(c.badButton);
    if (!ctx) return answer(c.notLinked.replace(/<[^>]+>/g, ''));
    if (!ctx.allowed) return answer(c.plan.replace(/<[^>]+>/g, ''));

    if (action.type === 'confirm') {
        const { data, error } = await admin.rpc('telegram_confirm_shifts', {
            p_chat_id: chatId,
            p_from: action.from.toISOString(),
            p_to: action.to.toISOString(),
        });
        if (error || typeof data !== 'number' || data < 0) return answer(c.decided.error);
        await answer(c.confirmed(data));
        await tgCall('editMessageReplyMarkup', { chat_id: chatId, message_id: msg.message_id, reply_markup: withoutButton(msg.reply_markup, q.data ?? '') });
        return;
    }

    const { data: result, error } = await admin.rpc('telegram_decide', {
        p_chat_id: chatId,
        p_kind: action.kind,
        p_id: action.id,
        p_approve: action.approve,
    });
    const code = error ? 'error' : String(result);
    if (code === 'ok' || code === 'already' || code === 'not_found') {
        const status = code === 'ok' ? (action.approve ? `✓ ${c.approved}` : `✕ ${c.declined}`) : c.decided[code];
        await answer(code === 'ok' ? status : c.decided[code]);
        // Re-render from the plain text Telegram gives back (formatting is dropped, content kept).
        await tgCall('editMessageText', {
            chat_id: chatId,
            message_id: msg.message_id,
            text: `${escapeHtml(msg.text ?? '')}\n\n<b>${escapeHtml(status)}</b>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] },
        });
        return;
    }
    return answer(c.decided[code] ?? c.decided.error);
}

// --- HTTP entry ------------------------------------------------------------------------------

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!SECRET || !timingSafeEqual(req.headers.get('x-telegram-bot-api-secret-token') ?? '', SECRET)) {
        return new Response('Unauthorized', { status: 401 });
    }

    let update: TgUpdate;
    try {
        const raw = await req.text();
        if (raw.length > 1_000_000) return ok();
        update = JSON.parse(raw);
    } catch {
        return ok(); // malformed — nothing to retry
    }

    try {
        if (update.message) await onMessage(update.message);
        else if (update.callback_query) await onCallback(update.callback_query);
        // edited_message, channel posts, member updates…: acknowledged and ignored.
    } catch (err) {
        // Log the failure class only — never chat text, names or ids.
        console.error('[telegram-webhook]', err instanceof Error ? err.message : 'unknown error');
        const chatId = update.message?.chat.type === 'private' ? update.message.chat.id : undefined;
        if (chatId) await reply(chatId, copy(normalizeLang(update.message?.from?.language_code)).error);
        if (update.callback_query) await tgCall('answerCallbackQuery', { callback_query_id: update.callback_query.id });
    }
    return ok();
});
