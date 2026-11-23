import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HourglassMediumIcon, SparkleIcon, XIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { APP_NAME } from '@shared/brand';
import { Button } from '@shared/components/Button';
import { canManageBilling, isNativeApp, useEntitlements } from './useBilling';
import { TRIAL_URGENT_DAYS } from './navPill';

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
 * In the trial's last 3 days it turns amber with a clear "Choose plan" button.
 * Hidden on the Billing page itself; native apps get no link out.
 */
export function TrialBanner() {
    const t = useTranslation();
    const { user } = useAuthContext();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const ent = useEntitlements();
    const [dismissed, setDismissed] = useState(() => readDismissed() === today());

    if (!canManageBilling(user) || ent.bypass || ent.isLoading || dismissed || pathname === '/billing') return null;
    if (!ent.isTrial && !ent.trialExpired) return null;

    const native = isNativeApp();
    const days = ent.trialDaysLeft ?? 0;
    const urgent = ent.isTrial && days <= TRIAL_URGENT_DAYS;
    const text = urgent
        ? t('billing.trialBannerSoon', { n: days })
        : ent.isTrial
          ? t('billing.trialBanner', { n: days })
          : t('billing.trialEndedBanner');

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, today());
        } catch {
            /* per-session only */
        }
    };

    return (
        <div
            className={`glass mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                urgent ? 'ring-1 ring-amber-500/35 [--glass-bg-dark:rgb(245_158_11/0.12)] [--glass-bg:rgb(254_243_199/0.75)]' : ''
            }`}
        >
            <HourglassMediumIcon
                weight={urgent ? 'fill' : 'bold'}
                className={`size-4 shrink-0 ${urgent ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}
            />
            <p className="min-w-0 flex-1 text-meta text-ink dark:text-white">
                {text}
                {native && <span className="text-ink-soft dark:text-slate-400"> · {t('billing.manageOnWeb', { app: APP_NAME })}</span>}
            </p>
            {!native &&
                (urgent ? (
                    <Button size="sm" icon={SparkleIcon} className="shrink-0" onClick={() => navigate('/billing')}>
                        {t('billing.choosePlan')}
                    </Button>
                ) : (
                    <Link to="/billing" className="shrink-0 text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                        {ent.trialExpired ? t('billing.choosePlan') : t('billing.seePlans')}
                    </Link>
                ))}
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
