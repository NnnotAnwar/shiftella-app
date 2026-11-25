import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invoke = vi.fn();
const setSession = vi.fn();
vi.mock('@shared/api/supabaseClient', () => ({
    supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { setSession: (...a: unknown[]) => setSession(...a) } },
}));
vi.mock('@shared/preferences/PreferencesContext', () => ({
    useTranslation: () => (k: string, vars?: Record<string, string | number>) => (vars ? `${k} ${JSON.stringify(vars)}` : k),
}));

import {
    RESEND_COOLDOWN_S,
    carryEmail,
    emailFromState,
    isEmailNotConfirmed,
    isRateLimited,
    isValidEmail,
    resetCooldowns,
    useCooldown,
    cooldownLeft,
    forgetCooldownsInMemory,
} from './authFlows';
import { authService } from './authService';
import { ResendButton } from './ResendButton';

describe('isEmailNotConfirmed', () => {
    it('detects the Supabase error code', () => {
        expect(isEmailNotConfirmed({ code: 'email_not_confirmed', message: 'x' })).toBe(true);
    });
    it('falls back to the message (older GoTrue)', () => {
        expect(isEmailNotConfirmed({ message: 'Email not confirmed' })).toBe(true);
    });
    it('is false for wrong credentials and junk', () => {
        expect(isEmailNotConfirmed({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(false);
        expect(isEmailNotConfirmed(new Error('Invalid username or password.'))).toBe(false);
        expect(isEmailNotConfirmed(null)).toBe(false);
        expect(isEmailNotConfirmed('email_not_confirmed')).toBe(false);
    });
});

describe('isRateLimited', () => {
    it('recognises 429, the code and the message', () => {
        expect(isRateLimited({ status: 429 })).toBe(true);
        expect(isRateLimited({ code: 'over_email_send_rate_limit' })).toBe(true);
        expect(isRateLimited({ message: 'For security purposes, you can only request this after 42 seconds.' })).toBe(true);
        expect(isRateLimited({ status: 400, message: 'nope' })).toBe(false);
    });
});

describe('signInWithUsername error mapping', () => {
    beforeEach(() => {
        invoke.mockReset();
        setSession.mockReset();
    });

    it('tags an unconfirmed email reported by the username-login function', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: { context: { json: async () => ({ error: 'Invalid username or password.', code: 'email_not_confirmed' }) } },
        });
        const err = await authService.signInWithUsername('anna', 'secret123').catch((e) => e);
        expect(isEmailNotConfirmed(err)).toBe(true);
        expect(setSession).not.toHaveBeenCalled();
    });

    it('keeps wrong credentials generic', async () => {
        invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: 'Invalid username or password.' }) } } });
        const err = await authService.signInWithUsername('anna', 'bad').catch((e) => e);
        expect(err).toBeInstanceOf(Error);
        expect(isEmailNotConfirmed(err)).toBe(false);
    });

    it('reports the sign-in lock as rate limited, not as a wrong password', async () => {
        invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: 'Too many sign-in attempts.', code: 'too_many_attempts' }) } } });
        const err = await authService.signInWithUsername('anna', 'bad').catch((e) => e);
        expect(isRateLimited(err)).toBe(true);
        expect(isEmailNotConfirmed(err)).toBe(false);
    });

    it('survives an unreadable error body', async () => {
        invoke.mockResolvedValue({ data: null, error: { context: { json: async () => { throw new Error('not json'); } } } });
        const err = await authService.signInWithUsername('anna', 'bad').catch((e) => e);
        expect(isEmailNotConfirmed(err)).toBe(false);
    });

    it('adopts the session on success', async () => {
        invoke.mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r' }, error: null });
        setSession.mockResolvedValue({ error: null });
        await authService.signInWithUsername('anna', 'good');
        expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    });
});

describe('isValidEmail', () => {
    it.each(['anna@firma.cz', ' anna.novak+shifts@sub.example.com ', 'a@b.io'])('accepts %s', (v) => {
        expect(isValidEmail(v)).toBe(true);
    });
    it.each(['', 'anna', 'anna@', 'anna@firma', 'anna@firma.c', 'an na@firma.cz', '@firma.cz', 'a@@b.cz'])('rejects %j', (v) => {
        expect(isValidEmail(v)).toBe(false);
    });
});

