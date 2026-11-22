import { useCallback, useEffect, useState } from 'react';

/**
 * --- AUTH FLOW HELPERS ---
 * Small, framework-light pieces shared by the signed-out pages (sign in,
 * sign up, forgot / reset password) and kept here so they're unit-testable.
 */

/** Minimum password length for new passwords (sign-up, reset). */
export const MIN_PASSWORD = 8;

/** Seconds a "Resend email" button stays locked after a send. */
export const RESEND_COOLDOWN_S = 60;

/**
 * Pragmatic email check for inline validation: something@something.tld, no
 * spaces. The server stays the real authority — this only catches typos early.
 */
export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Error code Supabase Auth (and our username-login function) use for an unconfirmed email. */
export const EMAIL_NOT_CONFIRMED = 'email_not_confirmed';

/**
 * True when a sign-in failed only because the email isn't confirmed yet.
 * Supabase returns this AFTER verifying the password, so showing a specific
 * message doesn't reveal whether an account exists to someone without it.
 */
export function isEmailNotConfirmed(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (code === EMAIL_NOT_CONFIRMED) return true;
    return typeof message === 'string' && message.toLowerCase().includes('email not confirmed');
}

/** True when Supabase refused to send an email because of its rate limit. */
export function isRateLimited(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const { code, status, message } = error as { code?: unknown; status?: unknown; message?: unknown };
    if (status === 429) return true;
    if (typeof code === 'string' && code.includes('rate_limit')) return true;
    return typeof message === 'string' && /rate limit|security purposes/i.test(message);
}

/** Reads a carried-over email from router state (never from the URL — no PII in links). */
export function emailFromState(state: unknown): string {
    if (state && typeof state === 'object' && 'email' in state) {
        const v = (state as { email?: unknown }).email;
        if (typeof v === 'string') return v;
    }
    return '';
}

/** Only carry an email forward — a username typed into "email or username" stays put. */
export function carryEmail(value: string): { email: string } | undefined {
    const v = value.trim();
    return v.includes('@') ? { email: v } : undefined;
}

/**
 * Cooldown end times by key (e.g. "signup:me@x.cz"), kept at module level so a
 * lock survives the button unmounting — re-submitting the form or hopping
 * between sign-up and sign-in doesn't hand out a fresh "Resend".
 */
const cooldowns = new Map<string, number>();

/** Test helper: forget every running cooldown. */
export function resetCooldowns() {
    cooldowns.clear();
}

/**
 * A countdown for "Resend" buttons: `start()` locks for `seconds`, `left`
 * counts down to 0 (0 = ready). With a `key`, the lock is shared by every
 * button using the same key until it runs out (the key is read on mount).
 */
export function useCooldown(key?: string, seconds = RESEND_COOLDOWN_S) {
    const [until, setUntil] = useState(() => (key ? cooldowns.get(key) ?? 0 : 0));
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (until <= now) return;
        const id = setTimeout(() => setNow(Date.now()), Math.min(1000, until - now));
        return () => clearTimeout(id);
    }, [until, now]);

    const start = useCallback(() => {
        const t = Date.now();
        const end = t + seconds * 1000;
        if (key) cooldowns.set(key, end);
        setNow(t);
        setUntil(end);
    }, [key, seconds]);

    const left = Math.max(0, Math.ceil((until - now) / 1000));
    return { left, start };
}

/** Caps Lock state from a keyboard event (false where the browser can't tell). */
export function capsLockFrom(e: { getModifierState?: (key: 'CapsLock') => boolean }): boolean {
    return typeof e.getModifierState === 'function' ? e.getModifierState('CapsLock') : false;
}
