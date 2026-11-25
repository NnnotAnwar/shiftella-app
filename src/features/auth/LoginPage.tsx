import { useState, type SyntheticEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AtIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { FormError } from '@shared/components/FormError';
import { authService } from './authService';
import { AuthShell } from './AuthShell';
import { PasswordField } from './PasswordField';
import { ResendButton } from './ResendButton';
import { carryEmail, emailFromState, isEmailNotConfirmed, isRateLimited } from './authFlows';

/**
 * --- LOGIN PAGE ---
 * Pure sign-in form. Redirecting an already-authenticated user away, and
 * redirecting in after a successful login, are both handled declaratively by
 * <PublicRoute> — this component no longer navigates itself.
 */

/** Why the last attempt failed: wrong credentials, or an email still unconfirmed. */
type Failure = { kind: 'invalid' } | { kind: 'rateLimited' } | { kind: 'unconfirmed'; email: string | null };

export function LoginPage() {
  const location = useLocation();
  // An email typed on sign-up / forgot-password comes along in router state.
  const [loginInput, setLoginInput] = useState(() => emailFromState(location.state));
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const t = useTranslation();

  const handleLogin = async (e: SyntheticEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFailure(null);

    const input = loginInput.trim();
    const isEmail = input.includes('@');
    try {
      if (isEmail) {
        // Email + password — Supabase already returns a generic error on failure.
        const { error } = await authService.signIn(input, password);
        if (error) throw error;
      } else {
        // Username — resolved + verified server-side (no email/username leak).
        await authService.signInWithUsername(input, password);
      }

      // Success: keep the spinner up; PublicRoute redirects to "/" once the
      // session resolves and AuthContext loads the profile.
    } catch (error) {
      console.error(error);
      // "Email not confirmed" only comes back after the password matched, so it
      // is safe to say so; everything else stays one generic message.
      setFailure(
        isEmailNotConfirmed(error)
          ? { kind: 'unconfirmed', email: isEmail ? input : null }
          : isRateLimited(error)
            ? { kind: 'rateLimited' }
            : { kind: 'invalid' },
      );
      setIsLoading(false);
    }
  };

  const carried = carryEmail(loginInput);

  return (
    <AuthShell
      title={t('auth.welcomeBack')}
      eyebrow={t('auth.portal')}
      below={
        <p className="mt-4 text-center text-meta text-ink-soft dark:text-slate-400">
          {t('signup.prompt')}{' '}
          <Link to="/signup" state={carried} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            {t('signup.cta')}
          </Link>
        </p>
      }
    >
          <form className="space-y-4" onSubmit={handleLogin}>
            {/* Email / Username */}
            <div>
              <label htmlFor="login" className="text-eyebrow text-ink-soft dark:text-slate-400 ml-1">{t('auth.emailOrUsername')}</label>
              <div className="mt-1.5">
                <Input
                  id="login"
                  icon={AtIcon}
                  type="text"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="password" className="text-eyebrow text-ink-soft dark:text-slate-400 ml-1">{t('auth.password')}</label>
                <Link
                  to="/forgot-password"
                  state={carried}
                  className="mr-1 text-caption font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                >
                  {t('auth.forgotLink')}
                </Link>
              </div>
              <div className="mt-1.5">
                <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
              </div>
            </div>

            {failure?.kind === 'invalid' && <FormError message={t('auth.invalidCredentials')} />}
            {failure?.kind === 'rateLimited' && <FormError message={t('auth.tooManyLogins')} />}

            {failure?.kind === 'unconfirmed' && (
              <div
                role="alert"
                className="space-y-2.5 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10"
              >
                <p className="flex items-start gap-2 text-small-strong text-amber-800 dark:text-amber-200">
                  <EnvelopeSimpleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
                  <span>{failure.email ? t('auth.unconfirmed') : t('auth.unconfirmedUsername')}</span>
                </p>
                {failure.email && (
                  <ResendButton
                    cooldownKey={`signup:${failure.email.toLowerCase()}`}
                    onSend={() => authService.resendSignupConfirmation(failure.email!)}
                  />
                )}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={isLoading}>
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>
    </AuthShell>
  );
}
