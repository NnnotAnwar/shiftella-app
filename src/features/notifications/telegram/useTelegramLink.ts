import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { useAuthContext } from '@features/auth/AuthContext';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import { telegramService, telegramStartUrl, type TelegramLink, type TelegramLinkPrefs } from './telegramService';

export const telegramKeys = { link: (userId: string) => ['telegram', 'link', userId] as const };

/** A link code lives 10 minutes; we poll for the bot to consume it no longer than that. */
const WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 2500;

/**
 * The current user's Telegram link + actions. `connect()` asks for a one-time
 * code and opens t.me/<bot>?start=<code>; the bot links the chat and we poll
 * (and refetch on focus) until the link shows up or the code expires.
 */
export function useTelegramLink(bot: string) {
    const { user } = useAuthContext();
    const t = useTranslation();
    const qc = useQueryClient();
    const userId = user?.id ?? '';
    const key = telegramKeys.link(userId);
    const [waitUntil, setWaitUntil] = useState<number | null>(null);
    const waitRef = useRef<number | null>(null);
    // Web, popup blocked: show the link to tap instead of navigating away.
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

    const startWait = useCallback(() => {
        waitRef.current = Date.now() + WAIT_MS;
        setWaitUntil(waitRef.current);
    }, []);
    const stopWait = useCallback(() => {
        waitRef.current = null;
        setWaitUntil(null);
        setFallbackUrl(null);
    }, []);

    const query = useQuery({
        queryKey: key,
        queryFn: async () => {
            const found = await telegramService.getLink(userId);
            // While waiting: linked → done; code expired → stop polling quietly.
            if (waitRef.current !== null) {
                if (found) {
                    stopWait();
                    toast(t('settings.telegram.connected'), 'success');
                } else if (Date.now() > waitRef.current) {
                    stopWait();
                }
            }
            return found;
        },
        enabled: !!userId,
        staleTime: 30_000,
        refetchInterval: waitUntil ? POLL_MS : false,
    });
    const link = query.data ?? null;

    const [connecting, setConnecting] = useState(false);
    const connect = useCallback(async () => {
        if (!bot || connecting) return;
        const native = Capacitor.isNativePlatform();
        // Open the tab synchronously (inside the click) so popup blockers allow it.
        const win = native ? null : window.open('', '_blank');
        setConnecting(true);
        try {
            const url = telegramStartUrl(bot, await telegramService.createLinkCode());
            if (native) {
                // Capacitor hands non-app hosts to the OS → the Telegram app (or browser).
                window.location.assign(url);
            } else if (win) {
                win.opener = null;
                win.location.href = url;
            } else {
                setFallbackUrl(url);
            }
            startWait();
        } catch (err) {
            win?.close();
            const plan = /plan_required/.test(String((err as { message?: unknown })?.message ?? ''));
            if (plan) toast(t('billing.partOf', { plan: t('billing.plan.team') }), 'info');
            else toast(t('settings.telegram.error'), 'error');
        } finally {
            setConnecting(false);
        }
    }, [bot, connecting, t, startWait]);

    const updateMut = useMutation({
        mutationFn: (patch: Partial<TelegramLinkPrefs>) => telegramService.updatePrefs(userId, patch),
        onMutate: async (patch) => {
            await qc.cancelQueries({ queryKey: key });
            const prev = qc.getQueryData<TelegramLink | null>(key);
            if (prev) qc.setQueryData<TelegramLink | null>(key, { ...prev, ...patch });
            return { prev };
        },
        onError: (_e, _p, ctx) => {
            qc.setQueryData(key, ctx?.prev ?? null);
            toast(t('settings.telegram.error'), 'error');
        },
    });

    const unlinkMut = useMutation({
        mutationFn: () => telegramService.unlink(userId),
        onSuccess: () => {
            qc.setQueryData(key, null);
            toast(t('settings.telegram.disconnected'), 'success');
        },
        onError: () => toast(t('settings.telegram.error'), 'error'),
    });

    return {
        link,
        isLoading: query.isLoading,
        connect,
        connecting,
        waiting: waitUntil !== null && !link,
        fallbackUrl,
        cancelWait: stopWait,
        update: updateMut.mutate,
        unlink: unlinkMut.mutate,
        unlinking: unlinkMut.isPending,
    };
}
