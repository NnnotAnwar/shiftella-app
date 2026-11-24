import { FlaskIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@shared/components/Button';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { User } from '@shared/types';
import { useDemoData } from './useDemoData';

/**
 * --- DEMO DATA BANNER ---
 * While the owner's organization holds demo data, one slim line on Home says
 * so (and that nobody gets notified) with a one-tap "Remove demo data" — Undo
 * in the toast, no confirm.
 */
export function DemoDataBanner({ user }: { user: User }) {
    const t = useTranslation();
    const demo = useDemoData(user);
    if (!demo.active) return null;

    return (
        <div className="glass mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl px-3 py-2 ring-1 ring-sky-500/25">
            <FlaskIcon weight="fill" className="size-4 shrink-0 text-sky-600 dark:text-sky-300" />
            <p className="min-w-0 flex-1 text-meta text-ink dark:text-white">
                <span className="font-semibold">{t('demo.banner')}</span>
                <span className="text-ink-soft dark:text-slate-400"> · {t('demo.bannerSub')}</span>
            </p>
            <Button size="sm" variant="secondary" icon={TrashIcon} className="shrink-0" onClick={demo.clear}>
                {t('demo.clear')}
            </Button>
        </div>
    );
}
