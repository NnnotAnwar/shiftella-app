import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon } from '@phosphor-icons/react';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { buttonClass } from '@shared/components/buttonStyles';
import {
    BUSINESS_MIN_SEATS,
    LIMITS,
    PLAN_FEATURES,
    PLAN_ORDER,
    PRICES,
    TRIAL_DAYS,
    billedPrice,
    yearlySavingPct,
    type BillingInterval,
    type Plan,
} from '@features/billing/plans';
import { LANDING, fill } from './landingContent';
import { SectionHead } from './SectionHead';

/**
 * --- PRICING (landing) ---
 * The three plans with a monthly/yearly switch. Every number — price, limit,
 * minimum seats, trial length, yearly saving — is read from billing/plans.ts,
 * the single source of truth shared with the Billing page and Stripe setup.
 * Web only: the landing never renders in the native apps (App Store rules).
 */
export function PricingSection() {
    const { language, t } = usePreferences();
    const c = LANDING[language].pricing;
    const [interval, setBillingInterval] = useState<BillingInterval>('month');
    const nf = new Intl.NumberFormat(language === 'cs' ? 'cs-CZ' : 'en-GB');
    const plural = new Intl.PluralRules(language === 'cs' ? 'cs' : 'en');
    const savePct = yearlySavingPct('team');

    const locationsLabel = (n: number) => {
        const cat = plural.select(n);
        return fill(cat === 'one' ? c.locations.one : cat === 'few' ? c.locations.few : c.locations.other, { n });
    };

    /** Features a plan adds over the previous one (Team over Free, Business over Team). */
    const added = (plan: Plan) => {
        const prev = plan === 'business' ? PLAN_FEATURES.team : PLAN_FEATURES.free;
        // Exports ride along with timesheets on the Billing page too; show them as one line here.
        return [...PLAN_FEATURES[plan]].filter((f) => !prev.has(f) && f !== 'exports');
    };

    return (
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-12 sm:py-16">
            <SectionHead id="pricing-title" eyebrow={c.eyebrow} title={c.title} sub={fill(c.sub, { days: TRIAL_DAYS })} />

            {/* Monthly / yearly */}
            <div className="mt-6 flex justify-center">
                <div role="group" aria-label={`${c.monthly} / ${c.yearly}`} className="segmented ring-1 ring-inset ring-gray-200/60 dark:ring-white/10">
                    {(['month', 'year'] as const).map((iv) => (
                        <button
                            key={iv}
                            type="button"
                            aria-pressed={interval === iv}
                            onClick={() => setBillingInterval(iv)}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-small-strong transition-colors ${interval === iv ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'}`}
                        >
                            {iv === 'month' ? c.monthly : c.yearly}
                            {iv === 'year' && (
                                <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-caption font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                                    {fill(c.save, { pct: savePct })}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
                {PLAN_ORDER.map((plan) => {
                    const featured = plan === 'team';
                    const limits = LIMITS[plan];
                    const price = plan === 'free' ? 0 : PRICES[plan][interval].czk;
                    const unit = plan === 'business' ? c.perPersonMonth : c.perMonth;
                    const yearly = plan !== 'free' && interval === 'year' ? billedPrice(plan, 'year', 1).unitCzk : null;
                    const items = plan === 'free' ? c.freeCore : added(plan).map((f) => t(`billing.feature.${f}`));
                    return (
                        <article
                            key={plan}
                            data-testid={`plan-${plan}`}
                            aria-labelledby={`plan-${plan}-name`}
                            className={`glass flex flex-col rounded-2xl p-5 ${featured ? '[--glass-shadow:var(--shadow-glass-lg)] ring-2 ring-emerald-500/50 dark:ring-emerald-400/40' : ''}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <h3 id={`plan-${plan}-name`} className="text-title text-ink dark:text-white">
                                    {t(`billing.plan.${plan}`)}
                                </h3>
                                {featured && (
                                    <span className="rounded-full bg-emerald-600 px-2 py-1 text-micro text-white">{c.recommended}</span>
                                )}
                            </div>
                            <p className="mt-1 text-meta text-ink-soft dark:text-slate-400">{c.blurb[plan]}</p>

                            <p className="mt-4 flex items-baseline gap-1.5">
                                <span className="font-display text-3xl font-bold tracking-tight text-ink tabular-nums dark:text-white">
                                    {nf.format(price)}
                                </span>
                                <span className="text-body-strong text-ink dark:text-white">{c.currency}</span>
                                <span className="text-meta text-ink-soft dark:text-slate-400">{plan === 'free' ? c.forever : unit}</span>
                            </p>
                            <p className="mt-1 min-h-4 text-caption text-ink-soft dark:text-slate-400">
                                {yearly !== null && fill(plan === 'business' ? c.billedYearlyPerson : c.billedYearlyFlat, { total: nf.format(yearly) })}
                            </p>

                            <ul className="mt-4 space-y-1.5 border-t border-ink/5 pt-4 text-meta text-ink dark:border-white/10 dark:text-slate-200">
                                <li className="font-semibold">
                                    {limits.members === null
                                        ? c.unlimited
                                        : `${fill(c.members, { n: limits.members })} · ${locationsLabel(limits.locations ?? 0)}`}
                                </li>
                                {plan === 'business' && <li className="text-ink-soft dark:text-slate-400">{fill(c.minSeats, { n: BUSINESS_MIN_SEATS })}</li>}
                                {plan !== 'free' && (
                                    <li className="pt-1 text-caption font-semibold uppercase tracking-wide text-ink-soft dark:text-slate-400">
                                        {plan === 'team' ? c.everythingInFree : c.everythingInTeam}
                                    </li>
                                )}
                                {items.map((label) => (
                                    <li key={label} className="flex items-start gap-2">
                                        <CheckIcon weight="bold" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <span>{label}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-auto pt-5">
                                <Link to="/signup" className={buttonClass({ variant: featured ? 'primary' : 'secondary', size: 'md', fullWidth: true })}>
                                    {plan === 'free' ? c.startFree : c.startTrial}
                                </Link>
                                <p className="mt-2 min-h-4 text-center text-caption text-ink-soft dark:text-slate-400">
                                    {plan !== 'free' && fill(c.trialNote, { days: TRIAL_DAYS })}
                                </p>
                            </div>
                        </article>
                    );
                })}
            </div>

            <p className="mt-5 text-center text-meta text-ink-soft dark:text-slate-400">{c.vat}</p>
        </section>
    );
}
