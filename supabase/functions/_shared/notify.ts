// =============================================================================
// SHARED: notification events → localized messages (push + Telegram)
// -----------------------------------------------------------------------------
// Moved out of send-push unchanged so the Telegram sender renders exactly the
// same events and copy. `messagesFromWebhook` maps a Database Webhook row
// (shift_audit_log / name_change_requests / announcements) to recipients;
// `render` localizes one message for a recipient's language.
// =============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pragueDate, pragueMidnight } from './prague.ts';

export type PrefCategory = 'shifts' | 'account' | 'requests';
export type Lang = 'en' | 'cs';

/**
 * A notification to deliver. `key` + `vars` are localized per recipient at send
 * time (the recipient's language lives on their notification_preferences row).
 * Direct invocations may instead pass a ready `title`/`body`.
 */
export interface PushMessage {
    userId: string;
    route?: string;
    category?: PrefCategory;
    // Localized form:
    key?: string;
    vars?: Record<string, string | number | undefined>;
    // Pre-rendered form (direct `{ userId, title, body }` invocations):
    title?: string;
    body?: string;
    // Telegram only (FCM ignores these):
    /** A new announcement, untruncated — Telegram's "announcements" switch gates it. */
    announcement?: { title: string; body: string };
    /** Offer "Confirm" for the recipient's published shifts starting in [from, to) (ISO). */
    confirm?: { from: string; to: string };
}

// --- Push string localization (mirrors the client's notif.* keys) -------------

