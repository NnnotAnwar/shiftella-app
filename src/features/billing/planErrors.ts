import type { TranslationKey } from '@shared/i18n/translations';
import { APP_NAME } from '@shared/brand';
import { PLAN_FEATURES, requiredPlan, type Feature } from './plans';

/**
 * --- PLAN / BILLING ERRORS ---
 * Turns server errors into translated text, by their machine-readable code.
 *   • `PLAN_FEATURE:<feature>` — the database refused a write the plan doesn't
 *     include (plan_feature_gate triggers) → the upgrade nudge / a toast.
 *   • Billing functions' `code` (NO_SUBSCRIPTION, GRANTED, …) → a sentence.
 * Anything unknown falls back to the server's own message.
 */

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const ALL_FEATURES = new Set<string>(PLAN_FEATURES.business);

const messageOf = (e: unknown): string => {
    if (typeof e === 'string') return e;
    const m = (e as { message?: unknown } | null)?.message;
    return typeof m === 'string' ? m : '';
};

/** The feature a `PLAN_FEATURE:<feature>` error is about, or null. */
export function planFeatureFromError(e: unknown): Feature | null {
    const m = /PLAN_FEATURE:([A-Za-z]+)/.exec(messageOf(e));
    return m && ALL_FEATURES.has(m[1]) ? (m[1] as Feature) : null;
}

/** "Shift swaps — part of the Team plan." for a PLAN_FEATURE error, else null. */
export function planFeatureMessage(e: unknown, t: T): string | null {
    const feature = planFeatureFromError(e);
    if (!feature) return null;
    return t('billing.featureLocked', {
        feature: t(`billing.feature.${feature}` as TranslationKey),
        plan: t(`billing.plan.${requiredPlan(feature)}` as TranslationKey),
    });
}

const BILLING_CODES = ['NO_SUBSCRIPTION', 'GRANTED', 'GRANDFATHERED', 'HAS_SUBSCRIPTION', 'NO_CUSTOMER', 'PLAN_LIMIT_MEMBERS', 'PLAN_LIMIT_LOCATIONS'] as const;
type BillingCode = (typeof BILLING_CODES)[number];
const DEFAULT_LIMIT: Record<string, number> = { PLAN_LIMIT_MEMBERS: 5, PLAN_LIMIT_LOCATIONS: 1 };

/**
 * A billing function's error in the UI language: by `code` (and `limit`), or
 * "Billing is not configured…" (thrown before any code exists); otherwise the
 * server's message, otherwise `fallback`.
 */
export function billingErrorMessage(err: unknown, t: T, fallback: string): string {
    const { code, limit } = (err ?? {}) as { code?: unknown; limit?: unknown };
    if (typeof code === 'string' && (BILLING_CODES as readonly string[]).includes(code)) {
        const c = code as BillingCode;
        if (c === 'GRANTED') return t('billing.err.GRANTED', { app: APP_NAME });
        if (c === 'PLAN_LIMIT_MEMBERS' || c === 'PLAN_LIMIT_LOCATIONS') {
            return t(`billing.err.${c}`, { max: typeof limit === 'number' ? limit : DEFAULT_LIMIT[c] });
        }
        return t(`billing.err.${c}` as TranslationKey);
    }
    const message = messageOf(err);
    if (/^Billing is not configured/i.test(message)) return t('billing.err.NOT_CONFIGURED');
    return planFeatureMessage(err, t) ?? (message || fallback);
}
