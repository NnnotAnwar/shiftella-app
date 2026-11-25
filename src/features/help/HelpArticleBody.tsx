import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRightIcon, LightbulbIcon } from '@phosphor-icons/react';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { asLabel, splitLabels } from './helpLogic';
import type { HelpArticle } from './types';

/** Article prose with its `{{key}}` UI labels shown in bold — the reader can spot the button. */
export function HelpRichText({ text }: { text: string }) {
    const { t } = usePreferences();
    return (
        <>
            {splitLabels(text, t).map((p, i) =>
                p.label ? (
                    <strong key={i} className="font-semibold text-ink dark:text-white">
                        {p.text}
                    </strong>
                ) : (
                    <Fragment key={i}>{p.text}</Fragment>
                ),
            )}
        </>
    );
}

/**
 * --- HELP ARTICLE BODY ---
 * Numbered steps, an optional tip and a "Go to …" link to the screen it is
 * about (only for readers who can open that screen, and not while on it). Shared by the /help page
 * and the contextual <HelpLink> dialog.
 */
export function HelpArticleBody({ article, forYou, onNavigate }: { article: HelpArticle; forYou: boolean; onNavigate?: () => void }) {
    const { language, t } = usePreferences();
    const { pathname } = useLocation();
    const c = article.content[language];
    // No "Go to Schedule" while already on the schedule (a <HelpLink> there).
    const showGoTo = !!article.route && !!article.routeLabel && forYou && article.route.split('?')[0] !== pathname;

    return (
        <div className="space-y-2.5">
            <ol className="space-y-1.5">
                {c.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-meta text-ink-soft dark:text-slate-300">
                        <span
                            aria-hidden
                            className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-micro text-emerald-700 tabular-nums dark:text-emerald-300"
                        >
                            {i + 1}
                        </span>
                        <span className="min-w-0">
                            <HelpRichText text={step} />
                        </span>
                    </li>
                ))}
            </ol>
            {c.tip && (
                <p className="flex gap-2 rounded-lg bg-amber-500/8 px-2.5 py-2 text-caption text-ink-soft dark:bg-amber-400/8 dark:text-slate-300">
                    <LightbulbIcon weight="fill" className="mt-px size-3.5 shrink-0 text-amber-500" aria-hidden />
                    <span>
                        <span className="sr-only">{t('help.tip')}: </span>
                        <HelpRichText text={c.tip} />
                    </span>
                </p>
            )}
            {showGoTo && (
                <Link
                    to={article.route!}
                    onClick={onNavigate}
                    className="inline-flex items-center gap-1 text-meta font-semibold text-emerald-700 hover:underline underline-offset-2 dark:text-emerald-300"
                >
                    {t('help.goTo', { page: asLabel(t(article.routeLabel!)) })}
                    <ArrowRightIcon weight="bold" className="size-3.5" />
                </Link>
            )}
        </div>
    );
}
