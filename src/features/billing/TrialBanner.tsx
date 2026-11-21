import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HourglassMediumIcon, XIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { APP_NAME } from '@shared/brand';
import { canManageBilling, isNativeApp, useEntitlements } from './useBilling';

const DISMISS_KEY = 'billing-trial-banner-dismissed';
const today = () => new Date().toISOString().slice(0, 10);

function readDismissed(): string | null {
    try {
        return localStorage.getItem(DISMISS_KEY);
    } catch {
        return null;
    }
}

/**
 * --- TRIAL BANNER ---
 * One slim line for the organization's owner: the Business trial countdown,
 * or that the trial ended and the org is on Free now. Dismissible for the day.
 * Hidden on the Billing page itself; native apps get no link out.
 */
export function TrialBanner() {
    const t = useTranslation();
    const { user } = useAuthContext();
    const { pathname } = useLocation();
    const ent = useEntitlements();
    const [dismissed, setDismissed] = useState(() => readDismissed() === today());

    if (!canManageBilling(user) || ent.bypass || ent.isLoading || dismissed || pathname === '/billing') return null;
    if (!ent.isTrial && !ent.trialExpired) return null;

    const native = isNativeApp();
    const text = ent.isTrial ? t('billing.trialBanner', { n: ent.trialDaysLeft ?? 0 }) : t('billing.trialEndedBanner');

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, today());
        } catch {
            /* per-session only */
        }
    };

    return (
        <div className="glass mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2">
            <HourglassMediumIcon weight="bold" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <p className="min-w-0 flex-1 text-meta text-ink dark:text-white">
                {text}
                {native && <span className="text-ink-soft dark:text-slate-400"> · {t('billing.manageOnWeb', { app: APP_NAME })}</span>}
            </p>
            {!native && (
                <Link to="/billing" className="shrink-0 text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                    {t('billing.seePlans')}
                </Link>
            )}
            <button
                type="button"
                onClick={dismiss}
                aria-label={t('billing.dismiss')}
                className="shrink-0 rounded-lg p-1 text-ink-soft hover:bg-ink/5 dark:text-slate-400 dark:hover:bg-white/5"
            >
                <XIcon weight="bold" className="size-3.5" />
            </button>
        </div>
    );
}
