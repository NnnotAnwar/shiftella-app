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
    type CallbackAction,
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
    HOURS_MAX_MONTHS,
    isLinkCode,
    mainMenu,
    monthWindow,
    parseCommand,
    parseMenuButton,
    SHIFTS_MAX_WEEKS,
    weekWindow,
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
/** "Link it from the app" button → THIS environment's app (dev bot → dev.shiftella.app), at the Telegram settings. */
const siteKeyboard = (): InlineKeyboard => {
    const base = appUrl();
    return { inline_keyboard: [[{ text: base.replace(/^https:\/\//, ''), url: `${base}/settings` }]] };
};
/** The persistent menu under the message box (sent with welcome / help / unknown replies). */
const menu = (ctx: Ctx) => ({ reply_markup: mainMenu(ctx.language, ctx.can_review) });

/** A view = what one message shows; sent by a command, redrawn in place by its arrows. */
interface View {
    text: string;
    keyboard: InlineKeyboard;
}

const nav = (chatId: number, action: CallbackAction) => signCallback(SECRET, chatId, action);

// --- Commands --------------------------------------------------------------------------

async function onStart(chatId: number, from: TgUser | undefined, arg: string) {
    const tgLang = normalizeLang(from?.language_code);
    if (!arg) {
        const ctx = await context(chatId);
        if (ctx) return reply(chatId, copy(ctx.language).help, menu(ctx));
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
    return reply(chatId, escapeHtml(copy(lang).welcome(res.first_name ?? '')), ctx ? menu(ctx) : {});
}

async function onStop(chatId: number, lang: Lang) {
    const { data, error } = await admin.rpc('telegram_unlink_chat', { p_chat_id: chatId });
    if (error) throw new Error(`unlink: ${error.code ?? 'rpc'}`);
    // Take the menu away with the link.
    return reply(chatId, data ? copy(lang).stopped : copy(lang).stopNotLinked, { reply_markup: { remove_keyboard: true } });
}

/** ◀ / ▶ row for a paged view; `null` hides that side. */
async function arrows(
    chatId: number,
    view: 'shifts' | 'hours',
    prev: { offset: number; label: string } | null,
    next: { offset: number; label: string } | null,
): Promise<InlineButton[]> {
    const row: InlineButton[] = [];
    if (prev) row.push({ text: prev.label, callback_data: await nav(chatId, { type: 'nav', view, offset: prev.offset }) });
    if (next) row.push({ text: next.label, callback_data: await nav(chatId, { type: 'nav', view, offset: next.offset }) });
    return row;
}

/** /shifts — week `week` (0 = the next 7 days), with ✓/○, Confirm and ◀ ▶. */
async function shiftsView(chatId: number, ctx: Ctx, week: number): Promise<View> {
    const c = copy(ctx.language);
    const now = new Date();
    const win = weekWindow(now, week);
    const { data, error } = await admin
        .from('scheduled_shifts')
        .select('id, starts_at, ends_at, all_day, locations(name), shift_confirmations(scheduled_shift_id)')
        .eq('user_id', ctx.user_id)
        .eq('organization_id', ctx.organization_id)
        .eq('published', true)
        .gt('ends_at', (week === 0 ? now : win.from).toISOString())
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
        keyboard.push([{ text: `✓ ${c.confirmAll}`, callback_data: await nav(chatId, { type: 'confirm', from: win.from, to: win.to, week }) }]);
    }
    const pager = await arrows(
        chatId,
        'shifts',
        week > 0 ? { offset: week - 1, label: week === 1 ? `◀ ${c.thisWeek}` : c.prevWeek } : null,
        week < SHIFTS_MAX_WEEKS ? { offset: week + 1, label: c.nextWeek } : null,
    );
    if (pager.length) keyboard.push(pager);
    keyboard.push([{ text: c.openApp, url: `${appUrl()}/schedule` }]);
    return { text: formatShifts(rows, ctx.language, week === 0 ? undefined : win), keyboard: { inline_keyboard: keyboard } };
}

const fullName = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—';

/** /today — my shift(s) today, clock-in state (read only) and who else is on. 🔄 redraws it. */
async function todayView(chatId: number, ctx: Ctx): Promise<View> {
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
    const c = copy(lang);
    return {
        text,
        keyboard: {
            inline_keyboard: [
                [
                    { text: c.refresh, callback_data: await nav(chatId, { type: 'nav', view: 'today', offset: 0 }) },
                    { text: c.openApp, url: `${appUrl()}/` },
                ],
            ],
        },
    };
}

/** /hours — month `month` (0 = this month, −1 = last month …), with ◀ ▶. */
async function hoursView(chatId: number, ctx: Ctx, month: number): Promise<View> {
    const lang = ctx.language;
    const c = copy(lang);
    const now = new Date();
    const win = monthWindow(now, month);
    const [workedQ, plannedQ] = await Promise.all([
        admin
            .from('shifts')
            .select('started_at, ended_at')
            .eq('user_id', ctx.user_id)
            .gte('started_at', win.from.toISOString())
            .lt('started_at', win.to.toISOString())
            .limit(500),
        admin
            .from('scheduled_shifts')
            .select('starts_at, ends_at, all_day')
            .eq('user_id', ctx.user_id)
            .eq('organization_id', ctx.organization_id)
            .eq('published', true)
            .gte('starts_at', win.from.toISOString())
            .lt('starts_at', win.to.toISOString())
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
    const pager = await arrows(
        chatId,
        'hours',
        month > -HOURS_MAX_MONTHS ? { offset: month - 1, label: c.prevMonth } : null,
        month < 0 ? { offset: month + 1, label: month === -1 ? `${c.thisMonth} ▶` : c.nextMonth } : null,
    );
    const keyboard: InlineButton[][] = [];
    if (pager.length) keyboard.push(pager);
    keyboard.push([{ text: c.openApp, url: `${appUrl()}/overview` }]);
    return {
        text: formatHours({ hours: workedNetHours(worked, now.getTime()), shifts: worked.length }, { hours: plannedHours, shifts: planned.length }, win.from, lang),
        keyboard: { inline_keyboard: keyboard },
    };
}

const send = (chatId: number, v: View) => reply(chatId, v.text, { reply_markup: v.keyboard });

/** Redraw a view in place (arrows, 🔄, Confirm). "Not modified" is fine — nothing changed. */
async function redraw(chatId: number, messageId: number, v: View) {
    await tgCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: v.text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: v.keyboard,
    });
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
    const button = parseMenuButton(msg.text);
    const parsed = parseCommand(msg.text, BOT_USERNAME) ?? (button ? { cmd: button, arg: '' } : null);
    const tgLang = normalizeLang(msg.from.language_code);

    if (parsed?.cmd === 'start') return onStart(chatId, msg.from, parsed.arg);

    const ctx = await context(chatId);
    const lang = ctx?.language ?? tgLang;
    const c = copy(lang);

    if (parsed?.cmd === 'stop') return onStop(chatId, lang);
    if (parsed?.cmd === 'help') return ctx ? reply(chatId, c.help, menu(ctx)) : reply(chatId, `${c.help}\n\n${c.notLinked}`);
    if (!ctx) return reply(chatId, c.notLinked, { reply_markup: siteKeyboard() });
    if (!parsed || parsed.cmd === 'unknown') return reply(chatId, c.unknown, menu(ctx));
    if (!ctx.allowed) return reply(chatId, c.plan);

    switch (parsed.cmd) {
        case 'shifts': return send(chatId, await shiftsView(chatId, ctx, 0));
        case 'today': return send(chatId, await todayView(chatId, ctx));
        case 'hours': return send(chatId, await hoursView(chatId, ctx, 0));
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

    if (action.type === 'nav') {
        await answer();
        const view =
            action.view === 'shifts'
                ? await shiftsView(chatId, ctx, action.offset)
                : action.view === 'hours'
                  ? await hoursView(chatId, ctx, action.offset)
                  : await todayView(chatId, ctx);
        return redraw(chatId, msg.message_id, view);
    }

    if (action.type === 'confirm') {
        const { data, error } = await admin.rpc('telegram_confirm_shifts', {
            p_chat_id: chatId,
            p_from: action.from.toISOString(),
            p_to: action.to.toISOString(),
        });
        if (error || typeof data !== 'number' || data < 0) return answer(c.decided.error);
        await answer(c.confirmed(data));
        // From the /shifts view: redraw it (○ → ✓). From a notification: just drop the button.
        if (action.week !== undefined) return redraw(chatId, msg.message_id, await shiftsView(chatId, ctx, action.week));
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
