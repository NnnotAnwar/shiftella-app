import { Link } from 'react-router-dom';
import { useAuthContext } from '@features/auth/AuthContext';
import { Modal } from '@features/admin/components/Modal';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { helpArticle } from './articles';
import { HelpArticleBody } from './HelpArticleBody';
import { isFor } from './helpLogic';
import type { HelpArticleId } from './types';

/**
 * One help article in a dialog, opened from a <HelpLink>. Its own chunk, so
 * the article texts never weigh on the screens that carry a (?).
 */
export default function HelpDialog({ article, onClose }: { article: HelpArticleId; onClose: () => void }) {
    const { user } = useAuthContext();
    const { language, t } = usePreferences();
    const a = helpArticle(article);
    if (!a) return null;
    const c = a.content[language];

    return (
        <Modal title={t('help.title')} onClose={onClose}>
            <div className="space-y-3">
                <div>
                    <h3 className="text-heading text-ink dark:text-white">{c.title}</h3>
                    <p className="mt-0.5 text-caption text-ink-soft dark:text-slate-400">{c.summary}</p>
                </div>
                <HelpArticleBody article={a} forYou={isFor(user, a.audience)} onNavigate={onClose} />
                <div className="border-t border-ink/6 pt-2.5 dark:border-white/6">
                    <Link
                        to={`/help?a=${a.id}`}
                        onClick={onClose}
                        className="text-caption font-semibold text-ink-soft hover:text-ink hover:underline underline-offset-2 dark:text-slate-400 dark:hover:text-white"
                    >
                        {t('help.allArticles')}
                    </Link>
                </div>
            </div>
        </Modal>
    );
}
