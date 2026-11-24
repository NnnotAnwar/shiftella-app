import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSuperAdmin, rankOf, RANK } from '@shared/auth/permissions';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import type { Profile, User } from '@shared/types';
import { demoLang, demoService } from './demoService';

export const demoKeys = { batch: (orgId: string) => ['demo-batch', orgId] as const };

/** Only the organization's owner (Head Admin) may add or remove demo data. */
export function canManageDemo(user: User | null | undefined): user is User {
    return !!user && !isSuperAdmin(user) && rankOf(user as Pick<Profile, 'role' | 'org_role'>) >= RANK.OWNER;
}

/** How long "Demo data removed" can still be undone before the server deletes it. */
export const CLEAR_UNDO_MS = 6000;

/**
 * --- useDemoData ---
 * Whether the org has demo data, plus one-tap add / remove with an Undo toast:
 * adding is instant (Undo removes it again); removing hides the banner at once
 * and only deletes on the server when the toast expires (Undo keeps it all).
 */
export function useDemoData(user: User | null | undefined) {
    const { t, language } = usePreferences();
    const qc = useQueryClient();
    const enabled = canManageDemo(user);
    const orgId = user?.organization_id ?? '';

    const batch = useQuery({
        queryKey: demoKeys.batch(orgId),
        enabled,
        staleTime: 60_000,
        queryFn: () => demoService.fetchBatch(orgId),
    });

    // Demo rows touch nearly every screen: refetch everything.
    const refreshAll = () => qc.invalidateQueries();

    // Plain promise (not a mutation): it may run after the card that started it unmounted.
    const removeOnServer = () =>
        demoService
            .clear()
            .catch(() => toast(t('demo.error'), 'error'))
            .finally(refreshAll);

    const seed = useMutation({
        mutationFn: () => demoService.seed(demoLang(language)),
        onSuccess: async () => {
            await refreshAll();
            toast(t('demo.added'), 'success', {
                duration: CLEAR_UNDO_MS,
                action: { label: t('common.undo'), onClick: () => void removeOnServer() },
            });
        },
        onError: () => toast(t('demo.error'), 'error'),
    });

    /** Hide now; delete when the Undo window closes. */
    const clear = () => {
        const key = demoKeys.batch(orgId);
        const previous = qc.getQueryData<string | null>(key);
        qc.setQueryData(key, null);
        toast(t('demo.cleared'), 'success', {
            duration: CLEAR_UNDO_MS,
            action: { label: t('common.undo'), onClick: () => qc.setQueryData(key, previous ?? null) },
            onExpire: () => void removeOnServer(),
        });
    };

    return {
        enabled,
        active: enabled && !!batch.data,
        loaded: enabled && batch.isSuccess,
        seed: () => seed.mutate(),
        seeding: seed.isPending,
        clear,
    };
}
