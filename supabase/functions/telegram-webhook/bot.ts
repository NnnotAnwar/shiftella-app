// =============================================================================
// telegram-webhook — pure helpers: command parsing, copy (CS/EN), formatting,
// Prague-time math and the My hours break rule. No I/O here (see bot_test.ts).
// =============================================================================

import { escapeHtml, truncate, type Lang } from '../_shared/telegram.ts';
import { pragueDate, pragueMidnight, TZ } from '../_shared/prague.ts';

export { pragueDate, pragueMidnight, TZ };

// --- Commands ------------------------------------------------------------------

export type Command = 'start' | 'help' | 'stop' | 'shifts' | 'today' | 'hours' | 'news' | 'requests' | 'language' | 'unknown';

// English commands only (the same in every language; the menu and replies are localized).
const ALIASES: Record<string, Command> = {
    start: 'start',
    help: 'help',
    menu: 'help',
    stop: 'stop',
    shifts: 'shifts',
    today: 'today',
    hours: 'hours',
    news: 'news',
    requests: 'requests',
    language: 'language',
    lang: 'language',
};

/**
 * `/cmd[@bot] [arg]` → the command + its argument. Null for plain text and for
 * commands addressed to another bot. Unknown commands come back as 'unknown'.
 */
export function parseCommand(text: string | undefined | null, botUsername: string): { cmd: Command; arg: string } | null {
    const m = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{1,64}))?(?:\s+([\s\S]*))?$/.exec((text ?? '').trim());
    if (!m) return null;
    if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.replace(/^@/, '').toLowerCase()) return null;
    return { cmd: ALIASES[m[1].toLowerCase()] ?? 'unknown', arg: (m[3] ?? '').trim() };
}

/** A deep-link code from /start (40 hex chars, see create_telegram_link_code). */
export function isLinkCode(arg: string): boolean {
    return /^[a-f0-9]{40}$/.test(arg);
}

// --- Main menu (persistent reply keyboard) ---------------------------------------

export type MenuCommand = 'shifts' | 'today' | 'hours' | 'news' | 'requests' | 'help';

const MENU_LABELS: Record<Lang, Record<MenuCommand, string>> = {
    en: { shifts: '📅 Shifts', today: '📍 Today', hours: '⏱ Hours', news: '📣 News', requests: '📥 Requests', help: '❓ Help' },
    cs: { shifts: '📅 Směny', today: '📍 Dnes', hours: '⏱ Hodiny', news: '📣 Oznámení', requests: '📥 Žádosti', help: '❓ Nápověda' },
};

export interface ReplyKeyboard {
    keyboard: { text: string }[][];
    resize_keyboard: true;
    is_persistent: true;
    input_field_placeholder?: string;
}

/** One-tap language switch in the menu: labelled with the OTHER language, in that language. */
const LANGUAGE_BUTTON: Record<Lang, string> = { en: '🌐 Čeština', cs: '🌐 English' };

/** The menu under the message box. Reviewers get a Requests button. */
export function mainMenu(lang: Lang, canReview: boolean): ReplyKeyboard {
    const l = MENU_LABELS[lang];
    return {
        keyboard: [
            [{ text: l.shifts }, { text: l.today }],
            [{ text: l.hours }, { text: l.news }],
            ...(canReview ? [[{ text: l.requests }]] : []),
            [{ text: l.help }, { text: LANGUAGE_BUTTON[lang] }],
        ],
        resize_keyboard: true,
        is_persistent: true,
        input_field_placeholder: lang === 'cs' ? 'Vyberte v menu…' : 'Pick from the menu…',
    };
}

/** A menu button's text (either language) → its command; null for anything else. */
export function parseMenuButton(text: string | undefined | null): MenuCommand | null {
    const t = (text ?? '').trim();
    if (!t) return null;
    for (const lang of ['en', 'cs'] as Lang[]) {
        for (const [cmd, label] of Object.entries(MENU_LABELS[lang])) if (label === t) return cmd as MenuCommand;
    }
    return null;
}

