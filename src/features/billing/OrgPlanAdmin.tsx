import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GiftIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { toast } from '@shared/toast/toastStore';
import type { TranslationKey } from '@shared/i18n/translations';
import { billingService, type OrgPlanRow } from './billingService';
import { billingKeys, useAllOrgPlans } from './useBilling';
import { effectivePlan, effectiveSource, hasActiveGrant, type Subscription } from './entitlements';
import type { PaidPlan, Plan } from './plans';

/**
 * --- SUPERADMIN: ORGANIZATION PLANS ---
 * The platform owner sees every organization's plan (badge in the list) and
 * can grant one for free — Team or Business, until a date or forever, with a
 * note — or remove the grant (Free). One Save, a toast, no confirm popup.
 */

const asSub = (r: OrgPlanRow): Subscription =>
    ({ ...r, interval: null, seats: null, current_period_end: null, cancel_at_period_end: false, stripe_customer_id: null }) as Subscription;

/** "Business · gift" — the plan an organization gets today and where it comes from. */
export function OrgPlanBadge({ row }: { row: OrgPlanRow | undefined }) {
    const t = useTranslation();
    const plan: Plan = row ? effectivePlan(asSub(row)) : 'free';
    const source = row ? effectiveSource(asSub(row)) : 'none';
    const tone =
        plan === 'business'
            ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
            : plan === 'team'
              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
              : 'bg-ink/5 text-ink-soft dark:bg-white/6 dark:text-slate-400';
    return (
        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold ${tone}`}>
            {t(`billing.plan.${plan}` as TranslationKey)}
            {source !== 'none' && source !== 'stripe' && ` · ${t(`billing.source.${source}` as TranslationKey)}`}
        </span>
    );
}

/** Local end-of-day for a YYYY-MM-DD date input, as an ISO timestamp. */
const endOfDay = (date: string) => new Date(`${date}T23:59:59`).toISOString();
const dateInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Grant / change / remove an organization's free plan. */
export function OrgPlanControl({ orgId }: { orgId: string }) {
    const { rows, isLoading } = useAllOrgPlans();
    if (isLoading) return null;
    const row = rows.get(orgId);
    // Re-seed the form whenever the stored grant changes.
    return <OrgPlanForm key={`${row?.manual_plan}|${row?.manual_until}|${row?.manual_note}`} orgId={orgId} row={row} />;
}

function OrgPlanForm({ orgId, row }: { orgId: string; row: OrgPlanRow | undefined }) {
    const t = useTranslation();
    const qc = useQueryClient();
    // Seeded once per stored grant (the parent re-keys this form when it changes).
    const [seed] = useState(() => (row && hasActiveGrant(row) ? row : null));
    const [plan, setPlan] = useState<Plan>(seed?.manual_plan ?? 'free');
    const [until, setUntil] = useState(seed ? dateInput(seed.manual_until) : '');
    const [note, setNote] = useState(seed?.manual_note ?? '');

    const save = useMutation({
        mutationFn: () =>
            plan === 'free'
                ? billingService.clearOrgPlan(orgId)
                : billingService.setOrgPlan(orgId, plan as PaidPlan, until ? endOfDay(until) : null, note.trim() || null),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: billingKeys.all });
            toast(t(plan === 'free' ? 'billing.grantRemoved' : 'billing.grantSaved'), 'success');
        },
        onError: (err) => toast(err instanceof Error ? err.message : t('common.actionFailed'), 'error'),
    });

    const today = dateInput(new Date().toISOString());

    return (
        <div className="space-y-2.5 rounded-xl bg-ink/4 p-3 dark:bg-white/5">
            <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-meta font-semibold text-ink dark:text-white">
                    <GiftIcon weight="bold" className="size-4 text-emerald-600 dark:text-emerald-300" />
                    {t('billing.grantTitle')}
                </p>
                <OrgPlanBadge row={row} />
            </div>
            <div className="segmented flex w-full">
                {(['free', 'team', 'business'] as const).map((p) => (
                    <button
                        key={p}
                        type="button"
                        aria-pressed={plan === p}
                        onClick={() => setPlan(p)}
                        className={`flex-1 rounded-[9px] px-3 py-1 text-meta font-semibold transition-colors ${
                            plan === p ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'
                        }`}
                    >
                        {t(`billing.plan.${p}` as TranslationKey)}
                    </button>
                ))}
            </div>
            {plan !== 'free' && (
                <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                        <span className="text-micro text-gray-400">{t('billing.grantUntil')}</span>
                        <Input type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
                    </label>
                    <label className="block space-y-1">
                        <span className="text-micro text-gray-400">{t('billing.grantNote')}</span>
                        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('billing.grantNotePh')} />
                    </label>
                </div>
            )}
            <p className="text-caption text-ink-soft dark:text-slate-400">{plan === 'free' ? t('billing.grantFreeHint') : t('billing.grantHint')}</p>
            <Button type="button" size="sm" variant="tonal" loading={save.isPending} onClick={() => save.mutate()}>
                {t('common.save')}
            </Button>
        </div>
    );
}
