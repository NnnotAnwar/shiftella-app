import type { ReactNode } from 'react';
import { ChatCircleTextIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { openFeedback } from './feedbackSignal';
import type { FeedbackKind } from './feedbackLogic';

/**
 * A quiet "Send feedback" link for any screen (help centre, empty states, an
 * error page). Opens the shared dialog via `openFeedback()`; the dialog itself
 * lives in the app shell (`<FeedbackHost />`).
 *
 *   <SendFeedbackLink />                         // "Send feedback"
 *   <SendFeedbackLink kind="bug">Report a problem</SendFeedbackLink>
 */
export function SendFeedbackLink({ kind, children, className = '' }: { kind?: FeedbackKind; children?: ReactNode; className?: string }) {
    const t = useTranslation();
    return (
        <button
            type="button"
            onClick={() => openFeedback({ kind })}
            className={`inline-flex items-center gap-1.5 text-meta font-semibold text-emerald-700 hover:underline dark:text-emerald-300 ${className}`}
        >
            <ChatCircleTextIcon weight="bold" className="size-3.5 shrink-0" />
            {children ?? t('feedback.open')}
        </button>
    );
}