/** The 🌐 menu button → the language it switches TO; null for anything else. */
export function parseLanguageButton(text: string | undefined | null): Lang | null {
    const t = (text ?? '').trim();
    if (t === LANGUAGE_BUTTON.en) return 'cs';
    if (t === LANGUAGE_BUTTON.cs) return 'en';
    return null;
}

/** `/language cs` / `/language en` (also čeština / english) → that language. */
export function parseLanguageArg(arg: string): Lang | null {
    const a = arg.trim().toLowerCase();
    if (['cs', 'cz', 'czech', 'cestina', 'čeština'].includes(a)) return 'cs';
    if (['en', 'english', 'anglictina', 'angličtina'].includes(a)) return 'en';
    return null;
}

// --- Views with arrows: how far they may page ---------------------------------------
export const SHIFTS_MAX_WEEKS = 8; // weeks ahead
export const HOURS_MAX_MONTHS = 12; // months back

// --- Copy ----------------------------------------------------------------------------

const S = {
    en: {
        welcome: (name: string) => `Done${name ? `, ${name}` : ''}! This chat is now linked to Shiftella.\nYou'll get your notifications here — and the menu below has everything else.`,
        startUnlinked: 'Hi! I\'m the <b>Shiftella</b> bot — shift notifications, announcements and quick answers about your schedule.\n\nTo link this chat, open the app: <b>Settings → Notifications → Telegram → Connect</b>.',
        badCode: 'This link has expired or was already used. In the app, tap <b>Connect Telegram</b> again.',
        notLinked: 'This chat isn\'t linked to a Shiftella account. Link it in the app: <b>Settings → Notifications → Telegram</b>.',
        stopped: 'Disconnected. I won\'t send you anything more. You can link again from the app any time.',
        stopNotLinked: 'This chat isn\'t linked — nothing to disconnect.',
        plan: 'Telegram notifications are part of the <b>Team</b> plan. Ask the account owner to upgrade.',
        unknown: 'I don\'t know that one — use the menu below or /help.',
        privateOnly: 'I only work in a private chat.',
        error: 'Something went wrong. Please try again in a moment.',
        help: [
            '<b>Shiftella bot</b>',
            '/shifts — your shifts for the next 7 days',
            '/today — today\'s shift and who else is on',
            '/hours — hours worked this month',
            '/news — latest announcements',
            '/requests — requests waiting for your decision',
            '/language — switch between English and Czech',
            '/stop — disconnect this chat',
            '',
            'Or just use the menu under the message box.',
        ].join('\n'),
        shiftsTitle: 'Your shifts · next 7 days',
        shiftsRange: (range: string) => `Your shifts · ${range}`,
        noShifts: 'No shifts in the next 7 days.',
        noShiftsRange: 'No shifts in this week.',
        prevWeek: '◀ Previous',
        nextWeek: 'Next week ▶',
        prevMonth: '◀ Previous month',
        nextMonth: 'Next month ▶',
        thisWeek: 'This week',
        thisMonth: 'This month',
        refresh: '🔄 Refresh',
        languageTitle: 'Bot language',
        languageSet: 'Done — I\'ll speak English here now. Notifications in Telegram will be in English too.',
        confirmAll: 'Confirm shifts',
        allDay: 'all day',
        todayTitle: 'Today',
        noShiftToday: 'No shift for you today.',
        alsoOn: 'Also on',
        nobodyElse: 'Nobody else is scheduled.',
        clockedIn: (t: string) => `Clocked in since ${t}.`,
        hoursTitle: (month: string) => `Hours · ${month}`,
        worked: 'Worked',
        planned: 'Planned',
        breaksNote: 'after mandatory breaks',
        newsTitle: 'Latest announcements',
        noNews: 'No announcements yet.',
        noRequests: 'Nothing is waiting for your decision.',
        cantReview: 'You don\'t decide requests in your team.',
        requestsTitle: (n: number) => `${n} request${n === 1 ? '' : 's'} waiting for you`,
        moreInApp: (n: number) => `…and ${n} more in the app.`,
        openApp: 'Open app',
        approve: 'Approve',
        decline: 'Decline',
        approved: 'Approved',
        declined: 'Declined',
        decided: {
            not_allowed: 'You can\'t decide this one.',
            not_found: 'This request no longer exists.',
            already: 'Already decided.',
            blocked: 'Can\'t approve — the shift clashes with the taker\'s schedule.',
            overlap: 'Can\'t approve — it overlaps other leave.',
            gone: 'That role no longer exists.',
            error: 'Something went wrong. Try it in the app.',
        } as Record<string, string>,
        badButton: 'This button has expired.',
        confirmed: (n: number) => (n === 0 ? 'Everything was already confirmed.' : `Confirmed ${n} shift${n === 1 ? '' : 's'}.`),
        kind: {
            vacation: 'Vacation', sick: 'Sick leave', other: 'Leave', ocr: 'Family care (OČR)', comp_time: 'Time off in lieu',
            unpaid: 'Unpaid leave', doctor: 'Doctor', sick_day: 'Sick day', business_trip: 'Business trip', home_office: 'Home office',
            parental: 'Parental leave', obstacle: 'Employer-side obstacle',
        } as Record<string, string>,
        reqKind: { name: 'Name change', swap: 'Shift swap', role: 'Role request', complaint: 'Complaint', other: 'Request' } as Record<string, string>,
        anonymous: 'Anonymous',
    },
    cs: {
        welcome: (name: string) => `Hotovo${name ? `, ${name}` : ''}! Tento chat je propojený se Shiftellou.\nOznámení vám budu posílat sem — a vše ostatní najdete v menu dole.`,
        startUnlinked: 'Ahoj! Jsem bot <b>Shiftella</b> — oznámení o směnách, novinky z týmu a rychlé odpovědi na váš rozpis.\n\nChat propojíte v aplikaci: <b>Nastavení → Oznámení → Telegram → Propojit</b>.',
        badCode: 'Odkaz vypršel nebo už byl použit. V aplikaci klepněte znovu na <b>Propojit Telegram</b>.',
        notLinked: 'Tento chat není propojený s účtem Shiftella. Propojíte ho v aplikaci: <b>Nastavení → Oznámení → Telegram</b>.',
        stopped: 'Odpojeno. Už vám nic posílat nebudu. Znovu propojit můžete kdykoli v aplikaci.',
        stopNotLinked: 'Tento chat není propojený — není co odpojit.',
        plan: 'Oznámení v Telegramu jsou součástí tarifu <b>Team</b>. Požádejte majitele účtu o přechod.',
        unknown: 'Tomu nerozumím — použijte menu dole nebo /help.',
        privateOnly: 'Funguji jen v soukromém chatu.',
        error: 'Něco se pokazilo. Zkuste to prosím za chvíli.',
        help: [
            '<b>Shiftella bot</b>',
            '/shifts — vaše směny na příštích 7 dní',
            '/today — dnešní směna a kdo je s vámi',
            '/hours — odpracované hodiny tento měsíc',
            '/news — nejnovější oznámení',
            '/requests — žádosti, které čekají na vás',
            '/language — přepnout mezi češtinou a angličtinou',
            '/stop — odpojit tento chat',
            '',
            'Nebo prostě použijte menu pod polem pro zprávu.',
        ].join('\n'),
        shiftsTitle: 'Vaše směny · příštích 7 dní',
        shiftsRange: (range: string) => `Vaše směny · ${range}`,
        noShifts: 'Na příštích 7 dní nemáte žádnou směnu.',
        noShiftsRange: 'Tento týden nemáte žádnou směnu.',
        prevWeek: '◀ Předchozí',
        nextWeek: 'Další týden ▶',
        prevMonth: '◀ Předchozí měsíc',
        nextMonth: 'Další měsíc ▶',
        thisWeek: 'Tento týden',
        thisMonth: 'Tento měsíc',
        refresh: '🔄 Obnovit',
        languageTitle: 'Jazyk bota',
        languageSet: 'Hotovo — teď s vámi mluvím česky. Oznámení v Telegramu budou také česky.',
        confirmAll: 'Potvrdit směny',
        allDay: 'celý den',
        todayTitle: 'Dnes',
        noShiftToday: 'Dnes nemáte směnu.',
        alsoOn: 'S vámi',
        nobodyElse: 'Nikdo další není naplánovaný.',
        clockedIn: (t: string) => `V práci od ${t}.`,
        hoursTitle: (month: string) => `Hodiny · ${month}`,
        worked: 'Odpracováno',
        planned: 'Naplánováno',
        breaksNote: 'po povinných přestávkách',
        newsTitle: 'Nejnovější oznámení',
        noNews: 'Zatím žádná oznámení.',
        noRequests: 'Nic na vaše rozhodnutí nečeká.',
        cantReview: 'Žádosti ve vašem týmu neschvalujete.',
        requestsTitle: (n: number) => `Na vaše rozhodnutí čeká ${n} ${csPlural(n, 'žádost', 'žádosti', 'žádostí')}`,
        moreInApp: (n: number) => `…a ${n} ${csPlural(n, 'další', 'další', 'dalších')} v aplikaci.`,
        openApp: 'Otevřít aplikaci',
        approve: 'Schválit',
        decline: 'Zamítnout',
        approved: 'Schváleno',
        declined: 'Zamítnuto',
        decided: {
            not_allowed: 'O této žádosti rozhodovat nemůžete.',
            not_found: 'Tato žádost už neexistuje.',
            already: 'Už je rozhodnuto.',
            blocked: 'Nelze schválit — směna koliduje s rozpisem přebírajícího.',
            overlap: 'Nelze schválit — překrývá se s jiným volnem.',
            gone: 'Tato role už neexistuje.',
            error: 'Něco se pokazilo. Zkuste to v aplikaci.',
        } as Record<string, string>,
        badButton: 'Platnost tlačítka vypršela.',
        confirmed: (n: number) =>
            n === 0 ? 'Vše už bylo potvrzené.' : `${csPlural(n, 'Potvrzena', 'Potvrzeny', 'Potvrzeno')} ${n} ${csPlural(n, 'směna', 'směny', 'směn')}.`,
        kind: {
            vacation: 'Dovolená', sick: 'Nemocenská', other: 'Volno', ocr: 'OČR', comp_time: 'Náhradní volno',
            unpaid: 'Neplacené volno', doctor: 'Lékař', sick_day: 'Sick day', business_trip: 'Služební cesta', home_office: 'Home office',
            parental: 'Mateřská / rodičovská', obstacle: 'Překážka na straně zaměstnavatele',
        } as Record<string, string>,
        reqKind: { name: 'Změna jména', swap: 'Výměna směny', role: 'Žádost o roli', complaint: 'Stížnost', other: 'Žádost' } as Record<string, string>,
        anonymous: 'Anonymně',
    },
};

