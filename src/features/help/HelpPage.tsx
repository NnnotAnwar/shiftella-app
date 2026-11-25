import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CaretDownIcon, LifebuoyIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { PageHeader } from '@shared/components/PageHeader';
import { SearchInput } from '@shared/components/SearchInput';
import { BASE, SIZES, VARIANTS } from '@shared/components/buttonStyles';
import { HELP_EMAIL } from '@shared/brand';
import { HELP_ARTICLES, isHelpArticleId } from './articles';
import { HelpArticleBody } from './HelpArticleBody';
import { arrange, isFor, searchArticles, type ArrangedArticle } from './helpLogic';
import { HELP_TOPICS } from './topics';
import type { HelpArticle, HelpArticleId } from './types';

/**
 * --- HELP CENTRE (/help) ---
 * Short how-to articles grouped by topic, the reader's own first (an
 * employee sees "For managers" articles last, flagged); a diacritics-blind
 * search over the reader's language; one article open at a time, kept in
 * the URL (`?a=rota-plan`) so a <HelpLink> or a shared link opens it.
 */
export function HelpPage() {
    const { user } = useAuthContext();
    const { language, t } = usePreferences();
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const param = params.get('a');
    const openId: HelpArticleId | null = isHelpArticleId(param) ? param : null;

    const forYou = useCallback((a: HelpArticle) => isFor(user, a.audience), [user]);
    const groups = useMemo(() => arrange(HELP_ARTICLES, forYou), [forYou]);
    const results = useMemo(() => searchArticles(HELP_ARTICLES, query, language, t, forYou), [query, language, t, forYou]);
    const searching = query.trim().length > 0;

    const toggle = (id: HelpArticleId) =>
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (id === openId) next.delete('a');
                else next.set('a', id);
                return next;
            },
            { replace: true },
        );

    // A deep link (?a=…) scrolls its article into view once, on arrival — a
    // frame later, after the shell's own scroll-to-top on navigation.
    const arrived = useRef(openId);
    useEffect(() => {
        const id = arrived.current;
        if (!id) return;
        const raf = requestAnimationFrame(() => {
            arrived.current = null;
            document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'center' });
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    const topicLabel = (a: HelpArticle) => t(HELP_TOPICS.find((x) => x.id === a.topic)!.labelKey);
    const mailto = `mailto:${HELP_EMAIL}?subject=${encodeURIComponent(t('settings.supportSubject'))}`;

    return (
        <div className="mx-auto max-w-3xl space-y-4 px-1 pb-10">
            <PageHeader eyebrow={t('help.eyebrow')} title={t('help.title')} description={t('help.description')} />

            <SearchInput value={query} onChange={setQuery} placeholder={t('help.search')} className="sm:max-w-sm" inputClassName="h-9" />

            {searching ? (
                results.length > 0 ? (
                    <ArticleList items={results} openId={openId} onToggle={toggle} topicLabel={topicLabel} />
                ) : (
                    <p className="glass rounded-2xl px-4 py-6 text-center text-meta text-ink-soft dark:text-slate-400">
                        {t('help.noResults', { q: query.trim() })}
                    </p>
                )
            ) : (
                groups.map((g) => (
                    <section key={g.topic} aria-labelledby={`help-topic-${g.topic}`} className="space-y-1.5">
                        <h2 id={`help-topic-${g.topic}`} className="px-1 text-eyebrow text-ink-soft dark:text-slate-400">
                            {t(g.labelKey)}
                        </h2>
                        <ArticleList items={g.articles} openId={openId} onToggle={toggle} />
                    </section>
                ))
            )}

            {/* CONTACT — the way out when an article doesn't answer it. */}
            <footer className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-soft dark:bg-white/6 dark:text-slate-400">
                    <LifebuoyIcon weight="bold" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-meta font-semibold text-ink dark:text-white">{t('help.contactTitle')}</p>
                    <p className="text-caption text-ink-soft dark:text-slate-400">
                        {t('help.contactHint')} <span className="font-medium text-ink dark:text-slate-200">{HELP_EMAIL}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* TODO(feat/in-app-feedback): put the "Send feedback" button here, next to the email link,
                        once that branch lands — it is being built separately; don't duplicate it. */}
                    {/* Same-context mailto (no target=_blank): a blank tab hangs in the native webview. */}
                    <a href={mailto} className={`${BASE} ${SIZES.sm} ${VARIANTS.secondary}`}>
                        {t('help.contactButton')}
                    </a>
                </div>
            </footer>
        </div>
    );
}

function ArticleList({
    items,
    openId,
    onToggle,
    topicLabel,
}: {
    items: ArrangedArticle[];
    openId: HelpArticleId | null;
    onToggle: (id: HelpArticleId) => void;
    /** Search results come from every topic — show which. */
    topicLabel?: (a: HelpArticle) => string;
}) {
    return (
        <ul className="glass divide-y divide-ink/5 overflow-hidden rounded-2xl dark:divide-white/6">
            {items.map((item) => (
                <ArticleRow key={item.article.id} item={item} open={openId === item.article.id} onToggle={onToggle} topic={topicLabel?.(item.article)} />
            ))}
        </ul>
    );
}

function ArticleRow({ item, open, onToggle, topic }: { item: ArrangedArticle; open: boolean; onToggle: (id: HelpArticleId) => void; topic?: string }) {
    const { language, t } = usePreferences();
    const { article, forYou } = item;
    const c = article.content[language];
    const bodyId = `help-body-${article.id}`;

    return (
        <li id={`help-${article.id}`} className="scroll-mt-20">
            <button
                type="button"
                onClick={() => onToggle(article.id)}
                aria-expanded={open}
                aria-controls={open ? bodyId : undefined}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/60 dark:hover:bg-white/5"
            >
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`text-meta font-semibold ${forYou ? 'text-ink dark:text-white' : 'text-ink-soft dark:text-slate-300'}`}>{c.title}</span>
                        {!forYou && (
                            <span className="rounded-full bg-ink/5 px-1.5 py-px text-caption font-semibold text-ink-soft dark:bg-white/8 dark:text-slate-400">
                                {t('help.forManagers')}
                            </span>
                        )}
                        {topic && <span className="text-caption text-ink-soft/80 dark:text-slate-500">{topic}</span>}
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-soft dark:text-slate-400">{c.summary}</span>
                </span>
                <CaretDownIcon
                    weight="bold"
                    aria-hidden
                    className={`mt-1 size-3.5 shrink-0 text-ink-soft/70 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <div id={bodyId} className="px-3.5 pb-3.5 pt-0.5">
                    <HelpArticleBody article={article} forYou={forYou} />
                </div>
            )}
        </li>
    );
}
