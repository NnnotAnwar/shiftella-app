import type { TranslationKey } from '@shared/i18n/translations';
import type { Entitlements } from './entitlements';

/** A small status pill next to a nav item. */
export interface NavPill {
    text: string;
    tone: 'amber' | 'accent' | 'rose' | 'muted';
    /** Worth a dot on the mobile "More" tab too (needs the owner's attention). */
    urgent: boolean;
}

/** Last days of a trial that get the stronger (amber, "Choose plan") treatment. */
export const TRIAL_URGENT_DAYS = 3;

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * --- BILLING NAV PILL ---
 * The Subscription nav item's status, so the owner can always find it:
 *   past_due              → "Payment"        rose
 *   trial running         → "Trial · N d"    amber (urgent in the last 3 days)
 *   trial or paid plan    → "Choose plan"    accent (native: just "Free", muted —
 *   ended / on Free                          store rules, no call to buy). Not
 *                                            urgent: staying on Free is fine, and
 *                                            the plan-ended dialog asks once.
 *   paid, gift, early     → the plan name    muted
 *   free beta             → "Beta"           muted
 * Nothing while loading or for the Superadmin (every gate is open anyway).
 */
export function billingNavPill(
    ent: Pick<Entitlements, 'plan' | 'isTrial' | 'trialDaysLeft' | 'trialExpired' | 'pastDue' | 'bypass'> & { isLoading?: boolean; freeBeta?: boolean },
    { t, native }: { t: T; native: boolean },
): NavPill | null {
    if (ent.isLoading || ent.bypass) return null;
    if (ent.pastDue) return { text: t('nav.pill.payment'), tone: 'rose', urgent: true };
    if (ent.freeBeta) return { text: t('nav.pill.beta'), tone: 'muted', urgent: false };
    if (ent.isTrial) {
        const n = ent.trialDaysLeft ?? 0;
        return { text: t('nav.pill.trial', { n }), tone: 'amber', urgent: n <= TRIAL_URGENT_DAYS };
    }
    if (ent.plan === 'free') {
        return native
            ? { text: t('billing.plan.free'), tone: 'muted', urgent: false }
            : { text: t('nav.pill.choosePlan'), tone: 'accent', urgent: false };
    }
    return { text: t(`billing.plan.${ent.plan}` as TranslationKey), tone: 'muted', urgent: false };
}

/** Pill surface per tone (idle row). */
export const NAV_PILL_CLASS: Record<NavPill['tone'], string> = {
    amber: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    accent: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    rose: 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    muted: 'text-ink-soft/80 dark:text-slate-500',
};

/** Dot colour for the collapsed icon rail / the "More" tab (muted gets none). */
export const NAV_PILL_DOT: Record<NavPill['tone'], string | null> = {
    amber: 'bg-amber-500',
    accent: 'bg-emerald-500',
    rose: 'bg-rose-500',
    muted: null,
};