export type Copy = typeof S.en;
export const copy = (lang: Lang): Copy => S[lang] as Copy;

/** Czech plural pick: (1) one, (2–4) few, (else) many. */
export function csPlural(n: number, one: string, few: string, many: string): string {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

// --- Prague time ------------------------------------------------------------------------

const locale = (lang: Lang) => (lang === 'cs' ? 'cs-CZ' : 'en-GB');

/** [start of today, start of today + n days) in Prague. */
export function daysWindow(now: Date, n: number): { from: Date; to: Date } {
    const { y, m, d } = pragueDate(now);
    return { from: pragueMidnight(y, m, d), to: pragueMidnight(y, m, d + n) };
}

/** [first of this month, first of next month) in Prague; `offset` months away (−1 = last month). */
export function monthWindow(now: Date, offset = 0): { from: Date; to: Date } {
    const { y, m } = pragueDate(now);
    return { from: pragueMidnight(y, m + offset, 1), to: pragueMidnight(y, m + offset + 1, 1) };
}

/** The /shifts page: week `offset` = [today + 7·offset days, +7 days) in Prague. */
export function weekWindow(now: Date, offset = 0): { from: Date; to: Date } {
    const { y, m, d } = pragueDate(now);
    return { from: pragueMidnight(y, m, d + 7 * offset), to: pragueMidnight(y, m, d + 7 * offset + 7) };
}

export function fmtTime(iso: string | Date, lang: Lang): string {
    return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, hour: lang === 'cs' ? 'numeric' : '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** "po 25. 11." / "Mon 25 Nov". */
export function fmtDay(iso: string | Date, lang: Lang): string {
    const opts: Intl.DateTimeFormatOptions =
        lang === 'cs' ? { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' } : { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' };
    return new Intl.DateTimeFormat(locale(lang), opts).format(new Date(iso)).replace(/,/g, '');
}

/** "listopad 2026" / "November 2026". */
export function fmtMonth(at: Date, lang: Lang): string {
    return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, month: 'long', year: 'numeric' }).format(at);
}

