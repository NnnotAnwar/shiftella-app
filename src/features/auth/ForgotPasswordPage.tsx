import { useState, type SyntheticEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeftIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { authService } from './authService';
import { AuthShell } from './AuthShell';
import { ResendButton } from './ResendButton';
import { emailFromState, isValidEmail } from './authFlows';

/**
 * --- FORGOT PASSWORD ---
 * Asks for the account email and sends a reset link (to /reset-password).
 * The answer is always the same neutral "if an account exists…" so the form
 * can't be used to find out which emails have accounts. Reset is email-only —
 * username sign-in users enter the email their account belongs to.
 */
export function ForgotPasswordPage() {
    const t = useTranslation();
    const location = useLocation();
    const [email, setEmail] = useState(() => emailFromState(location.state));
    const [touched, setTouched] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sentTo, setSentTo] = useState<string | null>(null);

    const invalid = touched && !isValidEmail(email);
    const send = (address: string) => authService.requestPasswordReset(address);

    const submit = async (e: SyntheticEvent) => {
        e.preventDefault();
        if (!isValidEmail(email)) {
            setTouched(true);
            return;
        }
        setBusy(true);
        const address = email.trim();
        // Neutral on purpose: errors (unknown email, rate limit) are only logged.
        const { error } = await send(address);
        if (error) console.error(error);
        setBusy(false);
        setSentTo(address);
    };

    const backToLogin = (
        <p className="mt-4 text-center text-meta">
            <Link
                to="/login"
                state={{ email: sentTo ?? email.trim() }}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
            >
                <ArrowLeftIcon weight="bold" className="size-3.5" />
                {t('signup.backToLogin')}
            </Link>
        </p>
    );

    if (sentTo) {
        return (
            <AuthShell title={t('auth.forgot.sentTitle')} eyebrow={t('auth.portal')} below={backToLogin}>
                <div className="space-y-4 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                        <PaperPlaneTiltIcon weight="duotone" className="size-6" />
                    </div>
                    <p className="text-body text-ink dark:text-slate-200">{t('auth.forgot.sentBody', { email: sentTo })}</p>
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('auth.forgot.sentHint')}</p>
                    <ResendButton cooledDown cooldownKey={`reset:${sentTo.toLowerCase()}`} onSend={() => send(sentTo)} />
                    <button
                        type="button"
                        onClick={() => setSentTo(null)}
                        className="inline-flex items-center gap-1 text-meta font-semibold text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white"
                    >
                        {t('auth.differentEmail')}
                    </button>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell title={t('auth.forgot.title')} eyebrow={t('auth.portal')} below={backToLogin}>
            <p className="-mt-2 mb-4 text-center text-meta text-ink-soft dark:text-slate-400">{t('auth.forgot.lead')}</p>
            <form className="space-y-3" onSubmit={submit} noValidate>
                <div>
                    <label htmlFor="reset-email" className="text-eyebrow text-ink-soft dark:text-slate-400 ml-1">
                        {t('signup.email')}
                    </label>
                    <div className="mt-1.5">
                        <Input
                            id="reset-email"
                            icon={EnvelopeSimpleIcon}
                            type="email"
                            required
                            autoFocus={!email}
                            autoComplete="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setTouched(email.trim() !== '')}
                            invalid={invalid}
                            aria-invalid={invalid || undefined}
                            aria-describedby={invalid ? 'reset-email-error reset-email-hint' : 'reset-email-hint'}
                            placeholder="you@example.com"
                        />
                    </div>
                    {invalid && (
                        <p id="reset-email-error" className="mt-1 px-1 text-caption text-red-600 dark:text-red-400">
                            {t('auth.emailInvalid')}
                        </p>
                    )}
                    <p id="reset-email-hint" className="mt-1.5 px-1 text-caption text-ink-soft dark:text-slate-400">
                        {t('auth.forgot.usernameHint')}
                    </p>
                </div>
                <Button type="submit" size="lg" fullWidth loading={busy}>
                    {busy ? t('auth.forgot.sending') : t('auth.forgot.submit')}
                </Button>
            </form>
        </AuthShell>
    );
}
