import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@shared/toast/toastStore';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { User } from '@shared/types';
import { shiftNoteService } from './shiftNoteService';
import type { ShiftNote, ShiftNoteInput } from './types';

/** How long a "Note deleted" / "Marked as read" toast can be undone. */
export const NOTE_UNDO_MS = 5000;

export const shiftNoteKeys = {
    all: ['shift-notes'] as const,
    forShifts: (ids: string[]) => ['shift-notes', 'shifts', [...ids].sort().join(',')] as const,
    handover: (locationId: string, userId: string) => ['shift-notes', 'handover', locationId, userId] as const,
    day: (orgId: string, day: string, locationId: string | null) => ['shift-notes', 'day', orgId, day, locationId ?? 'all'] as const,
    reads: (userId: string, ids: string[]) => ['shift-notes', 'reads', userId, [...ids].sort().join(',')] as const,
};

/** Notes on these clock records, grouped by shift id. */
export function useNotesForShifts(shiftIds: string[], enabled = true) {
    const q = useQuery({
        queryKey: shiftNoteKeys.forShifts(shiftIds),
        queryFn: () => shiftNoteService.forShifts(shiftIds),
        enabled: enabled && shiftIds.length > 0,
        staleTime: 30_000,
    });
    const byShift = useMemo(() => {
        const map = new Map<string, ShiftNote[]>();
        for (const n of q.data ?? []) map.set(n.shift_id, [...(map.get(n.shift_id) ?? []), n]);
        return map;
    }, [q.data]);
    return { ...q, byShift };
}

/**
 * Add / edit / delete a note. Delete is one tap: the note disappears at once and
 * the server delete runs when the Undo toast expires (Undo keeps it).
 */
export function useShiftNoteMutations(user: User | null | undefined) {
    const qc = useQueryClient();
    const t = useTranslation();
    const refresh = () => qc.invalidateQueries({ queryKey: shiftNoteKeys.all });

    const add = useMutation({
        mutationFn: ({ shiftId, input }: { shiftId: string; input: ShiftNoteInput }) => {
            if (!user) throw new Error('signed out');
            return shiftNoteService.create(user, shiftId, input);
        },
        onSuccess: () => {
            toast(t('notes.saved'), 'success');
            void refresh();
        },
        onError: () => toast(t('notes.error'), 'error'),
    });

    const edit = useMutation({
        mutationFn: ({ id, input }: { id: string; input: ShiftNoteInput }) => shiftNoteService.update(id, input),
        onSuccess: () => void refresh(),
        onError: () => toast(t('notes.editClosed'), 'error'),
    });

    /** Hide now (every cached list), delete when the Undo window closes. */
    const remove = (note: ShiftNote) => {
        const snapshot = qc.getQueriesData<ShiftNote[]>({ queryKey: shiftNoteKeys.all });
        for (const [key, data] of snapshot) {
            if (Array.isArray(data) && data.some((n) => typeof n === 'object' && n?.id === note.id)) {
                qc.setQueryData<ShiftNote[]>(key, data.filter((n) => n.id !== note.id));
            }
        }
        toast(t('notes.deleted'), 'success', {
            duration: NOTE_UNDO_MS,
            action: {
                label: t('common.undo'),
                onClick: () => {
                    for (const [key, data] of snapshot) qc.setQueryData(key, data);
                },
            },
            onExpire: () =>
                void shiftNoteService
                    .remove(note.id)
                    .catch(() => toast(t('notes.error'), 'error'))
                    .finally(refresh),
        });
    };

    return { add, edit, remove };
}

/**
 * The dashboard's handover: notes for the next shift others left at this
 * location in the last 24 h that I haven't read yet, plus a one-tap "Read"
 * for all of them (Undo in the toast).
 */
export function useHandover(user: User | null | undefined, locationId: string | null | undefined) {
    const qc = useQueryClient();
    const t = useTranslation();
    const enabled = !!user && !!locationId;

    const notes = useQuery({
        queryKey: shiftNoteKeys.handover(locationId ?? '', user?.id ?? ''),
        queryFn: () => shiftNoteService.handover(locationId!, user!.id),
        enabled,
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
    });
    const ids = useMemo(() => (notes.data ?? []).map((n) => n.id), [notes.data]);
    const readsKey = shiftNoteKeys.reads(user?.id ?? '', ids);

    const reads = useQuery({
        queryKey: readsKey,
        queryFn: () => shiftNoteService.readIds(user!.id, ids),
        enabled: enabled && ids.length > 0,
    });

    const unread = useMemo(() => {
        if (!reads.isSuccess && ids.length > 0) return [];
        const seen = new Set(reads.data ?? []);
        return (notes.data ?? []).filter((n) => !seen.has(n.id));
    }, [notes.data, reads.data, reads.isSuccess, ids.length]);

    const markAllRead = () => {
        if (!user || unread.length === 0) return;
        const marked = unread.map((n) => n.id);
        const previous = qc.getQueryData<string[]>(readsKey) ?? [];
        qc.setQueryData<string[]>(readsKey, [...previous, ...marked]);
        shiftNoteService
            .markRead(user, marked)
            .then(() =>
                toast(t('notes.markedRead'), 'success', {
                    duration: NOTE_UNDO_MS,
                    action: {
                        label: t('common.undo'),
                        onClick: () => {
                            qc.setQueryData<string[]>(readsKey, previous);
                            void shiftNoteService.unmarkRead(user.id, marked).catch(() => toast(t('notes.error'), 'error'));
                        },
                    },
                }),
            )
            .catch(() => {
                qc.setQueryData<string[]>(readsKey, previous);
                toast(t('notes.error'), 'error');
            });
    };

    return { notes, unread, markAllRead };
}