/** "82,5 h" / "82.5 h". */
export function fmtHours(h: number, lang: Lang): string {
    const r = Math.round(h * 10) / 10;
    return `${lang === 'cs' ? String(r).replace('.', ',') : String(r)} h`;
}

// --- Hours: the same rule as My hours (src/features/shifts/shiftStats.ts) ---------------

/** −30 min for every started 6-hour block (triggers at 6h 1m, 12h 1m, …). */
export function calculateNetHours(grossHours: number): number {
    if (grossHours <= 0) return 0;
    const breakCount = Math.floor((grossHours - 0.0001) / 6);
    return Math.max(0, grossHours - breakCount * 0.5);
}

/** Net hours of worked shifts (open ones count up to `now`), like My hours. */
export function workedNetHours(shifts: { started_at: string; ended_at: string | null }[], now: number): number {
    return shifts.reduce((sum, s) => {
        const start = new Date(s.started_at).getTime();
        const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
        return sum + calculateNetHours(Math.max(0, (end - start) / 3_600_000));
    }, 0);
}

// --- Formatting ----------------------------------------------------------------------------

export interface ShiftRow {
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    location?: string | null;
    confirmed?: boolean;
}

export function shiftLine(s: ShiftRow, lang: Lang, withDay = true): string {
    const time = s.all_day ? copy(lang).allDay : `${fmtTime(s.starts_at, lang)}–${fmtTime(s.ends_at, lang)}`;
    const mark = s.confirmed === undefined ? '•' : s.confirmed ? '✓' : '○';
    const head = withDay ? `<b>${escapeHtml(fmtDay(s.starts_at, lang))}</b> · ${escapeHtml(time)}` : `<b>${escapeHtml(time)}</b>`;
    return `${mark} ${head}${s.location ? ` · ${escapeHtml(s.location)}` : ''}`;
}

