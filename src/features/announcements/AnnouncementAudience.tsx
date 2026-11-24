import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, EyeIcon, MapPinIcon, UsersThreeIcon, CircleIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { announcementService } from './announcementService';
import type { AnnouncementReach } from './types';

/**
 * --- ANNOUNCEMENT AUDIENCE ---
 * Who an announcement is for: a location (its roster), a role, both, or the
 * whole organization. The database enforces it — only the audience sees the
 * notice and gets the push / Telegram message. Posters see "N people will see
 * it" while composing and "read 5 / 8" (with names) on each card.
 */

interface Option {
    id: string;
    name: string;
}

const selectClass =
    'text-meta h-9 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500/40 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white';

/** Two compact selects + the live audience size. */
export function AudiencePicker({
    locations,
    roles,
    locationId,
    roleId,
    onChange,
}: {
    locations: Option[];
    roles: Option[];
    locationId: string | null;
    roleId: string | null;
    onChange: (next: { locationId: string | null; roleId: string | null }) => void;
}) {
    const t = useTranslation();
    const size = useQuery({
        queryKey: ['announcement-audience', locationId, roleId],
        queryFn: () => announcementService.audienceSize(locationId, roleId),
        staleTime: 30_000,
    });

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
                <label className="flex min-w-[9rem] flex-1 items-center gap-1.5">
                    <MapPinIcon className="size-4 shrink-0 text-gray-400" aria-hidden />
                    <span className="sr-only">{t('announcements.audienceLocation')}</span>
                    <select
                        value={locationId ?? ''}
                        onChange={(e) => onChange({ locationId: e.target.value || null, roleId })}
                        className={selectClass}
                        aria-label={t('announcements.audienceLocation')}
                    >
                        <option value="">{t('announcements.allLocations')}</option>
                        {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-[9rem] flex-1 items-center gap-1.5">
                    <UsersThreeIcon className="size-4 shrink-0 text-gray-400" aria-hidden />
                    <span className="sr-only">{t('announcements.audienceRole')}</span>
                    <select
                        value={roleId ?? ''}
                        onChange={(e) => onChange({ locationId, roleId: e.target.value || null })}
                        className={selectClass}
                        aria-label={t('announcements.audienceRole')}
                    >
                        <option value="">{t('announcements.allRoles')}</option>
                        {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <p className="text-caption px-0.5 text-gray-500 dark:text-gray-400" aria-live="polite">
                {size.data === undefined
                    ? ' '
                    : size.data === 0
                      ? t('announcements.audienceNobody')
                      : t('announcements.audienceSize', { n: size.data })}
            </p>
        </div>
    );
}

/** "📍 U Mostu · Kuchař" on a card; nothing for a whole-organization notice. */
export function AudienceLabel({ locationName, roleName }: { locationName?: string | null; roleName?: string | null }) {
    if (!locationName && !roleName) return null;
    return (
        <span className="text-micro inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
            {locationName ? <MapPinIcon weight="fill" className="size-3" aria-hidden /> : <UsersThreeIcon weight="fill" className="size-3" aria-hidden />}
            {[locationName, roleName].filter(Boolean).join(' · ')}
        </span>
    );
}

/** Posters: "👁 5 / 8" — tap for who has (✓) and hasn't (○) read it. */
export function ReachButton({ id, reach }: { id: string; reach: AnnouncementReach | undefined }) {
    const t = useTranslation();
    const [open, setOpen] = useState(false);
    const readers = useQuery({
        queryKey: ['announcement-readers', id],
        queryFn: () => announcementService.readers(id),
        enabled: open,
        staleTime: 15_000,
    });
    if (!reach) return null;

    return (
        <div className="min-w-0">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((o) => !o);
                }}
                aria-expanded={open}
                title={t('announcements.readBy', { read: reach.readers, total: reach.audience })}
                className="text-micro inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
                <EyeIcon className="size-3.5" aria-hidden />
                <span>
                    {reach.readers} / {reach.audience}
                </span>
                <span className="sr-only">{t('announcements.readBy', { read: reach.readers, total: reach.audience })}</span>
            </button>
            {open && (
                <ul
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto rounded-xl bg-gray-50 p-2 dark:bg-white/4"
                    aria-label={t('announcements.readersTitle')}
                >
                    {readers.isLoading && <li className="text-caption text-gray-400">…</li>}
                    {readers.data?.length === 0 && <li className="text-caption text-gray-400">{t('announcements.audienceNobody')}</li>}
                    {readers.data?.map((r) => (
                        <li key={r.user_id} className="text-caption flex items-center gap-1.5">
                            {r.read_at ? (
                                <CheckIcon weight="bold" className="size-3.5 shrink-0 text-emerald-600" aria-label={t('announcements.read')} />
                            ) : (
                                <CircleIcon className="size-3.5 shrink-0 text-gray-300 dark:text-gray-600" aria-label={t('announcements.notRead')} />
                            )}
                            <span className={r.read_at ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}>{r.name || '—'}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
