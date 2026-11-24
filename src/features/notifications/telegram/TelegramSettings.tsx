import { TelegramLogoIcon } from '@phosphor-icons/react';
import { Button } from '@shared/components/Button';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { useEntitlements } from '@features/billing/useBilling';
import { UpgradePrompt } from '@features/billing/UpgradeGate';
import { telegramBotUsername, type TelegramLinkPrefs } from './telegramService';
import { useTelegramLink } from './useTelegramLink';

/**
 * --- SETTINGS → NOTIFICATIONS → TELEGRAM ---
 * Not linked: "Connect Telegram" (one-time code → t.me/<bot>?start=<code>).
 * Linked: "@username · linked", the bot's own switches and "Disconnect".
 * Telegram rides on push, so it's Team+ (an existing link can still be
 * removed on Free). Hidden until VITE_TELEGRAM_BOT_USERNAME is set.
 */
export function TelegramSettings({ isReviewer }: { isReviewer: boolean }) {
    const bot = telegramBotUsername();
    if (!bot) return null;
    return <TelegramBlock bot={bot} isReviewer={isReviewer} />;
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className={`text-meta font-semibold text-ink dark:text-white ${disabled ? 'opacity-50' : ''}`}>{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
                <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </button>
        </div>
    );
}

function TelegramBlock({ bot, isReviewer }: { bot: string; isReviewer: boolean }) {
    const t = useTranslation();
    const ent = useEntitlements();
    const tg = useTelegramLink(bot);
    const { link } = tg;

    if (tg.isLoading) return null;
    if (!link && !ent.isLoading && !ent.can('push')) {
        return (
            <section className="space-y-2" aria-label="Telegram">
                <h3 className="px-1 text-eyebrow text-ink-soft dark:text-slate-400">{t('settings.telegram.title')}</h3>
                <UpgradePrompt feature="push" />
            </section>
        );
    }

    const set = (patch: Partial<TelegramLinkPrefs>) => tg.update(patch);

    return (
        <section className="space-y-2" aria-label="Telegram">
            <h3 className="px-1 text-eyebrow text-ink-soft dark:text-slate-400">{t('settings.telegram.title')}</h3>
            <div className="glass rounded-2xl overflow-hidden divide-y divide-ink/5 dark:divide-white/6">
                <div className="flex items-center gap-3 px-3.5 py-3">
                    <div className="size-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                        <TelegramLogoIcon weight="fill" className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        {link ? (
                            <p className="truncate text-meta font-semibold text-ink dark:text-white">
                                {link.username ? `@${link.username}` : 'Telegram'}
                                <span className="font-normal text-ink-soft dark:text-slate-400"> · {t('settings.telegram.linked')}</span>
                            </p>
                        ) : (
                            <>
                                <p className="text-meta font-semibold text-ink dark:text-white">Telegram</p>
                                <p className="text-caption text-ink-soft dark:text-slate-400" aria-live="polite">
                                    {tg.waiting ? t('settings.telegram.waiting') : t('settings.telegram.hint')}
                                </p>
                            </>
                        )}
                    </div>
                    {link ? (
                        <Button variant="ghost" size="sm" onClick={() => tg.unlink()} loading={tg.unlinking}>
                            {t('settings.telegram.disconnect')}
                        </Button>
                    ) : tg.waiting ? (
                        <Button variant="ghost" size="sm" onClick={tg.cancelWait}>
                            {t('common.cancel')}
                        </Button>
                    ) : (
                        <Button variant="tonal" size="sm" onClick={() => void tg.connect()} loading={tg.connecting}>
                            {t('settings.telegram.connect')}
                        </Button>
                    )}
                </div>

                {!link && tg.fallbackUrl && (
                    <a
                        href={tg.fallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3.5 py-2.5 text-meta font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                        {t('settings.telegram.open')}
                    </a>
                )}

                {link && (
                    <>
                        <Switch label={t('settings.telegram.messages')} checked={!link.muted} onChange={(v) => set({ muted: !v })} />
                        <Switch label={t('settings.notif.shifts')} checked={link.shifts} onChange={(v) => set({ shifts: v })} disabled={link.muted} />
                        <Switch label={t('settings.notif.account')} checked={link.account} onChange={(v) => set({ account: v })} disabled={link.muted} />
                        {isReviewer && (
                            <Switch label={t('settings.notif.requests')} checked={link.requests} onChange={(v) => set({ requests: v })} disabled={link.muted} />
                        )}
                        <Switch
                            label={t('settings.telegram.announcements')}
                            checked={link.announcements}
                            onChange={(v) => set({ announcements: v })}
                            disabled={link.muted}
                        />
                        <p className="px-3.5 py-2.5 text-caption text-ink-soft dark:text-slate-400">{t('settings.telegram.linkedHint')}</p>
                    </>
                )}
            </div>
        </section>
    );
}