/**
 * The /shifts list. Without `range` it is "the next 7 days"; with one (a later
 * week from the arrows) the title names the days, e.g. "Mon 1 Dec – Sun 7 Dec".
 */
export function formatShifts(rows: ShiftRow[], lang: Lang, range?: { from: Date; to: Date }): string {
    const c = copy(lang);
    const title = range
        ? c.shiftsRange(`${fmtDay(range.from, lang)} – ${fmtDay(new Date(range.to.getTime() - 60_000), lang)}`)
        : c.shiftsTitle;
    const body = rows.length === 0 ? (range ? c.noShiftsRange : c.noShifts) : rows.map((r) => shiftLine(r, lang)).join('\n');
    return `<b>${escapeHtml(title)}</b>\n${body}`;
}

export function formatToday(
    mine: ShiftRow[],
    colleagues: { name: string; starts_at: string; ends_at: string; all_day: boolean }[],
    clockedInAt: string | null,
    lang: Lang,
): string {
    const c = copy(lang);
    const lines = [`<b>${c.todayTitle} · ${escapeHtml(fmtDay(new Date(), lang))}</b>`];
    if (mine.length === 0) lines.push(c.noShiftToday);
    else lines.push(...mine.map((r) => shiftLine({ ...r, confirmed: undefined }, lang, false)));
    if (clockedInAt) lines.push(c.clockedIn(escapeHtml(fmtTime(clockedInAt, lang))));
    if (mine.length > 0) {
        lines.push('', `<b>${c.alsoOn}</b>`);
        if (colleagues.length === 0) lines.push(c.nobodyElse);
        else
            lines.push(
                ...colleagues.map(
                    (p) => `• ${escapeHtml(p.name)} · ${escapeHtml(p.all_day ? c.allDay : `${fmtTime(p.starts_at, lang)}–${fmtTime(p.ends_at, lang)}`)}`,
                ),
            );
    }
    return lines.join('\n');
}