describe('email carry-over', () => {
    it('reads an email from router state only', () => {
        expect(emailFromState({ email: 'a@b.cz' })).toBe('a@b.cz');
        expect(emailFromState(null)).toBe('');
        expect(emailFromState({ email: 42 })).toBe('');
    });
    it('carries emails, not usernames', () => {
        expect(carryEmail(' a@b.cz ')).toEqual({ email: 'a@b.cz' });
        expect(carryEmail('anna')).toBeUndefined();
    });
});

/** Advance second by second, letting React re-schedule its 1 s tick in between. */
function tick(seconds: number) {
    for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

describe('resend cooldown', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        // Newer Node ships its own (disabled) global localStorage that shadows
        // jsdom's; give the tests a plain in-memory one either way.
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        });
        resetCooldowns();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('counts down from the cooldown to 0', () => {
        const { result } = renderHook(() => useCooldown());
        expect(result.current.left).toBe(0);
        act(() => result.current.start());
        expect(result.current.left).toBe(RESEND_COOLDOWN_S);
        tick(20);
        expect(result.current.left).toBe(RESEND_COOLDOWN_S - 20);
        tick(RESEND_COOLDOWN_S);
        expect(result.current.left).toBe(0);
    });

    it('a keyed lock survives an unmount (re-submitting the form)', () => {
        const first = renderHook(() => useCooldown('signup:a@b.cz'));
        act(() => first.result.current.start());
        first.unmount();
        act(() => vi.advanceTimersByTime(10_000));
        const second = renderHook(() => useCooldown('signup:a@b.cz'));
        expect(second.result.current.left).toBe(RESEND_COOLDOWN_S - 10);
        const other = renderHook(() => useCooldown('signup:c@d.cz'));
        expect(other.result.current.left).toBe(0);
    });

    // Cooldowns live at module level (they survive re-renders and page changes):
    // give each test its own key so one test's lock can't leak into the next.
    it('<ResendButton> sends once, then locks until the cooldown ends', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onSend = vi.fn(async () => ({ error: null }));
        render(<ResendButton cooldownKey="t:sends-once" onSend={onSend} />);
        const btn = screen.getByRole('button', { name: /auth.resend/ });
        await user.click(btn);
        expect(onSend).toHaveBeenCalledOnce();
        expect(screen.getByRole('button')).toBeDisabled();
        expect(screen.getByRole('button')).toHaveTextContent('auth.resendIn');
        expect(screen.getByText('auth.resent')).toBeInTheDocument();
        await user.click(screen.getByRole('button'));
        expect(onSend).toHaveBeenCalledOnce();
        tick(RESEND_COOLDOWN_S);
        expect(screen.getByRole('button')).toBeEnabled();
    });

    it('a keyed lock survives a page reload (localStorage), without storing the email', () => {
        const first = renderHook(() => useCooldown('reset:anna@firma.cz'));
        act(() => first.result.current.start());
        first.unmount();
        forgetCooldownsInMemory();
        expect(cooldownLeft('reset:anna@firma.cz')).toBe(RESEND_COOLDOWN_S);
        const again = renderHook(() => useCooldown('reset:anna@firma.cz'));
        expect(again.result.current.left).toBe(RESEND_COOLDOWN_S);
        expect(localStorage.getItem('auth-cooldowns')).not.toContain('anna');
        tick(RESEND_COOLDOWN_S);
        expect(cooldownLeft('reset:anna@firma.cz')).toBe(0);
    });

    it('<ResendButton cooledDown> starts locked (an email just went out)', () => {
        render(<ResendButton cooledDown cooldownKey="t:cooled-down" onSend={vi.fn(async () => ({ error: null }))} />);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('<ResendButton> shows the rate-limit message and locks', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<ResendButton cooldownKey="t:rate-limited" onSend={vi.fn(async () => ({ error: { status: 429, message: 'rate limit' } }))} />);
        await user.click(screen.getByRole('button'));
        // The handler is async (await onSend → setState): wait for the message.
        expect(await screen.findByText('auth.rateLimited')).toBeInTheDocument();
        expect(screen.getByRole('button')).toBeDisabled();
    });
});
