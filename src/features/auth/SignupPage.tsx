import { useState, type SyntheticEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeftIcon, BuildingsIcon, EnvelopeSimpleIcon, UserIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { usePreferences, useTranslation } from '@shared/preferences/PreferencesContext';
import { BASE_LANGUAGE } from '@shared/i18n/translations';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { FormError } from '@shared/components/FormError';
import { authService } from './authService';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { ResendButton } from './ResendButton';
import { MIN_PASSWORD, carryEmail, emailFromState, isValidEmail } from './authFlows';

/**
 * --- CREATE AN ORGANIZATION (owner sign-up) ---
 * For the store release: the owner registers themselves and their business.
 * Staff never sign up here — they join through an invite. After sign-up the
 * owner confirms their email; when the project skips confirmation, a session
 * comes back right away and <PublicRoute> takes them into the app.
 */

export function SignupPage() {
    const t = useTranslation();
    const { language } = usePreferences();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [orgName, setOrgName] = useState('');
    const location = useLocation();
    // An email typed on the sign-in page comes along in router state.
    const [email, setEmail] = useState(() => emailFromState(location.state));
    const [emailTouched, setEmailTouched] = useState(false);
    const [password, setPassword] = useState('');
    const [agreed, setAgreed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sentTo, setSentTo] = useState<string | null>(null);

    const submit = async (e: SyntheticEvent) => {
        e.preventDefault();
        setError('');
        if (!orgName.trim()) return setError(t('signup.orgRequired'));
        if (!isValidEmail(email)) {
            setEmailTouched(true);
            return document.getElementById('email')?.focus();
        }
        if (password.length < MIN_PASSWORD) return setError(t('signup.weakPassword', { n: MIN_PASSWORD }));
        if (!agreed) return setError(t('signup.agreeRequired'));
        setBusy(true);
        const { data, error: err } = await authService.signUpOwner({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            password,
            organizationName: orgName.trim(),
            // E-mails exist in cs/en only (sk → cs, uk → en).
            language: BASE_LANGUAGE[language],
        });
        if (err) {
            const m = err.message.toLowerCase();
            setError(
                m.includes('already') ? t('signup.exists')
                : m.includes('password') ? t('signup.weakPassword', { n: MIN_PASSWORD })
                : m.includes('not allowed') || m.includes('disabled') ? t('signup.disabled')
                : t('signup.error'),
            );
            setBusy(false);
            return;
        }
        // With a session, PublicRoute redirects into the app on its own.
        if (!data.session) {
            setSentTo(email.trim());
            setBusy(false);
        }
    };

    // Inline email check: only once the field was left (or on submit), and live after that.
    const emailInvalid = emailTouched && !isValidEmail(email);

    if (sentTo) {
        return (
            <AuthShell title={t('signup.checkTitle')} eyebrow={t('signup.eyebrow')}>
                <div className="space-y-4 text-center">
                    <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                        <PaperPlaneTiltIcon weight="duotone" className="size-6" />
                    </div>
                    <p className="text-body text-ink dark:text-slate-200">{t('signup.checkBody', { email: sentTo })}</p>
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('signup.checkHint')}</p>
                    {/* The sign-up itself just sent an email → start locked. */}
                    <ResendButton
                        cooledDown
                        cooldownKey={`signup:${sentTo.toLowerCase()}`}
                        onSend={() => authService.resendSignupConfirmation(sentTo)}
                    />
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-ink/5 pt-3 dark:border-white/5">
                        <button
                            type="button"
                            onClick={() => setSentTo(null)}
                            className="inline-flex items-center gap-1 text-meta font-semibold text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white"
                        >
                            <ArrowLeftIcon weight="bold" className="size-3.5" />
                            {t('auth.differentEmail')}
                        </button>
                        <Link to="/login" state={{ email: sentTo }} className="text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                            {t('signup.backToLogin')}
                        </Link>
                    </div>
                </div>
            </AuthShell>
        );
    }

    // Placeholders carry the visible label so the whole form fits one phone
    // screen; the real <label> stays for screen readers.
    const label = (id: string, text: string) => (
        <label htmlFor={id} className="sr-only">
            {text}
        </label>
    );

    return (
        <AuthShell
            title={t('signup.title')}
            eyebrow={t('signup.eyebrow')}
            below={
                <p className="mt-4 text-center text-meta text-ink-soft dark:text-slate-400">
                    {t('signup.haveAccount')}{' '}
                    <Link to="/login" state={carryEmail(email)} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                        {t('auth.signIn')}
                    </Link>
                </p>
            }
        >
            <p className="-mt-2 mb-3 text-center text-caption text-ink-soft sm:mb-4 sm:text-meta dark:text-slate-400">{t('signup.lead')}</p>
            <form className="space-y-2.5" onSubmit={submit} noValidate>
                <div>
                    {label('org', t('signup.orgName'))}
                    <div>
                        <Input id="org" icon={BuildingsIcon} required maxLength={80} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t('signup.orgName')} autoComplete="organization" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        {label('first', t('signup.firstName'))}
                        <div>
                            <Input id="first" icon={UserIcon} required maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" placeholder={t('signup.firstName')} />
                        </div>
                    </div>
                    <div>
                        {label('last', t('signup.lastName'))}
                        <div>
                            <Input id="last" required maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" placeholder={t('signup.lastName')} />
                        </div>
                    </div>
                </div>
                <div>
                    {label('email', t('signup.email'))}
                    <div>
                        <Input
                            id="email"
                            icon={EnvelopeSimpleIcon}
                            type="email"
                            required
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setEmailTouched(email.trim() !== '')}
                            invalid={emailInvalid}
                            aria-invalid={emailInvalid || undefined}
                            aria-describedby={emailInvalid ? 'email-error' : undefined}
                            placeholder={t('signup.email')}
                        />
                    </div>
                    {emailInvalid && (
                        <p id="email-error" className="mt-1 px-1 text-caption text-red-600 dark:text-red-400">
                            {t('auth.emailInvalid')}
                        </p>
                    )}
                </div>
                <div>
                    {label('pw', t('auth.password'))}
                    <PasswordField id="pw" value={password} onChange={setPassword} autoComplete="new-password" placeholder={t('auth.password')} minLength={MIN_PASSWORD} />
                </div>

                {/* Legal links open in a new tab so the half-filled form survives. */}
                <label className="flex items-start gap-2 px-1 text-caption text-ink-soft dark:text-slate-400">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-emerald-600" />
                    <span>
                        {t('signup.agreeBefore')}{' '}
                        <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">{t('signup.terms')}</a>{' '}
                        {t('signup.and')}{' '}
                        <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">{t('signup.privacy')}</a>.
                    </span>
                </label>

                <FormError message={error} />

                <Button type="submit" size="lg" fullWidth loading={busy}>
                    {busy ? t('signup.creating') : t('signup.submit')}
                </Button>
                <p className="px-1 text-center text-caption text-ink-soft dark:text-slate-400">{t('signup.staffHint')}</p>
            </form>
        </AuthShell>
    );
}
