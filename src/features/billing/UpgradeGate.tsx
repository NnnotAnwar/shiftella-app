import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LockSimpleIcon, SparkleIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Skeleton } from '@shared/components/Skeleton';
import { PageHeader } from '@shared/components/PageHeader';
import { APP_NAME } from '@shared/brand';
import type { TranslationKey } from '@shared/i18n/translations';
import { canManageBilling, isNativeApp, useEntitlements } from './useBilling';
import { requiredPlan, type Feature } from './plans';

/**
 * --- UPGRADE GATE ---
 * Wrap a gated page or section: renders its children when the organization's
 * plan includes `feature`, otherwise a compact upgrade prompt. Superadmin
 * always passes. Native apps never show prices or purchase links — only the
 * plan name and a neutral "manage on the web" line.
 */
export function UpgradeGate({ feature, children }: { feature: Feature; children: ReactNode }) {
    const ent = useEntitlements();
    if (ent.isLoading) {
        return (
            <div className="space-y-3 px-1" aria-hidden>
                <Skeleton className="h-8 w-48 rounded-xl" />
                <Skeleton className="h-40 rounded-2xl" />
            </div>
        );
    }
    if (ent.can(feature)) return <>{children}</>;
    return <UpgradePrompt feature={feature} />;
}

/** A whole gated page (route element): its title + the prompt when blocked. */
export function GatedPage({ feature, titleKey, children }: { feature: Feature; titleKey: TranslationKey; children: ReactNode }) {
    const t = useTranslation();
    const ent = useEntitlements();
    if (ent.isLoading || ent.can(feature)) return <UpgradeGate feature={feature}>{children}</UpgradeGate>;
    return (
        <div className="space-y-4 px-1 pb-10">
            <PageHeader eyebrow={t('billing.upgradeEyebrow')} title={t(titleKey)} />
            <UpgradePrompt feature={feature} />
        </div>
    );
}

/** The prompt itself — also usable inline (e.g. in place of a gated card). */
export function UpgradePrompt({ feature, className = '' }: { feature: Feature; className?: string }) {
    const t = useTranslation();
    const { user } = useAuthContext();
    const plan = requiredPlan(feature);
    const planName = t(`billing.plan.${plan}` as TranslationKey);
    const owner = canManageBilling(user);
    const native = isNativeApp();

    return (
        <div className={`glass flex items-start gap-3 rounded-2xl p-3.5 ${className}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <LockSimpleIcon weight="bold" className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
                <p className="text-body-strong text-ink dark:text-white">{t(`billing.feature.${feature}` as TranslationKey)}</p>
                <p className="text-caption text-ink-soft dark:text-slate-400">
                    {t('billing.partOf', { plan: planName })}{' '}
                    {!owner ? t('billing.askOwner') : native ? t('billing.manageOnWeb', { app: APP_NAME }) : null}
                </p>
                {owner && !native && (
                    <Link
                        to="/billing"
                        className="inline-flex items-center gap-1.5 pt-1 text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                    >
                        <SparkleIcon weight="fill" className="size-3.5" />
                        {t('billing.seePlans')}
                    </Link>
                )}
            </div>
        </div>
    );
}
