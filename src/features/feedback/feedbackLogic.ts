import type { TranslationKey } from '@shared/i18n/translations';

/**
 * --- IN-APP FEEDBACK: pure logic ---
 * Types, the context the app attaches to every message, and the small helpers
 * the dialog and the Superadmin inbox share. Mirrors the `app_feedback` table
 * (supabase/migrations/20261125190000_app_feedback.sql).
 */

export const FEEDBACK_KINDS = ['idea', 'bug', 'question', 'praise'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ['new', 'seen', 'done'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Same cap as the database CHECK. */
export const FEEDBACK_MAX_LENGTH = 4000;

export const KIND_LABEL: Record<FeedbackKind, TranslationKey> = {
    idea: 'feedback.kind.idea',
    bug: 'feedback.kind.bug',
    question: 'feedback.kind.question',
    praise: 'feedback.kind.praise',
};

export const STATUS_LABEL: Record<FeedbackStatus, TranslationKey> = {
    new: 'feedback.status.new',
    seen: 'feedback.status.seen',
    done: 'feedback.status.done',
};

/** What the app attaches to a message. The organization is added by the server. */
export interface FeedbackContext {
    route: string | null;
    app_version: string | null;
    language: string | null;
    user_agent: string | null;
}

/** A message ready to insert (the server fills user, organization and status). */
export interface FeedbackInput extends FeedbackContext {
    kind: FeedbackKind;
    message: string;
    may_contact: boolean;
}

/**
 * The context for a message. Only the path is kept: query strings and hashes
 * can carry tokens (password reset, invites) and never belong in a report.
 */
export function buildFeedbackContext(opts: {
    pathname?: string | null;
    language?: string | null;
    version?: string | null;
    userAgent?: string | null;
}): FeedbackContext {
    const clip = (v: string | null | undefined, max: number) => {
        const s = (v ?? '').trim();
        return s ? s.slice(0, max) : null;
    };
    const path = (opts.pathname ?? '').split(/[?#]/)[0];
    return {
        route: clip(path, 300),
        app_version: clip(opts.version, 40),
        language: clip(opts.language, 10),
        user_agent: clip(opts.userAgent, 400),
    };
}

/** Trimmed message, or null when there is nothing to send. */
export function cleanMessage(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    return s.slice(0, FEEDBACK_MAX_LENGTH);
}

/** The next status for the inbox's one-tap toggle: new → seen → done → new. */
export function nextStatus(s: FeedbackStatus): FeedbackStatus {
    return s === 'new' ? 'seen' : s === 'seen' ? 'done' : 'new';
}

/** A Supabase / Postgres error → the message to show. */
export function feedbackErrorKey(err: unknown): TranslationKey {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
    if (/feedback_rate_limited/.test(msg)) return 'feedback.rateLimited';
    return 'feedback.sendFailed';
}

/** "Chrome 131 · macOS" from a user-agent string — a short label for the inbox. */
export function shortUserAgent(ua: string | null | undefined): string {
    if (!ua) return '';
    // Order matters: Edge also says "Chrome", Chrome also says "Safari".
    const BROWSERS: [string, RegExp][] = [
        ['Edge', /Edg\/(\d+)/],
        ['Firefox', /Firefox\/(\d+)/],
        ['Chrome', /Chrome\/(\d+)/],
        ['Safari', /Version\/(\d+).*Safari/],
    ];
    let browser = '';
    for (const [name, re] of BROWSERS) {
        const m = re.exec(ua);
        if (m) {
            browser = `${name} ${m[1]}`;
            break;
        }
    }
    const os = /iPhone|iPad/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
        : /Mac OS X/.test(ua) ? 'macOS'
        : /Windows/.test(ua) ? 'Windows'
        : /Linux/.test(ua) ? 'Linux'
        : '';
    return [browser, os].filter(Boolean).join(' · ') || ua.slice(0, 40);
}
