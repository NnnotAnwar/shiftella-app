import { useState } from 'react';
import { HandshakeIcon, NotePencilIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useShiftContext } from '@features/shifts/ShiftContext';
import { Button } from '@shared/components/Button';
import { Textarea } from '@shared/components/Input';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { formatTime } from '@shared/utils/date';
import { NOTE_MAX, canStillEdit, cleanNoteBody, noteTargetShift, type ShiftNote } from './types';
import { useNotesForShifts, useShiftNoteMutations } from './useShiftNotes';

/**
 * --- SHIFT NOTE CARD (dashboard) ---
 * Your note on the shift you're on — or, for a while after clocking out, on the
 * one you just ended: "milk delivery came, coffee machine descaled". Tick "for
 * the next shift" and it becomes a handover the next people at the location see.
 *
 * A slim row until you tap "Add note"; the form opens inline (no modal). Your
 * notes can be fixed or removed for 15 minutes; removing is one tap + Undo.
 */
export function ShiftNoteCard() {
    const { user } = useAuthContext();
    const { activeShift, userShifts } = useShiftContext();
    const t = useTranslation();
    const target = noteTargetShift(activeShift, userShifts);
    const shiftId = target?.shift.id ?? '';
    const { byShift } = useNotesForShifts(shiftId ? [shiftId] : [], !!user);
    const { add, edit, remove } = useShiftNoteMutations(user);

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ShiftNote | null>(null);
    const [body, setBody] = useState('');
    const [handover, setHandover] = useState(false);

    if (!user || !target || shiftId.startsWith('optimistic-')) return null;
    const notes = byShift.get(shiftId) ?? [];

    const reset = () => {
        setOpen(false);
        setEditing(null);
        setBody('');
        setHandover(false);
    };
    const startEdit = (n: ShiftNote) => {
        setEditing(n);
        setBody(n.body);
        setHandover(n.handover);
        setOpen(true);
    };
    const clean = cleanNoteBody(body);
    const busy = add.isPending || edit.isPending;
    const save = () => {
        if (!clean || busy) return;
        const input = { body: clean, handover };
        if (editing) edit.mutate({ id: editing.id, input }, { onSuccess: reset });
        else add.mutate({ shiftId, input }, { onSuccess: reset });
    };

    const title = target.ended
        ? t('notes.lastShiftTitle', { time: formatTime(target.shift.ended_at) })
        : t('notes.title');

    return (
        <section aria-label={title} className="glass mb-3 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                    <NotePencilIcon weight="duotone" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-eyebrow text-ink-soft dark:text-slate-400">{title}</p>
                    {!open && notes.length === 0 && (
                        <p className="mt-0.5 truncate text-meta text-ink-soft dark:text-slate-400">{t('notes.hint')}</p>
                    )}
                </div>
                {!open && (
                    <Button
                        size="sm"
                        variant="ghost"
                        icon={PlusIcon}
                        className="shrink-0"
                        aria-label={t('notes.add')}
                        title={t('notes.add')}
                        onClick={() => setOpen(true)}
                    >
                        {/* Phones get the bare "+" so the title + hint keep their width. */}
                        <span className="hidden sm:inline">{t('notes.add')}</span>
                    </Button>
                )}
            </div>

            {notes.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                    {notes.map((n) => (
                        <li key={n.id} className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="whitespace-pre-line break-words text-meta text-ink dark:text-white">{n.body}</p>
                                <p className="mt-0.5 flex items-center gap-1 text-caption text-ink-soft dark:text-slate-400">
                                    {formatTime(n.created_at)}
                                    {n.handover && (
                                        <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 dark:text-amber-300">
                                            · <HandshakeIcon weight="bold" className="size-3" /> {t('notes.handoverBadge')}
                                        </span>
                                    )}
                                </p>
                            </div>
                            {canStillEdit(n) && editing?.id !== n.id && (
                                <div className="flex shrink-0 items-center">
                                    <IconAction label={t('common.edit')} onClick={() => startEdit(n)} icon={PencilSimpleIcon} />
                                    <IconAction label={t('common.delete')} onClick={() => remove(n)} icon={TrashIcon} danger />
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {open && (
                <form
                    className="mt-2 space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        save();
                    }}
                >
                    <Textarea
                        autoFocus
                        rows={2}
                        maxLength={NOTE_MAX}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
                            if (e.key === 'Escape') reset();
                        }}
                        placeholder={t('notes.placeholder')}
                        aria-label={t('notes.title')}
                        className="resize-none text-meta"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-meta text-ink dark:text-slate-200">
                            <input
                                type="checkbox"
                                checked={handover}
                                onChange={(e) => setHandover(e.target.checked)}
                                className="size-4 shrink-0 accent-emerald-600"
                            />
                            {t('notes.forNextShift')}
                        </label>
                        <Button type="button" size="sm" variant="ghost" onClick={reset}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" size="sm" loading={busy} disabled={!clean}>
                            {t('common.save')}
                        </Button>
                    </div>
                </form>
            )}
        </section>
    );
}

function IconAction({
    label,
    onClick,
    icon: Icon,
    danger,
}: {
    label: string;
    onClick: () => void;
    icon: typeof TrashIcon;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`flex size-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 dark:text-slate-400 dark:hover:bg-white/5 ${
                danger ? 'hover:text-rose-600 dark:hover:text-rose-400' : 'hover:text-ink dark:hover:text-white'
            }`}
        >
            <Icon weight="bold" className="size-3.5" />
        </button>
    );
}
