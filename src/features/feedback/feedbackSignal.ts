import type { FeedbackKind } from './feedbackLogic';

/**
 * --- "SEND FEEDBACK" SIGNAL ---
 * Opens the feedback dialog from anywhere (a settings row, the sidebar, the
 * help centre, a future error screen) without prop-drilling: `<FeedbackHost />`
 * in the app shell subscribes and renders the dialog.
 *
 *   import { openFeedback } from '@features/feedback/feedbackSignal';
 *   openFeedback({ kind: 'bug' });
 *
 * Returns false when no host is mounted (e.g. on a signed-out page), so the
 * caller can fall back (say, to the support e-mail).
 */

export interface OpenFeedbackOptions {
    /** Pre-selected type; defaults to "idea". */
    kind?: FeedbackKind;
}

type Listener = (opts: OpenFeedbackOptions) => void;
const listeners = new Set<Listener>();

export function openFeedback(opts: OpenFeedbackOptions = {}): boolean {
    if (listeners.size === 0) return false;
    listeners.forEach((l) => l(opts));
    return true;
}

export function subscribeOpenFeedback(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