export function formatHours(
    worked: { hours: number; shifts: number },
    planned: { hours: number; shifts: number },
    month: Date,
    lang: Lang,
): string {
    const c = copy(lang);
    const n = (k: number) => (lang === 'cs' ? `${k} ${csPlural(k, 'směna', 'směny', 'směn')}` : `${k} shift${k === 1 ? '' : 's'}`);
    return [
        `<b>${escapeHtml(c.hoursTitle(fmtMonth(month, lang)))}</b>`,
        `${c.worked}: <b>${fmtHours(worked.hours, lang)}</b> · ${n(worked.shifts)}`,
        `${c.planned}: ${fmtHours(planned.hours, lang)} · ${n(planned.shifts)}`,
        `<i>${c.breaksNote}</i>`,
    ].join('\n');
}

export function formatNews(items: { title: string; body: string; pinned: boolean; created_at: string }[], lang: Lang): string {
    const c = copy(lang);
    if (items.length === 0) return c.noNews;
    const blocks = items.map(
        (a) => `${a.pinned ? '📌 ' : ''}<b>${escapeHtml(truncate(a.title, 120))}</b> · <i>${escapeHtml(fmtDay(a.created_at, lang))}</i>\n${escapeHtml(truncate(a.body, 600))}`,
    );
    return [`<b>${c.newsTitle}</b>`, ...blocks].join('\n\n');
}

export interface PendingRequest {
    kind: 'timeoff' | 'name' | 'swap' | 'member';
    id: string;
    who?: string | null;
    type?: string | null; // time-off kind / member-request kind
    starts_on?: string;
    ends_on?: string;
    from?: string;
    to?: string;
    taker?: string | null;
    starts_at?: string;
    ends_at?: string;
    all_day?: boolean;
    location?: string | null;
    subject?: string | null;
    role?: string | null;
}

/** "25. 11. – 28. 11." from YYYY-MM-DD dates (no timezone shift: they're calendar days). */
export function fmtDateRange(a: string, b: string, lang: Lang): string {
    const f = (s: string) => {
        const [y, m, d] = s.split('-').map(Number);
        return new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', day: 'numeric', month: lang === 'cs' ? 'numeric' : 'short' }).format(new Date(Date.UTC(y, m - 1, d)));
    };
    return a === b ? f(a) : `${f(a)} – ${f(b)}`;
}

/** One request as a short HTML card (no complaint text, anonymous stays anonymous). */
export function formatRequest(r: PendingRequest, lang: Lang): string {
    const c = copy(lang);
    const who = escapeHtml(r.who || c.anonymous);
    switch (r.kind) {
        case 'timeoff':
            return `<b>${escapeHtml(c.kind[r.type ?? 'other'] ?? c.kind.other)}</b> · ${who}\n${escapeHtml(fmtDateRange(r.starts_on ?? '', r.ends_on ?? '', lang))}`;
        case 'name':
            return `<b>${c.reqKind.name}</b> · ${who}\n${escapeHtml(r.from ?? '')} → ${escapeHtml(r.to ?? '')}`;
        case 'swap': {
            const when = r.starts_at
                ? `${fmtDay(r.starts_at, lang)} · ${r.all_day ? c.allDay : `${fmtTime(r.starts_at, lang)}–${fmtTime(r.ends_at ?? r.starts_at, lang)}`}`
                : '';
            return `<b>${c.reqKind.swap}</b> · ${who} → ${escapeHtml(r.taker || '—')}\n${escapeHtml([when, r.location].filter(Boolean).join(' · '))}`;
        }
        default: {
            const k = r.type === 'role' || r.type === 'complaint' ? r.type : 'other';
            const detail = k === 'role' ? r.role : k === 'complaint' ? null : r.subject;
            return `<b>${c.reqKind[k]}</b> · ${who}${detail ? `\n${escapeHtml(truncate(detail, 200))}` : ''}`;
        }
    }
}
