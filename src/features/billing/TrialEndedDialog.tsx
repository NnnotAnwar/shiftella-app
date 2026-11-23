import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckIcon, MinusIcon, SparkleIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { Modal } from '@features/admin/components/Modal';
import { Button } from '@shared/components/Button';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { TranslationKey } from '@shared/i18n/translations';
import { canManageBilling, isNativeApp, useEntitlements } from './useBilling';
import { markTrialEndedSeen, shouldShowTrialEnded, trialEndedSeen } from './trialEnded';
import { LIMITS, type Feature } from './plans';

/** What a Free org gives up — the Team features people notice first. */
const LOST_FEATURES: Feature[] = ['timesheets', 'swaps', 'templates', 'push'];

/**
 * --- TRIAL ENDED DIALOG ---
 * The only billing popup: shown once per organization (remembered on the
 * device as soon as it opens, so a reload doesn't bring it back) on the next
 * app open after the trial ran out. Says what Free keeps and what needs a paid
 * plan; "Choose plan" → /billing, "Stay on Free" closes.
 */
export function TrialEndedDialog() {
    const t = useTranslation();
    const { user } = useAuthContext();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const ent = useEntitlements();
    const orgId = user?.organization_id ?? '';
    const [closed, setClosed] = useState(false);
    // Re-read per page, not per render: marking it seen below must not hide it
    // while it is open (the backdrop blocks navigation until it closes).
    const seen = useMemo(() => (orgId ? trialEndedSeen(orgId) : true), [orgId, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    const rules = { ent, canManage: canManageBilling(user), native: isNativeApp(), seen };
    const show = !closed && shouldShowTrialEnded({ ...rules, pathname });
    // Already looking at the plans on /billing counts as seen, too.
    const seenOnBilling = pathname === '/billing' && shouldShowTrialEnded({ ...rules, pathname: '/' });

    useEffect(() => {
        if (show || seenOnBilling) markTrialEndedSeen(orgId);
    }, [show, seenOnBilling, orgId]);

    if (!show) return null;

    const close = () => setClosed(true);
    const choose = () => {
        close();
        navigate('/billing');
    };

    return (
        <Modal title={t('billing.trialEnded.title')} onClose={close}>
            <div className="space-y-3">
                <p className="text-meta text-ink-soft dark:text-slate-300">{t('billing.trialEnded.body')}</p>

                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-ink/4 px-3 py-2 dark:bg-white/5">
                        <p className="mb-1 text-eyebrow text-ink-soft dark:text-slate-400">{t('billing.trialEnded.keeps')}</p>
                        <ul className="space-y-1">
                            <Line ok text={t('billing.core')} />
                            <Line
                                ok
                                text={t('billing.trialEnded.freeLimits', { members: LIMITS.free.members ?? 0, locations: LIMITS.free.locations ?? 0 })}
                            />
                        </ul>
                    </div>
                    <div className="rounded-xl bg-ink/4 px-3 py-2 dark:bg-white/5">
                        <p className="mb-1 text-eyebrow text-ink-soft dark:text-slate-400">{t('billing.trialEnded.loses')}</p>
                        <ul className="space-y-1">
                            {LOST_FEATURES.map((f) => (
                                <Line key={f} text={t(`billing.feature.${f}` as TranslationKey)} />
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="flex gap-2 pt-1">
                    <Button variant="secondary" fullWidth onClick={close}>
                        {t('billing.trialEnded.stay')}
                    </Button>
                    <Button icon={SparkleIcon} fullWidth onClick={choose}>
                        {t('billing.choosePlan')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function Line({ text, ok = false }: { text: string; ok?: boolean }) {
    const Icon = ok ? CheckIcon : MinusIcon;
    return (
        <li className="flex items-start gap-1.5 text-caption text-ink dark:text-slate-200">
            <Icon weight="bold" className={`mt-px size-3.5 shrink-0 ${ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-ink-soft dark:text-slate-500'}`} />
            <span>{text}</span>
        </li>
    );
}
