import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@features/auth/AuthContext';
import { isSuperAdmin } from '@shared/auth/permissions';
import { toast } from '@shared/toast/toastStore';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { feedbackService, type FeedbackRow, type InboxFilters } from './feedbackService';
import type { FeedbackStatus } from './feedbackLogic';

export const feedbackKeys = {
    all: ['feedback'] as const,
    inbox: (f: InboxFilters) => ['feedback', 'inbox', f.kind, f.status] as const,
    newCount: ['feedback', 'new-count'] as const,
};

/** Only the platform Superadmin reads everyone's feedback. */
export function useIsFeedbackAdmin(): boolean {
    const { user } = useAuthContext();
    return !!user && isSuperAdmin(user);
}

export function useFeedbackInbox(filters: InboxFilters) {
    const enabled = useIsFeedbackAdmin();
    return useQuery({ queryKey: feedbackKeys.inbox(filters), queryFn: () => feedbackService.inbox(filters), enabled });
}

/** Unread feedback for the nav badge (Superadmin only; 0 for everyone else, no request). */
export function useNewFeedbackCount(): number {
    const enabled = useIsFeedbackAdmin();
    const q = useQuery({ queryKey: feedbackKeys.newCount, queryFn: () => feedbackService.countNew(), enabled, staleTime: 60_000 });
    return enabled ? (q.data ?? 0) : 0;
}

/** Optimistic status change: the row updates at once, rolls back on error. */
export function useSetFeedbackStatus() {
    const qc = useQueryClient();
    const t = useTranslation();
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) => feedbackService.setStatus(id, status),
        onMutate: async ({ id, status }) => {
            await qc.cancelQueries({ queryKey: [...feedbackKeys.all, 'inbox'] });
            const prev = qc.getQueriesData<FeedbackRow[]>({ queryKey: [...feedbackKeys.all, 'inbox'] });
            for (const [key, rows] of prev) {
                if (rows) qc.setQueryData<FeedbackRow[]>(key, rows.map((r) => (r.id === id ? { ...r, status } : r)));
            }
            return { prev };
        },
        onError: (_e, _v, ctx) => {
            for (const [key, rows] of ctx?.prev ?? []) qc.setQueryData(key, rows);
            toast(t('common.actionFailedRetry'), 'error');
        },
        onSettled: () => qc.invalidateQueries({ queryKey: feedbackKeys.all }),
    });
}
