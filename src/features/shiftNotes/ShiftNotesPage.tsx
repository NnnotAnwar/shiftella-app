import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HandshakeIcon, NotePencilIcon, TrashIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useShiftContext } from '@features/shifts/ShiftContext';
import { can } from '@shared/auth/permissions';
import { DatePicker } from '@shared/components/DatePicker';
import { PageHeader } from '@shared/components/PageHeader';
import { Select } from '@shared/components/Select';
import { Skeleton } from '@shared/components/Skeleton';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { formatTime } from '@shared/utils/date';
import { shiftNoteService, toDayKey } from './shiftNoteService';
import { canStillEdit, noteAuthorName, type ShiftNote } from './types';
import { shiftNoteKeys, useShiftNoteMutations } from './useShiftNotes';

/**
 * --- SHIFT NOTES PAGE (/notes) ---
 * Whoever can read timesheets reads every note of a day, optionally for one
 * location: handovers and the notes meant only for managers. Removing one is a
 * single tap with Undo (timesheets 'delete', or the author within 15 minutes).
 */
export function ShiftNotesPage() {
    const { user } = useAuthContext();
    if (user && !can(user, 'timesheets.view')) return <Navigate to="/" replace />;
    return <ShiftNotesInner />;
}

function ShiftNotesInner() {
    const { user } = useAuthContext();
    const { locations } = useShiftContext();
    const t = useTranslation();
    const [day, setDay] = useState(() => toDayKey(new Date()));
    const [locationId, setLocationId] = useState('');
    const { remove } = useShiftNoteMutations(user);
    const orgId = user?.organization_id ?? '';

    const q = useQuery({
        queryKey: shiftNoteKeys.day(orgId, day, locationId || null),
        queryFn: () => shiftNoteService.forDay(orgId, day, locationId || null),
        enabled: !!user,
    });
    const notes = q.data ?? [];
    const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? t('common.unknown');
    const mayDelete = (n: ShiftNote) =>
        !!user && (can(user, 'timesheets.delete') || (n.author_id === user.id && canStillEdit(n)));

    return (
        <div className="space-y-3 px-1 pb-10">
            <PageHeader
                eyebrow={t('admin.administration')}
                title={t('notes.pageTitle')}
                description={t('notes.pageHint')}
            />

            <div className="grid gap-2 sm:grid-cols-[14rem_14rem]">
                <DatePicker value={day} onChange={setDay} aria-label={t('notes.day')} />
                <Select size="sm" fullWidth value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label={t('notes.location')}>
                    <option value="">{t('announcements.allLocations')}</option>
                    {locations
                        .filter((l) => !l.archived_at)
                        .map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                </Select>
            </div>

            {q.isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                </div>
            ) : q.isError ? (
                <p className="glass rounded-xl px-3 py-4 text-center text-meta text-rose-600 dark:text-rose-400">{t('notes.error')}</p>
            ) : notes.length === 0 ? (
                <div className="glass flex flex-col items-center rounded-xl px-4 py-8 text-center">
                    <NotePencilIcon weight="duotone" className="mb-2 size-6 text-emerald-600 dark:text-emerald-300" />
                    <p className="text-body-strong text-ink dark:text-white">{t('notes.emptyDay')}</p>
                    <p className="mt-1 max-w-xs text-caption text-ink-soft dark:text-slate-400">{t('notes.emptyDayHint')}</p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {notes.map((n) => (
                        <li key={n.id} className="glass flex items-start gap-2.5 rounded-xl px-3 py-2.5">
                            <span
                                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                                    n.handover
                                        ? 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
                                        : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
                                }`}
                            >
                                {n.handover ? <HandshakeIcon weight="duotone" className="size-4" /> : <NotePencilIcon weight="duotone" className="size-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-ink-soft dark:text-slate-400">
                                    <span className="font-semibold text-ink dark:text-white">{noteAuthorName(n)}</span>
                                    <span>· {formatTime(n.created_at)}</span>
                                    <span className="truncate">· {locationName(n.location_id)}</span>
                                    {n.handover && (
                                        <span className="font-semibold text-amber-700 dark:text-amber-300">· {t('notes.handoverBadge')}</span>
                                    )}
                                </p>
                                <p className="mt-0.5 whitespace-pre-line break-words text-meta text-ink dark:text-white">{n.body}</p>
                            </div>
                            {mayDelete(n) && (
                                <button
                                    type="button"
                                    onClick={() => remove(n)}
                                    aria-label={t('common.delete')}
                                    title={t('common.delete')}
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-rose-400"
                                >
                                    <TrashIcon weight="bold" className="size-3.5" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
