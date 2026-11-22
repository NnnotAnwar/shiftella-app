import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { CheckIcon, CreditCardIcon, GiftIcon, SparkleIcon, WarningIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { PageHeader } from '@shared/components/PageHeader';
import { Button } from '@shared/components/Button';
import { Skeleton } from '@shared/components/Skeleton';
import { toast } from '@shared/toast/toastStore';
import { formatDateLong } from '@shared/utils/date';
import { APP_NAME } from '@shared/brand';
import type { TranslationKey } from '@shared/i18n/translations';
import { billingService } from './billingService';
import { canManageBilling, isNativeApp, useEntitlements, useOrgUsage, useSubscription } from './useBilling';
import {
    BUSINESS_MIN_SEATS,
    LIMITS,
    PLAN_ORDER,
    PRICES,
    billedQuantity,
    monthlyEstimateCzk,
    yearlySavingPct,
    type BillingInterval,
    type Feature,
    type PaidPlan,
    type Plan,
} from './plans';

/** Feature bullets per plan card (Business lists only what it adds). */
const CARD_FEATURES: Record<Plan, Feature[]> = {
    free: [],
    team: ['timesheets', 'swaps', 'templates', 'push', 'wages', 'customRoles'],
    business: ['activityLog', 'coverage', 'restRules', 'prioritySupport', 'earlyAccess'],
};

/**
 * --- BILLING PAGE ---
 * The organization's subscription, for its Head Admin (and the Superadmin):
 * current plan, trial countdown, members vs. limits, the plan cards with a
 * monthly / yearly switch, Upgrade → Stripe Checkout, Manage → Customer
 * Portal. Native apps show the plan status only (store rules): no prices, no
 * purchase buttons, no links out.
 */
export function BillingPage() {
    const { user } = useAuthContext();
    if (user && !canManageBilling(user)) return <Navigate to="/" replace />;
    return <BillingInner />;
}

function BillingInner() {
    const { t, language } = usePreferences();

    const [params, setParams] = useSearchParams();
    const native = isNativeApp();

    // Back from Checkout: the webhook lands a moment later — poll briefly.
    const [polling, setPolling] = useState(() => params.get('checkout') === 'success');
    const subQ = useSubscription({ poll: polling });
    const usageQ = useOrgUsage();
    const ent = useEntitlements();
    const sub = subQ.data ?? null;
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;
        const state = params.get('checkout');
        if (!state) return;
        handled.current = true;
        toast(t(state === 'success' ? 'billing.checkoutSuccess' : 'billing.checkoutCanceled'), state === 'success' ? 'success' : 'info');
        params.delete('checkout');
        setParams(params, { replace: true });
    }, [params, setParams, t]);

    // Give the webhook up to 30 s; the query itself stops once the row is Stripe's.
    useEffect(() => {
        if (!polling) return;
        const stop = setTimeout(() => setPolling(false), 30_000);
        return () => clearTimeout(stop);
    }, [polling]);

    const [interval, setBillingInterval] = useState<BillingInterval>(() => (sub?.interval === 'year' ? 'year' : 'month'));
    const [busy, setBusy] = useState<string | null>(null);

    const members = usageQ.data?.members ?? 0;
    const locations = usageQ.data?.locations ?? 0;
    const granted = ent.source === 'manual';
    const grandfathered = ent.source === 'grandfathered';
    const liveStripe = !!sub?.stripe_subscription_id && ['trialing', 'active', 'past_due'].includes(sub.status);
    const canBuy = !granted && !grandfathered;

    const go = async (key: string, getUrl: () => Promise<string>) => {
        setBusy(key);
        try {
            window.location.assign(await getUrl());
        } catch (err) {
            toast(err instanceof Error ? err.message : t('common.actionFailed'), 'error');
            setBusy(null);
        }
    };
    const checkout = (plan: PaidPlan) => go(plan, () => billingService.checkoutUrl(plan, interval, language));
    const portal = () => go('portal', () => billingService.portalUrl(language));

    const num = (n: number) => n.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-GB');
    const czk = (n: number) => `${num(n)} Kč`;
    const eur = (n: number) => n.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-GB', { style: 'currency', currency: 'EUR' });
    const planName = (p: Plan) => t(`billing.plan.${p}` as TranslationKey);

    if (subQ.isLoading) {
        return (
            <div className="space-y-4 px-1 pb-10" aria-hidden>
                <Skeleton className="h-12 w-56 rounded-xl" />
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        );
    }

    // --- Status chip --------------------------------------------------------------
    const chip = granted
        ? { label: t('billing.status.granted'), tone: 'emerald' }
        : grandfathered
          ? { label: t('billing.status.grandfathered'), tone: 'emerald' }
          : ent.isTrial
            ? { label: t('billing.trialDaysLeft', { n: ent.trialDaysLeft ?? 0 }), tone: 'amber' }
            : ent.trialExpired
              ? { label: t('billing.status.trialEnded'), tone: 'gray' }
              : sub?.status === 'past_due'
                ? { label: t('billing.status.pastDue'), tone: 'rose' }
                : sub?.cancel_at_period_end
                  ? { label: t('billing.status.ending'), tone: 'amber' }
                  : ent.plan !== 'free'
                    ? { label: t('billing.status.active'), tone: 'emerald' }
                    : null;
    const toneClass: Record<string, string> = {
        emerald: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
        amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
        rose: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
        gray: 'bg-ink/5 text-ink-soft dark:bg-white/6 dark:text-slate-400',
    };

    const limitLine = (kind: 'members' | 'locations', used: number) => {
        const max = ent.limits[kind];
        return max === null ? num(used) : `${num(used)} / ${num(max)}`;
    };

    return (
        <div className="space-y-4 px-1 pb-10">
            <PageHeader
                eyebrow={t('billing.eyebrow')}
                title={t('billing.title')}
                description={native ? t('billing.manageOnWeb', { app: APP_NAME }) : t('billing.description')}
                actions={
                    !native &&
                    sub?.stripe_customer_id && (
                        <Button size="sm" variant="secondary" icon={CreditCardIcon} loading={busy === 'portal'} onClick={portal}>
                            {t('billing.manage')}
                        </Button>
                    )
                }
            />

            {/* CURRENT PLAN */}
            <section className="glass space-y-3 rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-eyebrow text-ink-soft dark:text-slate-400">{t('billing.currentPlan')}</span>
                    {chip && <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${toneClass[chip.tone]}`}>{chip.label}</span>}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-card-title text-ink dark:text-white">{planName(ent.plan)}</h2>
                    {sub?.interval && liveStripe && !granted && (
                        <span className="text-meta text-ink-soft dark:text-slate-400">{t(sub.interval === 'year' ? 'billing.yearly' : 'billing.monthly')}</span>
                    )}
                </div>

                {granted && (
                    <p className="flex items-center gap-1.5 text-meta text-ink dark:text-white">
                        <GiftIcon weight="bold" className="size-4 text-emerald-600 dark:text-emerald-300" />
                        {t('billing.grantedBy', { app: APP_NAME })}
                        <span className="text-ink-soft dark:text-slate-400">
                            · {ent.grantUntil ? t('billing.until', { date: formatDateLong(ent.grantUntil) }) : t('billing.noEndDate')}
                        </span>
                    </p>
                )}
                {grandfathered && <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.grandfatheredHint')}</p>}
                {ent.isTrial && sub?.trial_ends_at && (
                    <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.trialEnds', { date: formatDateLong(sub.trial_ends_at) })}</p>
                )}
                {ent.trialExpired && <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.trialEndedHint')}</p>}
                {sub?.status === 'past_due' && !granted && (
                    <p className="flex items-center gap-1.5 text-meta text-rose-600 dark:text-rose-400">
                        <WarningIcon weight="bold" className="size-4" />
                        {t('billing.pastDueHint')}
                    </p>
                )}
                {liveStripe && !granted && sub?.current_period_end && (
                    <p className="text-meta text-ink-soft dark:text-slate-400">
                        {t(sub.cancel_at_period_end ? 'billing.endsOn' : 'billing.renewsOn', { date: formatDateLong(sub.current_period_end) })}
                    </p>
                )}

                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Stat label={t('billing.members')} value={limitLine('members', members)} warn={ent.overLimit('members')} />
                    <Stat label={t('billing.locations')} value={limitLine('locations', locations)} warn={ent.overLimit('locations')} />
                    {liveStripe && !granted && sub?.plan === 'business' && sub.seats != null && (
                        <Stat label={t('billing.billedSeats')} value={num(sub.seats)} />
                    )}
                </dl>
                {(ent.overLimit('members') || ent.overLimit('locations')) && (
                    <p className="text-caption text-amber-700 dark:text-amber-300">{t('billing.overLimitHint')}</p>
                )}
            </section>

            {/* PLANS — web only (store rules) */}
            {!native && (
                <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="px-1 text-eyebrow text-ink-soft dark:text-slate-400">{t('billing.plans')}</h3>
                        <div className="segmented flex">
                            {(['month', 'year'] as const).map((iv) => {
                                const active = interval === iv;
                                return (
                                    <button
                                        key={iv}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setBillingInterval(iv)}
                                        className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1 text-meta font-semibold transition-colors ${
                                            active ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'
                                        }`}
                                    >
                                        {t(iv === 'year' ? 'billing.yearly' : 'billing.monthly')}
                                        {iv === 'year' && (
                                            <span className="rounded-full bg-emerald-500/12 px-1.5 text-caption font-semibold text-emerald-700 dark:text-emerald-300">
                                                {t('billing.save', { pct: yearlySavingPct('team') })}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {!canBuy && (
                        <p className="px-1 text-caption text-ink-soft dark:text-slate-400">
                            {granted ? t('billing.grantedNoPurchase', { app: APP_NAME }) : t('billing.grandfatheredNoPurchase')}
                        </p>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                        {PLAN_ORDER.map((p) => {
                            const current = ent.plan === p && !ent.isTrial;
                            const paid = p === 'free' ? null : PRICES[p];
                            const limits = LIMITS[p];
                            return (
                                <div
                                    key={p}
                                    className={`glass flex flex-col gap-3 rounded-2xl p-4 ${current ? 'ring-2 ring-emerald-500/60' : ''}`}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-heading text-ink dark:text-white">{planName(p)}</p>
                                            {current && (
                                                <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-caption font-semibold text-emerald-700 dark:text-emerald-300">
                                                    {t('billing.current')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="flex flex-wrap items-baseline gap-x-1.5">
                                            <span className="text-metric text-ink dark:text-white">{paid ? czk(paid[interval].czk) : czk(0)}</span>
                                            <span className="text-caption text-ink-soft dark:text-slate-400">
                                                {p === 'business' ? t('billing.perMemberMonth') : p === 'team' ? t('billing.perOrgMonth') : ''}
                                            </span>
                                        </p>
                                        {paid && (
                                            <p className="text-caption text-ink-soft dark:text-slate-400">
                                                ≈ {eur(paid[interval].eur)} · {t('billing.exclVat')}
                                                {interval === 'year' && ` · ${t(p === 'team' ? 'billing.billedYearly' : 'billing.billedYearlyPerMember', { amount: czk(paid.year.czk * 12) })}`}
                                            </p>
                                        )}
                                    </div>

                                    <p className="text-meta font-semibold text-ink dark:text-white">
                                        {p === 'business'
                                            ? t('billing.limitBusiness', { min: BUSINESS_MIN_SEATS })
                                            : t('billing.limitUpTo', { members: limits.members ?? 0, locations: limits.locations ?? 0 })}
                                    </p>

                                    {p === 'business' && (
                                        <p className="rounded-lg bg-ink/4 px-2.5 py-1.5 text-caption text-ink dark:bg-white/5 dark:text-slate-200">
                                            {t('billing.estimate', {
                                                n: members,
                                                amount: czk(monthlyEstimateCzk('business', interval, members)),
                                            })}
                                            {billedQuantity('business', members) > members && (
                                                <span className="text-ink-soft dark:text-slate-400"> · {t('billing.minBilled', { min: BUSINESS_MIN_SEATS })}</span>
                                            )}
                                        </p>
                                    )}

                                    <ul className="flex-1 space-y-1">
                                        {p === 'free' && <Bullet text={t('billing.core')} />}
                                        {p === 'business' && <Bullet text={t('billing.everythingInTeam')} />}
                                        {CARD_FEATURES[p].map((f) => (
                                            <Bullet key={f} text={t(`billing.feature.${f}` as TranslationKey)} />
                                        ))}
                                    </ul>

                                    {p !== 'free' && canBuy && (
                                        liveStripe ? (
                                            !current && (
                                                <Button size="sm" variant="secondary" loading={busy === 'portal'} onClick={portal} fullWidth>
                                                    {t('billing.switchInPortal')}
                                                </Button>
                                            )
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant={p === 'business' ? 'primary' : 'tonal'}
                                                icon={SparkleIcon}
                                                loading={busy === p}
                                                disabled={!!busy && busy !== p}
                                                onClick={() => checkout(p)}
                                                fullWidth
                                            >
                                                {t('billing.choose', { plan: planName(p) })}
                                            </Button>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="px-1 text-caption text-ink-soft dark:text-slate-400">
                        {t('billing.footnote')}
                        {ent.isTrial && ` ${t('billing.trialCarries')}`}
                    </p>
                </section>
            )}
        </div>
    );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
    return (
        <div className="rounded-xl bg-ink/4 px-3 py-2 dark:bg-white/5">
            <dt className="text-caption text-ink-soft dark:text-slate-400">{label}</dt>
            <dd className={`text-metric-sm ${warn ? 'text-amber-700 dark:text-amber-300' : 'text-ink dark:text-white'}`}>{value}</dd>
        </div>
    );
}

function Bullet({ text }: { text: string }) {
    return (
        <li className="flex items-start gap-1.5 text-caption text-ink dark:text-slate-200">
            <CheckIcon weight="bold" className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <span>{text}</span>
        </li>
    );
}
