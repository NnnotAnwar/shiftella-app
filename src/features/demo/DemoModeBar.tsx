import { FlaskIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { buttonClass } from '@shared/components/buttonStyles';
import { IS_DEMO_BUILD } from '@shared/demoBuild';
import { useTranslation } from '@shared/preferences/PreferencesContext';

/**
 * --- DEMO MODE BAR (public demo build only) ---
 * At shiftella.app/demo/ the whole app runs on an in-memory copy of a sample
 * café. One slim line says so — nothing is saved, closing the page wipes it —
 * and leads to the real sign-up. Renders nothing (and is compiled out) elsewhere.
 */
export function DemoModeBar() {
    const t = useTranslation();
    if (!IS_DEMO_BUILD) return null;
    return (
        <div role="status" className="glass mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl px-3 py-2 ring-1 ring-sky-500/25">
            <FlaskIcon weight="fill" aria-hidden="true" className="size-4 shrink-0 text-sky-600 dark:text-sky-300" />
            <p className="min-w-0 flex-1 text-meta text-ink dark:text-white">
                <span className="font-semibold">{t('demo.modeTitle')}</span>
                <span className="text-ink-soft dark:text-slate-400"> · {t('demo.modeSub')}</span>
            </p>
            {/* Leaves the demo build for the real app's sign-up — a full page load. */}
            <a href="/signup" className={`${buttonClass({ variant: 'primary', size: 'sm' })} shrink-0`}>
                {t('demo.modeSignUp')}
                <ArrowRightIcon weight="bold" aria-hidden="true" className="size-3.5" />
            </a>
        </div>
    );
}
