import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LightbulbIcon, BugIcon, QuestionIcon, HeartIcon, PaperPlaneTiltIcon, type Icon } from '@phosphor-icons/react';
import { Modal } from '@features/admin/components/Modal';
import { Button } from '@shared/components/Button';
import { Textarea } from '@shared/components/Input';
import { FormError } from '@shared/components/FormError';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import type { TranslationKey } from '@shared/i18n/translations';
import { feedbackService } from './feedbackService';
import { subscribeOpenFeedback } from './feedbackSignal';
import {
    FEEDBACK_KINDS,
    FEEDBACK_MAX_LENGTH,
    KIND_LABEL,
    buildFeedbackContext,
    cleanMessage,
    feedbackErrorKey,
    type FeedbackKind,
} from './feedbackLogic';
import { feedbackKeys } from './useFeedback';

/**
 * --- SEND FEEDBACK ---
 * Type (idea / bug / question / praise), a message and an optional "you may
 * contact me". The page, app version, language and browser ride along (the
 * organization is added by the database). Sending closes the dialog with a
 * "Thanks" toast — nothing else pops up.
 */

const KIND_ICON: Record<FeedbackKind, Icon> = { idea: LightbulbIcon, bug: BugIcon, question: QuestionIcon, praise: HeartIcon };
const PLACEHOLDER: Record<FeedbackKind, TranslationKey> = {
    idea: 'feedback.ph.idea',
    bug: 'feedback.ph.bug',
    question: 'feedback.ph.question',
    praise: 'feedback.ph.praise',
};

export function FeedbackDialog({ initialKind = 'idea', onClose }: { initialKind?: FeedbackKind; onClose: () => void }) {
    const { t, language } = usePreferences();
    const { pathname } = useLocation();
    const qc = useQueryClient();
    const [kind, setKind] = useState<FeedbackKind>(initialKind);
    const [message, setMessage] = useState('');
    const [mayContact, setMayContact] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const send = useMutation({
        mutationFn: (text: string) =>
            feedbackService.submit({
                kind,
                message: text,
                may_contact: mayContact,
                ...buildFeedbackContext({
                    pathname,
                    language,
                    version: __APP_VERSION__,
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                }),
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: feedbackKeys.all });
            toast(t('feedback.thanks'), 'success');
            onClose();
        },
        onError: (e) => setError(t(feedbackErrorKey(e))),
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const text = cleanMessage(message);
        if (!text) return setError(t('feedback.empty'));
        send.mutate(text);
    };

    return (
        <Modal title={t('feedback.title')} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <div className="segmented w-full" role="radiogroup" aria-label={t('feedback.type')}>
                    {FEEDBACK_KINDS.map((id) => {
                        const Icon = KIND_ICON[id];
                        return (
                            <button
                                key={id}
                                type="button"
                                role="radio"
                                aria-checked={kind === id}
                                onClick={() => setKind(id)}
                                className={`flex flex-1 items-center justify-center gap-1 rounded-[9px] px-1.5 py-1 text-meta font-semibold transition-colors ${
                                    kind === id ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'
                                }`}
                            >
                                <Icon weight="bold" className="size-3.5 shrink-0" />
                                <span className="truncate">{t(KIND_LABEL[id])}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="feedback-message" className="text-label text-ink-soft dark:text-slate-400">
                        {t('feedback.message')}
                    </label>
                    <Textarea
                        id="feedback-message"
                        rows={4}
                        value={message}
                        maxLength={FEEDBACK_MAX_LENGTH}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={t(PLACEHOLDER[kind])}
                        autoFocus
                    />
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-ink/4 px-3 py-2 dark:bg-white/4">
                    <input type="checkbox" checked={mayContact} onChange={(e) => setMayContact(e.target.checked)} className="mt-0.5 size-4 accent-emerald-600" />
                    <span className="min-w-0">
                        <span className="block text-meta font-semibold text-ink dark:text-white">{t('feedback.mayContact')}</span>
                        <span className="block text-caption text-ink-soft dark:text-slate-400">{t('feedback.mayContactHint')}</span>
                    </span>
                </label>

                <p className="px-1 text-caption text-ink-soft dark:text-slate-400">{t('feedback.contextNote')}</p>

                <FormError message={error} />
                <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={send.isPending}>
                        {t('common.cancel')}
                    </Button>
                    <Button type="submit" size="sm" icon={PaperPlaneTiltIcon} loading={send.isPending}>
                        {t('feedback.send')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Mounted once in the app shell: renders the dialog whenever `openFeedback()`
 * is called from anywhere.
 */
export function FeedbackHost() {
    const [open, setOpen] = useState<{ kind: FeedbackKind } | null>(null);
    useEffect(() => subscribeOpenFeedback((opts) => setOpen({ kind: opts.kind ?? 'idea' })), []);
    const close = useCallback(() => setOpen(null), []);
    return <AnimatePresence>{open && <FeedbackDialog key="feedback" initialKind={open.kind} onClose={close} />}</AnimatePresence>;
}
