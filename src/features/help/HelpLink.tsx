import { lazy, Suspense, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { QuestionIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { HelpArticleId } from './types';

const HelpDialog = lazy(() => import('./HelpDialog'));

/**
 * --- HELP LINK ---
 * A quiet (?) next to a screen's title. Tapping it opens that one article in
 * a dialog — the reader stays where they are — with a way on to the whole
 * help centre. Never opens by itself. The article texts load on first tap.
 *
 *   <HelpLink article="rota-plan" />
 */
export function HelpLink({ article, className = '' }: { article: HelpArticleId; className?: string }) {
    const t = useTranslation();
    const [open, setOpen] = useState(false);
    const label = t('help.title');

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={label}
                aria-haspopup="dialog"
                title={label}
                data-help-link={article}
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-soft/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-300 ${className}`}
            >
                <QuestionIcon weight="bold" className="size-4" />
            </button>
            <Suspense fallback={null}>
                <AnimatePresence>{open && <HelpDialog article={article} onClose={() => setOpen(false)} />}</AnimatePresence>
            </Suspense>
        </>
    );
}