/** Czech plural pick: (1) one, (2–4) few, (else) many. */
function csPlural(n: number, one: string, few: string, many: string): string {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

/** Localized "N shifts". */
function shiftsCount(n: number, lang: Lang): string {
    return lang === 'cs' ? `${n} ${csPlural(n, 'směna', 'směny', 'směn')}` : `${n} shift${n === 1 ? '' : 's'}`;
}

const KIND_ACC: Record<Lang, Record<string, string>> = {
    en: { vacation: 'vacation', sick: 'sick leave', other: 'leave' },
    cs: { vacation: 'dovolenou', sick: 'nemocenskou', other: 'volno' },
};
const KIND_NOM: Record<Lang, Record<string, string>> = {
    en: { vacation: 'vacation', sick: 'sick leave', other: 'leave' },
    cs: { vacation: 'dovolená', sick: 'nemocenská', other: 'volno' },
};

/** "8:00" / "08:00" — a time of day in Prague (the app's business time zone). */
export function pragueClock(iso: string, lang: Lang): string {
    try {
        return new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
            timeZone: 'Europe/Prague',
            hour: lang === 'cs' ? 'numeric' : '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(new Date(iso));
    } catch {
        return '';
    }
}

/** The morning digest's body: "5 shifts · 4 people · 1 open shift · 2 requests waiting". */
export function digestBody(v: { shifts?: number; people?: number; open?: number; requests?: number }, lang: Lang): string {
    const cs = lang === 'cs';
    const n = (k: unknown) => Math.max(0, Number(k) || 0);
    const parts: string[] = [];
    const shifts = n(v.shifts);
    const people = n(v.people);
    const open = n(v.open);
    const req = n(v.requests);
    if (shifts > 0) {
        parts.push(shiftsCount(shifts, lang));
        parts.push(cs ? `${people} ${csPlural(people, 'člověk', 'lidé', 'lidí')}` : `${people} ${people === 1 ? 'person' : 'people'}`);
    } else {
        parts.push(cs ? 'dnes žádné směny' : 'no shifts today');
    }
    if (open > 0) parts.push(cs ? `${open} ${csPlural(open, 'volná směna', 'volné směny', 'volných směn')}` : `${open} open shift${open === 1 ? '' : 's'}`);
    if (req > 0) parts.push(cs ? `${req} ${csPlural(req, 'žádost čeká', 'žádosti čekají', 'žádostí čeká')}` : `${req} request${req === 1 ? '' : 's'} waiting`);
    return parts.join(' · ');
}

/** Render a notification's title + body for a recipient's language. */
export function render(msg: PushMessage, lang: Lang): { title: string; body: string } {
    if (msg.title !== undefined || msg.body !== undefined) {
        return { title: msg.title ?? '', body: msg.body ?? '' };
    }
    const v = msg.vars ?? {};
    const cs = lang === 'cs';
    const actor = String(v.actor ?? (cs ? 'Někdo' : 'Someone'));
    const who = String(v.who ?? (cs ? 'Člen týmu' : 'A team member'));
    const loc = v.loc ? String(v.loc) : '';
    const atLoc = loc ? (cs ? ` v ${loc}` : ` at ${loc}`) : '';
    const n = Number(v.count ?? 1);
    const kind = String(v.kind ?? 'other');
    const range = String(v.range ?? '');

    switch (msg.key) {
        case 'create':
            return cs
                ? { title: 'Nová směna', body: `${actor} vám přidal(a) směnu${v.when ? `: ${v.when}` : ' do rozpisu'}.` }
                : { title: 'New shift', body: `${actor} added a shift${v.when ? `: ${v.when}` : ' to your schedule'}.` };
        case 'update':
            return cs
                ? { title: 'Změna směny', body: `${actor} upravil(a) vaši směnu${v.when ? `: ${v.when}` : ''}.` }
                : { title: 'Shift changed', body: `${actor} updated your shift${v.when ? `: ${v.when}` : ''}.` };
        case 'delete':
            return cs
                ? { title: 'Směna odebrána', body: `${actor} odebral(a) vaši směnu${v.when ? `: ${v.when}` : ''}.` }
                : { title: 'Shift removed', body: `${actor} removed your shift${v.when ? `: ${v.when}` : ''}.` };
        case 'name_request_approved':
            return cs
                ? { title: 'Změna jména schválena', body: 'Vaše žádost o změnu jména byla schválena.' }
                : { title: 'Name change approved', body: 'Your name change request was approved.' };
        case 'name_request_rejected':
            return cs
                ? { title: 'Změna jména zamítnuta', body: 'Vaše žádost o změnu jména byla zamítnuta.' }
                : { title: 'Name change declined', body: 'Your name change request was declined.' };
        case 'late': {
            const mins = v.bucket === '60' ? (cs ? '1+ hodinu' : '1+ hour') : (cs ? '15+ min' : '15+ min');
            return cs
                ? { title: 'Směna nezahájena', body: `${who} se nepřihlásil(a)${atLoc} — ${mins} zpoždění.` }
                : { title: 'Shift not started', body: `${who} hasn't clocked in${atLoc} — ${mins} late.` };
        }
        case 'shift_reminder': {
            const at = v.start ? pragueClock(String(v.start), lang) : '';
            return cs
                ? { title: 'Směna za hodinu', body: `Vaše směna začíná${at ? ` v ${at}` : ' brzy'}${loc ? ` · ${loc}` : ''}.` }
                : { title: 'Shift in an hour', body: `Your shift starts${at ? ` at ${at}` : ' soon'}${loc ? ` · ${loc}` : ''}.` };
        }
        case 'daily_digest':
            return {
                title: cs ? 'Dnešní přehled' : 'Today at a glance',
                body: digestBody({ shifts: Number(v.shifts), people: Number(v.people), open: Number(v.open), requests: Number(v.requests) }, lang),
            };
        case 'schedule_published':
            return cs
                ? { title: 'Rozpis zveřejněn', body: `${actor} zveřejnil(a) váš rozpis — ${shiftsCount(n, 'cs')}.` }
                : { title: 'Schedule published', body: `${actor} published your schedule — ${shiftsCount(n, 'en')}.` };
        case 'schedule_updated': {
            const what = cs ? (n === 1 ? 'jednu vaši směnu' : `${n} vašich směn`) : (n === 1 ? 'a shift of yours' : `${n} of your shifts`);
            return cs
                ? { title: 'Změna rozpisu', body: `${actor} změnil(a) ${what}${atLoc}.` }
                : { title: 'Schedule changed', body: `${actor} changed ${what}${atLoc}.` };
        }
        case 'schedule_removed': {
            const what = cs ? (n === 1 ? 'jednu vaši směnu' : `${n} vašich směn`) : (n === 1 ? 'a shift of yours' : `${n} of your shifts`);
            return cs
                ? { title: 'Směny odebrány', body: `${actor} odebral(a) ${what}${atLoc}.` }
                : { title: 'Shifts removed', body: `${actor} removed ${what}${atLoc}.` };
        }
        case 'timeoff_requested':
            return cs
                ? { title: 'Žádost o volno', body: `${who} žádá o ${KIND_ACC.cs[kind]}: ${range}.` }
                : { title: 'Time-off request', body: `${who} requested ${KIND_ACC.en[kind]}: ${range}.` };
        case 'timeoff_approved':
            return cs
                ? { title: 'Volno schváleno', body: `Vaše ${KIND_NOM.cs[kind]} (${range}) byla schválena.` }
                : { title: 'Time off approved', body: `Your ${KIND_NOM.en[kind]} (${range}) was approved.` };
        case 'timeoff_declined':
            return cs
                ? { title: 'Volno zamítnuto', body: `Vaše ${KIND_NOM.cs[kind]} (${range}) byla zamítnuta.` }
                : { title: 'Time off declined', body: `Your ${KIND_NOM.en[kind]} (${range}) was declined.` };
        case 'profile_updated': {
            const fields = String(v.fields ?? (cs ? 'profil' : 'profile'));
            return cs
                ? { title: 'Profil upraven', body: `${actor} upravil(a) váš ${fields}.` }
                : { title: 'Profile updated', body: `${actor} updated your ${fields}.` };
        }
        case 'swap_taken':
            return cs
                ? { title: 'Někdo bere vaši směnu', body: `${v.taker || 'Kolega'} bere vaši směnu${v.when ? ` (${v.when})` : ''}. Čeká na schválení.` }
                : { title: 'Your shift was taken', body: `${v.taker || 'A colleague'} took your shift${v.when ? ` (${v.when})` : ''}. Waiting for approval.` };
        case 'swap_requested':
            return cs
                ? { title: 'Výměna ke schválení', body: `${v.from || '—'} → ${v.taker || '—'}${v.when ? ` · ${v.when}` : ''}` }
                : { title: 'Swap to approve', body: `${v.from || '—'} → ${v.taker || '—'}${v.when ? ` · ${v.when}` : ''}` };
        case 'swap_approved':
            return cs
                ? { title: 'Výměna schválena', body: `Výměna směny${v.when ? ` (${v.when})` : ''} byla schválena.` }
                : { title: 'Swap approved', body: `The shift swap${v.when ? ` (${v.when})` : ''} was approved.` };
        case 'swap_declined':
            return cs
                ? { title: 'Výměna zamítnuta', body: `Výměna směny${v.when ? ` (${v.when})` : ''} byla zamítnuta.` }
                : { title: 'Swap declined', body: `The shift swap${v.when ? ` (${v.when})` : ''} was declined.` };
        case 'request_submitted': {
            // Complaints never put their text on a lock screen.
            if (v.kind === 'complaint')
                return cs
                    ? { title: 'Nová stížnost', body: v.anonymous ? 'Byla podána anonymní stížnost.' : `${who} podal(a) stížnost.` }
                    : { title: 'New complaint', body: v.anonymous ? 'An anonymous complaint was filed.' : `${who} filed a complaint.` };
            if (v.kind === 'role')
                return cs
                    ? { title: 'Žádost o roli', body: `${who} žádá o roli ${v.role || '—'}.` }
                    : { title: 'Role request', body: `${who} asks for the ${v.role || '—'} role.` };
            return cs
                ? { title: 'Nová žádost', body: `${who}: ${v.subject || 'žádost'}` }
                : { title: 'New request', body: `${who}: ${v.subject || 'request'}` };
        }
        case 'request_approved':
        case 'request_declined': {
            const ok = msg.key === 'request_approved';
            const what = v.kind === 'role' ? (v.role ? (cs ? `o roli ${v.role}` : `for the ${v.role} role`) : '') : String(v.subject || '');
            return cs
                ? { title: ok ? 'Žádost schválena' : 'Žádost zamítnuta', body: `Vaše žádost${what ? ` ${v.kind === 'role' ? what : `„${what}“`}` : ''} byla ${ok ? 'schválena' : 'zamítnuta'}.` }
                : { title: ok ? 'Request approved' : 'Request declined', body: `Your request${what ? ` ${v.kind === 'role' ? what : `“${what}”`}` : ''} was ${ok ? 'approved' : 'declined'}.` };
        }
        case 'name_request_new':
            return cs
                ? { title: 'Nová žádost o změnu jména', body: 'Člen týmu požádal o změnu jména.' }
                : { title: 'New name-change request', body: 'A team member requested a name change.' };
        default:
            return { title: '', body: '' };
    }
}
// --- Map DB events -> push messages -------------------------------------------

function displayName(rec: Record<string, unknown>, details: Record<string, unknown> | undefined): string {
    return (details?.actor_name as string) || (rec.actor_name as string) || 'Someone';
}

/** Prague midnight one calendar month after the Prague day of `iso` (a month start → the next one). */
function nextMonthIso(iso: string): string | null {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const { y, m, d: day } = pragueDate(d);
    return pragueMidnight(y, m + 1, day).toISOString();
}

/** Telegram's "Confirm" window for a schedule notification (null = no button). */
export function confirmWindow(action: string, details: Record<string, unknown>): { from: string; to: string } | null {
    if (action === 'schedule_published' && typeof details.month_start === 'string') {
        const to = nextMonthIso(details.month_start);
        return to ? { from: new Date(details.month_start).toISOString(), to } : null;
    }
    if (action === 'schedule_updated' && typeof details.scheduled_start === 'string') {
        const from = new Date(details.scheduled_start);
        if (Number.isNaN(from.getTime())) return null;
        return { from: from.toISOString(), to: new Date(from.getTime() + 31 * 86_400_000).toISOString() };
    }
    return null;
}

export async function messagesFromWebhook(admin: SupabaseClient, table: string, record: Record<string, unknown>): Promise<PushMessage[]> {
    // New announcement → notify every member of the org except the author.
    if (table === 'announcements') {
        const orgId = record.organization_id as string;
        const authorId = (record.author_id as string | null) ?? null;
        const titleText = (record.title as string) || 'Announcement';
        const bodyText = (record.body as string) || '';
        const shortBody = bodyText.length > 140 ? `${bodyText.slice(0, 139)}…` : bodyText;

        // Only the announcement's audience (its location's roster / its role / everyone).
        let ids: string[] = [];
        const { data: audience, error: audienceErr } = await admin.rpc('announcement_audience_ids', { p_id: record.id });
        if (!audienceErr) {
            ids = ((audience ?? []) as (string | { announcement_audience_ids?: string })[]).map((r) =>
                typeof r === 'string' ? r : String(r.announcement_audience_ids ?? ''),
            );
        } else if (!record.location_id && !record.org_role_id) {
            // Audience function unavailable: a whole-organization notice can still go to everyone.
            const { data: members } = await admin.from('profiles').select('id').eq('organization_id', orgId);
            ids = (members ?? []).map((m: { id: string }) => m.id);
        }

        return ids
            .filter((id) => id && id !== authorId)
            .map((id) => ({
                userId: id,
                // User-authored content — passed pre-rendered (no localization).
                title: `📣 ${titleText}`,
                body: shortBody,
                route: '/announcements',
                // No category: gated only by the recipient's push_enabled toggle.
                announcement: { title: (record.title as string) || '', body: bodyText },
            }));
    }

    if (table === 'shift_audit_log') {
        const target = record.target_user_id as string | null;
        const action = record.action as string;
        const details = (record.details as Record<string, unknown>) ?? {};
        const actor = displayName(record, details);
        if (!target) return [];

        // Date part of a shift snapshot ("5 Jul"); the location is passed
        // separately so the render layer can localize the "at"/"v" joiner.
        const shiftDate = (snap: Record<string, unknown> | undefined | null): string => {
            if (snap && typeof snap.started_at === 'string') {
                try {
                    return new Date(snap.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                } catch { /* ignore */ }
            }
            return '';
        };
        const whenOf = (snap: Record<string, unknown> | undefined | null): string => {
            const d = shiftDate(snap);
            const loc = snap && typeof snap.location_name === 'string' ? snap.location_name : '';
            return [d, loc && `· ${loc}`].filter(Boolean).join(' ');
        };
        const nu = details.new as Record<string, unknown> | undefined;
        const ol = details.old as Record<string, unknown> | undefined;
        const dateRange = (): string =>
            details.starts_on === details.ends_on ? String(details.starts_on ?? '') : `${details.starts_on}–${details.ends_on}`;

        switch (action) {
            case 'create':
                return [{ userId: target, key: 'create', vars: { actor, when: whenOf(nu) }, route: '/overview', category: 'shifts' }];
            case 'update':
                return [{ userId: target, key: 'update', vars: { actor, when: whenOf(nu) }, route: '/overview', category: 'shifts' }];
            case 'delete':
                return [{ userId: target, key: 'delete', vars: { actor, when: whenOf(ol) }, route: '/overview', category: 'shifts' }];
            case 'name_request_approved':
                return [{ userId: target, key: 'name_request_approved', route: '/profile', category: 'account' }];
            case 'name_request_rejected':
                return [{ userId: target, key: 'name_request_rejected', route: '/profile', category: 'account' }];
            case 'late_15':
            case 'late_60':
                // Sent to BOTH the late member and their manager; neutral copy works for either.
                return [{
                    userId: target,
                    key: 'late',
                    vars: { who: (details.target_name as string) || '', loc: (details.location_name as string) || '', bucket: action === 'late_60' ? '60' : '15' },
                    route: '/?openNotifications=1',
                    category: 'shifts',
                }];
            case 'shift_reminder':
                return [{
                    userId: target,
                    key: 'shift_reminder',
                    vars: { start: (details.scheduled_start as string) || '', loc: (details.location_name as string) || '' },
                    route: '/',
                    category: 'shifts',
                }];
            case 'daily_digest':
                return [{
                    userId: target,
                    key: 'daily_digest',
                    vars: {
                        shifts: Number(details.shifts ?? 0),
                        people: Number(details.people ?? 0),
                        open: Number(details.open ?? 0),
                        requests: Number(details.requests ?? 0),
                    },
                    route: '/',
                    category: 'shifts',
                }];
            case 'schedule_published':
                return [{
                    userId: target,
                    key: 'schedule_published',
                    vars: { actor, count: (details.count as number) || 0 },
                    route: '/schedule',
                    category: 'shifts',
                    confirm: confirmWindow(action, details) ?? undefined,
                }];
            case 'schedule_updated':
            case 'schedule_removed':
                return [{
                    userId: target,
                    key: action,
                    vars: { actor, count: (details.count as number) || 1, loc: (details.location_name as string) || '' },
                    route: '/schedule',
                    category: 'shifts',
                    confirm: confirmWindow(action, details) ?? undefined,
                }];
            case 'timeoff_requested':
                return [{
                    userId: target,
                    key: 'timeoff_requested',
                    vars: { who: (details.target_name as string) || '', kind: (details.kind as string) || 'other', range: dateRange() },
                    route: '/requests',
                    category: 'requests',
                }];
            case 'timeoff_approved':
            case 'timeoff_declined':
                return [{
                    userId: target,
                    key: action,
                    vars: { kind: (details.kind as string) || 'other', range: dateRange() },
                    route: '/requests',
                    category: 'requests',
                }];
            case 'swap_taken':
            case 'swap_requested':
            case 'swap_approved':
            case 'swap_declined': {
                let when = '';
                if (typeof details.scheduled_start === 'string') {
                    try {
                        when = new Date(details.scheduled_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    } catch { /* ignore */ }
                }
                if (typeof details.location_name === 'string' && details.location_name) when = [when, details.location_name].filter(Boolean).join(' · ');
                return [{
                    userId: target,
                    key: action,
                    vars: { from: (details.from_name as string) || '', taker: (details.taker_name as string) || '', when },
                    route: action === 'swap_taken' ? '/schedule' : '/requests',
                    category: 'requests',
                }];
            }
            case 'request_submitted':
            case 'request_approved':
            case 'request_declined':
                return [{
                    userId: target,
                    key: action,
                    vars: {
                        who: (details.target_name as string) || '',
                        kind: (details.kind as string) || 'other',
                        role: (details.role_name as string) || '',
                        subject: (details.subject_name as string) || '',
                        anonymous: details.anonymous ? 1 : 0,
                    },
                    route: '/requests',
                    category: 'requests',
                }];
            case 'profile_updated': {
                const changes = (details.changes as { field: string }[] | undefined) ?? [];
                // Regular users have no admin screen for this — open the app on the
                // in-app notifications feed (client reads ?openNotifications=1).
                return [{ userId: target, key: 'profile_updated', vars: { actor, fields: changes.map((c) => c.field).join(', ') }, route: '/?openNotifications=1', category: 'account' }];
            }
            default:
                return [];
        }
    }

    if (table === 'name_change_requests' && record.status === 'pending') {
        // Notify the org's admins/reviewers (rank >= 30), excluding the requester.
        const orgId = record.organization_id as string;
        const requester = record.user_id as string;
        const { data: admins } = await admin
            .from('profiles')
            .select('id, role:roles(rank)')
            .eq('organization_id', orgId);
        // (supabase-js infers the embed as an array; it's a to-one join at runtime.)
        const reviewers = ((admins ?? []) as unknown as { id: string; role: { rank?: number } | null }[])
            .filter((a) => (a.role?.rank ?? 0) >= 30 && a.id !== requester)
            .map((a: { id: string }) => a.id);
        return reviewers.map((id) => ({
            userId: id,
            key: 'name_request_new',
            route: '/requests',
            category: 'requests' as const,
        }));
    }

    return [];
}
