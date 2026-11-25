import { useState } from 'react';
import { CheckIcon, HandshakeIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useShiftContext } from '@features/shifts/ShiftContext';
import { Button } from '@shared/components/Button';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { formatTime } from '@shared/utils/date';
import { noteAuthorName } from './types';
import { useHandover } from './useShiftNotes';

/** Notes shown before "Show all". */
const PREVIEW = 3;

/**
 * --- HANDOVER CARD (dashboard) ---
 * While you're on shift: what the previous shift(s) at your location left "for
 * the next shift" in the last 24 h. Compact, inline, one-tap "Read" (Undo in the
 * toast) — and gone once read. Never a popup.
 */
export function HandoverCard() {
    const { user } = useAuthContext();
    const { activeShift, locations } = useShiftContext();
    const t = useTranslation();
    const [showAll, setShowAll] = useState(false);
    const { unread, markAllRead } = useHandover(user, activeShift?.location_id);

    if (!activeShift || unread.length === 0) return null;

    const locationName = locations.find((l) => l.id === activeShift.location_id)?.name;
    const shown = showAll ? unread : unread.slice(0, PREVIEW);
    const hidden = unread.length - shown.length;

    return (
        <section aria-label={t('notes.handoverTitle')} className="glass mb-3 rounded-xl px-3 py-2.5 ring-1 ring-amber-500/25">
            <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-300">
                    <HandshakeIcon weight="duotone" className="size-4" />
                </span>
                <p className="min-w-0 flex-1 truncate text-eyebrow text-ink-soft dark:text-slate-400">
                    {t('notes.handoverTitle')}
                    {/* Phones already show the location right above the card. */}
                    {locationName && <span className="hidden md:inline"> · {locationName}</span>}
                </p>
                <Button size="sm" variant="tonal" icon={CheckIcon} className="shrink-0" onClick={markAllRead}>
                    {t('notes.read')}
                </Button>
            </div>
            <ul className="mt-2 space-y-1.5">
                {shown.map((n) => (
                    <li key={n.id} className="min-w-0">
                        <p className="whitespace-pre-line break-words text-meta text-ink dark:text-white">{n.body}</p>
                        <p className="mt-0.5 text-caption text-ink-soft dark:text-slate-400">
                            {noteAuthorName(n)} · {formatTime(n.created_at)}
                        </p>
                    </li>
                ))}
            </ul>
            {hidden > 0 && (
                <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="mt-1.5 text-caption font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                >
                    {t('notes.showAll', { n: unread.length })}
                </button>
            )}
        </section>
    );
}
