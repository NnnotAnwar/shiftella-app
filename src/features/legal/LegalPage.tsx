import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { legalContent, type LegalDoc } from './legalContent';

const text = 'text-body text-gray-600 dark:text-gray-300 leading-relaxed';

/**
 * --- LEGAL PAGE ---
 * Standalone, public page rendering the Privacy Policy or Terms of Service in
 * the user's language (or its base language when there is no translation).
 * Reached from Settings and the landing footer (and linkable for app stores).
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
    const navigate = useNavigate();
    const { language, t } = usePreferences();
    const content = legalContent(doc, language);

    const goBack = () => {
        // Back if we have history, otherwise fall back to Settings.
        if (window.history.length > 1) navigate(-1);
        else navigate('/settings');
    };

    return (
        <div className="relative min-h-dvh">
            {/* Sticky header with back */}
            <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 pt-[env(safe-area-inset-top,0px)]">
                <button
                    onClick={goBack}
                    aria-label={t('common.back')}
                    className="-ml-2 p-2 rounded-xl text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-all"
                >
                    <ArrowLeftIcon weight="bold" className="w-5 h-5" />
                </button>
                <h1 className="text-title text-gray-900 dark:text-white truncate">{content.title}</h1>
            </header>

            <div className="mx-auto max-w-2xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                <p className="text-micro text-gray-400">{content.updated}</p>
                <p className="mt-3 text-body text-gray-600 dark:text-gray-300 leading-relaxed">{content.intro}</p>

                <div className="mt-6 space-y-6">
                    {content.sections.map((s, i) => (
                        <section key={i} className="space-y-1.5">
                            <h2 className="text-body-strong text-gray-900 dark:text-white">
                                <span className="tabular-nums text-gray-400">{i + 1}.</span> {s.h}
                            </h2>
                            <p className={text}>{s.p}</p>
                            {s.items && (
                                <ul className="list-disc space-y-1 pl-5 marker:text-gray-300 dark:marker:text-gray-600">
                                    {s.items.map((item, j) => (
                                        <li key={j} className={text}>{item}</li>
                                    ))}
                                </ul>
                            )}
                            {s.note && <p className={text}>{s.note}</p>}
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
