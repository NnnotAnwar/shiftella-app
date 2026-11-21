import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { WarningCircleIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { FormError } from '@shared/components/FormError';
import { PageLoader } from '@shared/components/PageLoader';
import { supabase } from '@shared/api/supabaseClient';
import { authService } from './authService';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { MIN_PASSWORD } from './authFlows';

/**
 * --- RESET PASSWORD ---
 * Landing page of the reset email: `/reset-password?token_hash=…&type=recovery`.
 * Like /accept-invite it is outside the route guards (the recovery session
 * would otherwise bounce it to "/"): we redeem the one-time token with
 * verifyOtp, then let the user pick a new password and go into the app.
 */

type Status = 'loading' | 'ready' | 'invalid';

export function ResetPasswordPage() {
    const t = useTranslation();
    const [status, setStatus] = useState<Status>('loading');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get('token_hash');
        const type = params.get('type');

        async function bootstrap() {
            if (tokenHash && type === 'recovery') {
                const { data, error: otpError } = await authService.verifyRecoveryToken(tokenHash);
                if (!otpError && data.session) {
                    // Burn-once: drop the token so a reload can't re-submit it.
                    window.history.replaceState({}, '', '/reset-password');
                    setStatus('ready');
                    return;
                }
                // Already redeemed by an earlier load (e.g. StrictMode double
                // mount) — the session check below picks that session up.
            }
            // Also covers the implicit #access_token=…&type=recovery link of the
            // default Supabase template (detectSessionInUrl adopts it).
            const { data: { session } } = await supabase.auth.getSession();
            setStatus(session ? 'ready' : 'invalid');
        }

        void bootstrap();
    }, []);

    const submit = async (e: SyntheticEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < MIN_PASSWORD) return setError(t('signup.weakPassword', { n: MIN_PASSWORD }));
        if (password !== confirm) return setError(t('invite.passwordMismatch'));
        setBusy(true);
        const { error: updateError } = await authService.updatePassword(password);
        if (updateError) {
            console.error(updateError);
            const code = (updateError as { code?: string }).code;
            setError(
                code === 'same_password' ? t('auth.reset.samePassword')
                : code === 'weak_password' ? t('signup.weakPassword', { n: MIN_PASSWORD })
                : t('auth.reset.error'),
            );
            setBusy(false);
            return;
        }
        // Full reload so AuthProvider starts clean with the recovered session.
        window.location.replace('/');
    };

    if (status === 'loading') return <PageLoader />;

    if (status === 'invalid') {
        return (
            <AuthShell title={t('auth.reset.invalidTitle')} eyebrow={t('auth.portal')}>
                <div className="space-y-4 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-900/20">
                        <WarningCircleIcon weight="fill" className="size-6" />
                    </div>
                    <p className="text-body text-ink-soft dark:text-slate-300">{t('auth.reset.invalidBody')}</p>
                    <Link
                        to="/forgot-password"
                        className="inline-block text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                        {t('auth.reset.requestNew')}
                    </Link>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell title={t('auth.reset.title')} eyebrow={t('auth.portal')}>
            <p className="-mt-2 mb-4 text-center text-meta text-ink-soft dark:text-slate-400">{t('auth.reset.lead')}</p>
            <form className="space-y-3" onSubmit={submit} noValidate>
                <div>
                    <label htmlFor="new-password" className="text-eyebrow text-ink-soft dark:text-slate-400 ml-1">
                        {t('auth.reset.newPassword')}
                    </label>
                    <div className="mt-1.5">
                        <PasswordField
                            id="new-password"
                            value={password}
                            onChange={setPassword}
                            autoComplete="new-password"
                            minLength={MIN_PASSWORD}
                            autoFocus
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="confirm-password" className="text-eyebrow text-ink-soft dark:text-slate-400 ml-1">
                        {t('auth.confirmPassword')}
                    </label>
                    <div className="mt-1.5">
                        <PasswordField
                            id="confirm-password"
                            value={confirm}
                            onChange={setConfirm}
                            autoComplete="new-password"
                            invalid={confirm.length > 0 && confirm.length >= password.length && confirm !== password}
                        />
                    </div>
                </div>
                <FormError message={error} />
                <Button type="submit" size="lg" fullWidth loading={busy}>
                    {busy ? t('auth.reset.saving') : t('auth.reset.submit')}
                </Button>
            </form>
        </AuthShell>
    );
}
