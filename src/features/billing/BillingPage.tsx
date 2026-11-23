import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { AnimatePresence } from 'framer-motion';
import { ArrowCounterClockwiseIcon, CheckIcon, CircleNotchIcon, CreditCardIcon, GiftIcon, SparkleIcon, WarningIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { ConfirmDialog } from '@features/admin/components/Modal';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { PageHeader } from '@shared/components/PageHeader';
import { Button } from '@shared/components/Button';
import { Skeleton } from '@shared/components/Skeleton';
import { toast } from '@shared/toast/toastStore';
import { formatDateInText, formatDateShort } from '@shared/utils/date';
import { APP_NAME } from '@shared/brand';
import type { TranslationKey } from '@shared/i18n/translations';
import { BillingError, billingService } from './billingService';
import { canManageBilling, isNativeApp, useEntitlements, useOrgUsage, useSubscription } from './useBilling';
import { useRedirectAction } from './useRedirectAction';
import {
    BUSINESS_MIN_SEATS,
    LIMITS,
    PLAN_ORDER,
    PRICES,
    billedPrice,
    billedQuantity,
    changeKind,
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
 * Portal (card, invoices, billing details, cancel — never plan changes).
 * With a live subscription, switching plan or interval happens here: one
 * confirm with the new price, then billing-change-plan (Stripe's portal would
 * carry the Business quantity over to Team). "Switch to Free" on the Free card
 * cancels the live subscription at the end of the paid period (or trial) after
 * one confirm; while that cancel is scheduled the card shows "From {date}" and
 * the current plan offers "Resume subscription" (no charge, no confirm).
 * Native apps show the plan status only (store rules): no prices, no purchase
 * or switch buttons, no links out.
 *
 * Leaving for Stripe never leaves a stuck button behind: `useRedirectAction`
 * clears the spinner when the page comes back (Back button / bfcache, tab
 * switch, focus, or a 15 s safety net) and refetches the plan and usage.
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

    // Monthly / yearly switch: follows the live subscription (the row isn't there
    // on the first render) until the user picks one.
    const [chosenInterval, setBillingInterval] = useState<BillingInterval | null>(null);
    const interval: BillingInterval = chosenInterval ?? (sub?.interval === 'year' ? 'year' : 'month');

    const members = usageQ.data?.members ?? 0;
    const locations = usageQ.data?.locations ?? 0;

    const refetchAll = () => {
        void subQ.refetch();
        void usageQ.refetch();
    };

    // Server error → toast; a Team that wouldn't fit gets our own wording.
    const errorText = (err: unknown) => {
        if (err instanceof BillingError && (err.code === 'PLAN_LIMIT_MEMBERS' || err.code === 'PLAN_LIMIT_LOCATIONS')) {
            const kind = err.code === 'PLAN_LIMIT_MEMBERS' ? 'members' : 'locations';
            return t(`billing.switchLimit.${kind}` as TranslationKey, {
                max: err.limit ?? LIMITS.team[kind] ?? 0,
                n: err.count ?? (kind === 'members' ? members : locations),
            });
        }
        return err instanceof Error ? err.message : t('common.actionFailed');
    };

    const { busy, run, perform } = useRedirectAction({
        onReturn: refetchAll,
        onError: (err) => toast(errorText(err), 'error'),
    });

    const granted = ent.source === 'manual';
    const grandfathered = ent.source === 'grandfathered';
    const liveStripe = !!sub?.stripe_subscription_id && ['trialing', 'active', 'past_due'].includes(sub.status);
    const canBuy = !granted && !grandfathered;
    // The live subscription's plan + interval (what an in-place switch starts from).
    const livePlan: PaidPlan | null = liveStripe && sub && sub.plan !== 'free' ? sub.plan : null;
    const liveInterval: BillingInterval = sub?.interval === 'year' ? 'year' : 'month';

    // Each button has its own key, so only the tapped one spins; the other plan
    // buttons wait only while a redirect is genuinely on its way.
    const checkout = (plan: PaidPlan, iv: BillingInterval = interval) => run(plan, () => billingService.checkoutUrl(plan, iv, language));
    const portal = () => run('portal', () => billingService.portalUrl(language));
    // Back from a successful Checkout, until the webhook has written the Stripe row.
    const activating = polling && !(sub?.source === 'stripe' && sub.status !== 'incomplete');

    // In-place plan / interval switch (never in the Stripe portal): confirm once, then billing-change-plan.
    // `id` keys each opening, so a dialog reopened during the exit animation starts fresh.
    const [pending, setPending] = useState<{ plan: PaidPlan; interval: BillingInterval; id: number } | null>(null);
    const switchKey = (plan: PaidPlan | 'free') => `switch:${plan}`;
    // "Switch to Free" confirm (keyed per opening, like `pending`).
    const [freeConfirm, setFreeConfirm] = useState<number | null>(null);
    // A cancel at period end is scheduled on the live subscription.
    const cancelScheduled = liveStripe && !!sub?.cancel_at_period_end;
    const periodEnd = sub?.current_period_end ?? null;

    const num = (n: number) => n.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-GB');
    const czk = (n: number) => `${num(n)} Kč`;
    const eur = (n: number) => n.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-GB', { style: 'currency', currency: 'EUR' });
    const planName = (p: Plan) => t(`billing.plan.${p}` as TranslationKey);
    const intervalWord = (iv: BillingInterval) => t(iv === 'year' ? 'billing.yearly' : 'billing.monthly').toLocaleLowerCase(language);

    const changePlan = async (target: { plan: PaidPlan; interval: BillingInterval }) => {
        let useCheckout = false;
        await perform(switchKey(target.plan), async () => {
            try {
                const { unchanged } = await billingService.changePlan(target.plan, target.interval);
                toast(
                    unchanged ? t('billing.planUnchanged') : t('billing.planChanged', { plan: planName(target.plan), interval: intervalWord(target.interval) }),
                    unchanged ? 'info' : 'success',
                );
                refetchAll();
            } catch (err) {
                if (!(err instanceof BillingError && err.code === 'NO_SUBSCRIPTION')) throw err;
                useCheckout = true;
            }
        });
        // The subscription ended meanwhile: Checkout for the same choice instead (Stripe asks to pay there).
        if (useCheckout) {
            refetchAll();
            void checkout(target.plan, target.interval);
        }
    };

    // To Free = cancel at period end; resume = undo it. Neither charges anything.
    // If the subscription ended meanwhile the server says NO_SUBSCRIPTION: refetch, show it.
    const switchToFree = () =>
        perform(switchKey('free'), async () => {
            try {
                const { endsAt } = await billingService.switchToFree();
                toast(t('billing.toFreeDone', { date: formatDateInText(endsAt ?? periodEnd) }), 'success');
            } finally {
                refetchAll();
            }
        });
    const resume = () =>
        perform('resume', async () => {
            try {
                await billingService.resume();
                toast(t('billing.resumed'), 'success');
            } finally {
                refetchAll();
            }
        });

    const toFreeCopy = () => {
        const over: string[] = [];
        if (LIMITS.free.members !== null && members > LIMITS.free.members) over.push(t('billing.toFree.overMembers', { n: num(members) }));
        if (LIMITS.free.locations !== null && locations > LIMITS.free.locations) {
            // Czech: 2–4 "pobočky", 5+ "poboček".
            over.push(t(locations <= 4 ? 'billing.toFree.overLocationsFew' : 'billing.toFree.overLocationsMany', { n: num(locations) }));
        }
        const after = t('billing.toFree.after', { members: LIMITS.free.members ?? 0, locations: LIMITS.free.locations ?? 0 });
        return {
            title: t('billing.toFree.title'),
            message: t(sub?.status === 'trialing' ? 'billing.toFree.trial' : 'billing.toFree.paid', { date: formatDateInText(periodEnd) }),
            detail: over.length ? `${after} ${t('billing.toFree.over', { list: over.join(t('billing.toFree.and')) })}` : after,
        };
    };

    const confirmCopy = (target: { plan: PaidPlan; interval: BillingInterval }) => {
        const price = billedPrice(target.plan, target.interval, members);
        const per = t(target.interval === 'year' ? 'billing.perYearShort' : 'billing.perMonthShort');
        const message =
            target.plan === 'team'
                ? t('billing.switchPriceFlat', { amount: czk(price.totalCzk), per })
                : t('billing.switchPricePerMember', { n: price.quantity, unit: czk(price.unitCzk), amount: czk(price.totalCzk), per });
        const kind = livePlan ? changeKind({ plan: livePlan, interval: liveInterval }, target, sub?.status === 'trialing') : 'upgrade';
        const settle = t(kind === 'trial' ? 'billing.switchTrial' : kind === 'upgrade' ? 'billing.switchChargeNow' : 'billing.switchCredit');
        const minNote = target.plan === 'business' && price.quantity > members ? ` ${t('billing.switchMinNote', { min: BUSINESS_MIN_SEATS })}` : '';
        // billing-change-plan clears a scheduled cancel on any switch.
        const resumes = cancelScheduled ? ` ${t('billing.switchResumes')}` : '';
        return {
            title: t('billing.switchTitle', { plan: planName(target.plan), interval: intervalWord(target.interval) }),
            message,
            detail: `${settle}${minNote}${resumes}`,
        };
    };

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
              : ent.planEnded
                ? { label: t('billing.status.planEnded'), tone: 'gray' }
                : sub?.status === 'past_due'
                  ? { label: t('billing.status.pastDue'), tone: 'rose' }
                  : cancelScheduled && periodEnd
                    ? { label: t('billing.status.endsOn', { date: formatDateShort(periodEnd) }), tone: 'amber' }
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
                        <Button size="sm" variant="secondary" icon={CreditCardIcon} loading={busy === 'portal'} onClick={() => portal()}>
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

                {activating && (
                    <p role="status" className="flex items-center gap-1.5 text-meta text-emerald-700 dark:text-emerald-300">
                        <CircleNotchIcon weight="bold" className="size-3.5 animate-spin" />
                        {t('billing.activating')}
                    </p>
                )}
                {granted && (
                    <p className="flex items-center gap-1.5 text-meta text-ink dark:text-white">
                        <GiftIcon weight="bold" className="size-4 text-emerald-600 dark:text-emerald-300" />
                        {t('billing.grantedBy', { app: APP_NAME })}
                        <span className="text-ink-soft dark:text-slate-400">
                            · {ent.grantUntil ? t('billing.until', { date: formatDateInText(ent.grantUntil) }) : t('billing.noEndDate')}
                        </span>
                    </p>
                )}
                {grandfathered && <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.grandfatheredHint')}</p>}
                {ent.isTrial && sub?.trial_ends_at && (
                    <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.trialEnds', { date: formatDateInText(sub.trial_ends_at) })}</p>
                )}
                {ent.trialExpired && <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.trialEndedHint')}</p>}
                {ent.planEnded && <p className="text-meta text-ink-soft dark:text-slate-400">{t('billing.planEndedHint')}</p>}
                {sub?.status === 'past_due' && !granted && (
                    <p className="flex items-center gap-1.5 text-meta text-rose-600 dark:text-rose-400">
                        <WarningIcon weight="bold" className="size-4" />
                        {t('billing.pastDueHint')}
                    </p>
                )}
                {liveStripe && !granted && (periodEnd || cancelScheduled) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {periodEnd && (
                            <p className="text-meta text-ink-soft dark:text-slate-400">
                                {t(cancelScheduled ? 'billing.endsOn' : 'billing.renewsOn', { date: formatDateInText(periodEnd) })}
                            </p>
                        )}
                        {cancelScheduled && !native && canBuy && (
                            <Button
                                size="sm"
                                variant="tonal"
                                icon={ArrowCounterClockwiseIcon}
                                loading={busy === 'resume'}
                                disabled={!!busy && busy !== 'resume'}
                                onClick={() => void resume()}
                            >
                                {t('billing.resume')}
                            </Button>
                        )}
                    </div>
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
                            // A Stripe-backed trial is already this plan (only our no-card trial isn't).
                            const current = ent.plan === p && (!ent.isTrial || livePlan === p);
                            // The live plan's card offers the other interval when the toggle differs.
                            const switchTarget: { plan: PaidPlan; interval: BillingInterval } | null =
                                p === 'free' || !livePlan || (livePlan === p && liveInterval === interval) ? null : { plan: p, interval };
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

                                    {p === 'free' &&
                                        canBuy &&
                                        liveStripe &&
                                        (cancelScheduled ? (
                                            periodEnd && (
                                                <p className="rounded-lg bg-ink/4 px-2.5 py-1.5 text-center text-caption font-semibold text-ink-soft dark:bg-white/5 dark:text-slate-300">
                                                    {t('billing.fromDate', { date: formatDateInText(periodEnd) })}
                                                </p>
                                            )
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                loading={busy === switchKey('free')}
                                                disabled={!!busy && busy !== switchKey('free')}
                                                onClick={() => setFreeConfirm(Date.now())}
                                                fullWidth
                                            >
                                                {t('billing.switchToFree')}
                                            </Button>
                                        ))}

                                    {p !== 'free' && canBuy && (
                                        liveStripe ? (
                                            switchTarget && (
                                                <Button
                                                    size="sm"
                                                    variant={livePlan === p ? 'secondary' : 'tonal'}
                                                    loading={busy === switchKey(p)}
                                                    disabled={!!busy && busy !== switchKey(p)}
                                                    onClick={() => setPending({ ...switchTarget, id: Date.now() })}
                                                    fullWidth
                                                >
                                                    {livePlan === p
                                                        ? t(interval === 'year' ? 'billing.switchToYearly' : 'billing.switchToMonthly')
                                                        : t('billing.switchTo', { plan: planName(p) })}
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
                        {ent.isTrial && !liveStripe && ` ${t('billing.trialCarries')}`}
                    </p>
                </section>
            )}

            <AnimatePresence>
                {pending && !native && (
                    <ConfirmDialog
                        key={pending.id}
                        tone="primary"
                        {...confirmCopy(pending)}
                        confirmLabel={t('billing.switchConfirm')}
                        onClose={() => setPending(null)}
                        onConfirm={() => changePlan(pending)}
                    />
                )}
                {freeConfirm !== null && !native && (
                    <ConfirmDialog
                        key={freeConfirm}
                        tone="danger"
                        {...toFreeCopy()}
                        confirmLabel={t('billing.switchToFree')}
                        onClose={() => setFreeConfirm(null)}
                        onConfirm={switchToFree}
                    />
                )}
            </AnimatePresence>
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
