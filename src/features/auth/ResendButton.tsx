import { useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { isRateLimited, useCooldown } from './authFlows';

/**
 * --- RESEND BUTTON ---
 * One-tap "Resend email" with a cooldown (no spamming the inbox or Supabase's
 * rate limit) and a one-line result under it. `cooledDown` starts the timer
 * right away — for screens shown just after an email went out.
 */
export function ResendButton({
    onSend,
    cooldownKey,
    cooledDown = false,
    className = '',
}: {
    onSend: () => Promise<{ error: unknown }>;
    /** Shares the lock across remounts/pages, e.g. `signup:${email}`. */
    cooldownKey?: string;
    cooledDown?: boolean;
    className?: string;
}) {
    const t = useTranslation();
    const { left, start } = useCooldown(cooldownKey);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'sent' | 'error' | 'limited' | null>(null);
    const started = useRef(false);

    // An email just went out: lock once on mount (unless a shared lock already runs).
    const initialLeft = useRef(left);
    useEffect(() => {
        if (!cooledDown || started.current) return;
        started.current = true;
        if (initialLeft.current === 0) start();
    }, [cooledDown, start]);

    const send = async () => {
        setBusy(true);
        setStatus(null);
        const { error } = await onSend();
        setBusy(false);
        if (error) {
            console.error(error);
            setStatus(isRateLimited(error) ? 'limited' : 'error');
            if (isRateLimited(error)) start();
            return;
        }
        setStatus('sent');
        start();
    };

    const message =
        status === 'sent' ? t('auth.resent')
        : status === 'limited' ? t('auth.rateLimited')
        : status === 'error' ? t('auth.resendError')
        : null;

    return (
        <div className={`flex flex-col items-center gap-1 ${className}`}>
            <Button type="button" variant="tonal" size="sm" icon={ArrowClockwiseIcon} loading={busy} disabled={left > 0} onClick={send}>
                {left > 0 ? t('auth.resendIn', { s: left }) : t('auth.resend')}
            </Button>
            {message && (
                <p
                    role="status"
                    className={`text-caption ${status === 'sent' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}
                >
                    {message}
                </p>
            )}
        </div>
    );
}
