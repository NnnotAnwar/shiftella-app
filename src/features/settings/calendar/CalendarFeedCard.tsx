import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { AppleLogoIcon, ArrowsClockwiseIcon, CalendarPlusIcon, CopyIcon, GoogleLogoIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { ConfirmDialog } from '@features/admin/components/Modal';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { toast } from '@shared/toast/toastStore';
import { copyText } from '@shared/utils/clipboard';
import { calendarFeedService } from './calendarFeedService';
import { calendarLinks } from './calendarLinks';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

/**
 * --- CALENDAR SYNC ---
 * "Add to calendar": a private ICS link to the member's published shifts for
 * Google / Apple / Outlook. One tap turns it on; "Create new link" replaces
 * it (the old one stops working — hence the confirm, there's no undo).
 */
export function CalendarFeedCard() {
    const t = useTranslation();
    const { user } = useAuthContext();
    const qc = useQueryClient();
    const key = ['calendar-feed', user?.id ?? ''] as const;
    const [confirmReset, setConfirmReset] = useState(false);

    const feed = useQuery({ queryKey: key, queryFn: () => calendarFeedService.get(), enabled: !!user, staleTime: Infinity });
    const enable = useMutation({
        mutationFn: (reset: boolean) => calendarFeedService.ensure(reset),
        onSuccess: (token) => qc.setQueryData(key, token),
        onError: () => toast(t('cal.error'), 'error'),
    });

    const token = feed.data ?? null;
    const links = token ? calendarLinks(SUPABASE_URL, token) : null;
    // Android has no app that subscribes to webcal:// links (Google Calendar there can't).
    const showWebcal = Capacitor.getPlatform() !== 'android';

    const copy = async () => {
        if (!links) return;
        const ok = await copyText(links.https);
        toast(t(ok ? 'cal.copied' : 'cal.error'), ok ? 'success' : 'error');
    };

    if (!user) return null;

    return (
        <div className="glass rounded-2xl overflow-hidden">
            {!links ? (
                <button
                    type="button"
                    onClick={() => enable.mutate(false)}
                    disabled={feed.isLoading || enable.isPending}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/60 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
                >
                    <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                        <CalendarPlusIcon weight="bold" className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-meta font-semibold text-ink dark:text-white">{t('cal.add')}</p>
                        <p className="text-caption text-ink-soft dark:text-slate-400">{t('cal.addHint')}</p>
                    </div>
                    {enable.isPending && <span className="text-caption text-gray-400">{t('common.working')}</span>}
                </button>
            ) : (
                <div className="p-3.5 space-y-2.5">
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('cal.addHint')}</p>
                    <Input
                        readOnly
                        value={links.https}
                        aria-label={t('cal.add')}
                        onFocus={(e) => e.currentTarget.select()}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="tonal" icon={CopyIcon} onClick={copy}>
                            {t('cal.copy')}
                        </Button>
                        <Button size="sm" variant="secondary" icon={GoogleLogoIcon} onClick={() => window.open(links.google, '_blank', 'noopener')}>
                            {t('cal.google')}
                        </Button>
                        {showWebcal && (
                            <Button size="sm" variant="secondary" icon={AppleLogoIcon} onClick={() => (window.location.href = links.webcal)}>
                                {t('cal.apple')}
                            </Button>
                        )}
                    </div>
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('cal.help')}</p>
                    <p className="text-caption text-amber-700 dark:text-amber-400">{t('cal.private')}</p>
                    <Button size="sm" variant="ghost" icon={ArrowsClockwiseIcon} onClick={() => setConfirmReset(true)} className="-ml-2">
                        {t('cal.reset')}
                    </Button>
                </div>
            )}

            {confirmReset && (
                <ConfirmDialog
                    title={t('cal.reset')}
                    message={t('cal.resetConfirm')}
                    confirmLabel={t('cal.reset')}
                    onConfirm={async () => {
                        await enable.mutateAsync(true);
                        toast(t('cal.resetDone'), 'success');
                    }}
                    onClose={() => setConfirmReset(false)}
                />
            )}
        </div>
    );
}
