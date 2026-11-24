import type { TranslationKey } from '@shared/i18n/translations';

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** invite-employee's own codes (supabase/functions/_shared/invite.ts). */
const OWN_CODES = ['NOT_ALLOWED', 'EMAIL_INVALID', 'ORG_REQUIRED', 'UNKNOWN_ROLE', 'UNKNOWN_ORG', 'ROLE_TOO_HIGH', 'INVITE_FAILED'] as const;
/** Supabase Auth codes passed through from inviteUserByEmail. */
const AUTH_CODES: Record<string, TranslationKey> = {
    email_exists: 'admin.inviteErr.EMAIL_EXISTS',
    user_already_exists: 'admin.inviteErr.EMAIL_EXISTS',
    email_address_invalid: 'admin.inviteErr.EMAIL_INVALID',
    over_email_send_rate_limit: 'admin.inviteErr.RATE_LIMIT',
    over_request_rate_limit: 'admin.inviteErr.RATE_LIMIT',
};

/**
 * An invite-employee error in the UI language, by its `code` (and `limit`);
 * otherwise the server's message, otherwise `fallback`.
 */
export function inviteErrorMessage(err: unknown, t: T, fallback: string): string {
    const { code, limit, message } = (err ?? {}) as { code?: unknown; limit?: unknown; message?: unknown };
    if (code === 'PLAN_LIMIT_MEMBERS') return t('admin.inviteErr.PLAN_LIMIT_MEMBERS', { max: typeof limit === 'number' ? limit : 5 });
    if (typeof code === 'string') {
        if ((OWN_CODES as readonly string[]).includes(code)) return t(`admin.inviteErr.${code}` as TranslationKey);
        if (AUTH_CODES[code]) return t(AUTH_CODES[code]);
    }
    return typeof message === 'string' && message ? message : fallback;
}
