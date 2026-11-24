import { z } from 'zod';
import { supabase } from '@shared/api/supabaseClient';

/**
 * --- TELEGRAM LINK SERVICE ---
 * The only place that talks to `telegram_links` / `create_telegram_link_code`.
 * RLS: a user reads, tunes and deletes only their own link; only the bot
 * (service role) creates one, after consuming the one-time code.
 */
export const TelegramLinkSchema = z.object({
    username: z.string().nullable(),
    linked_at: z.string(),
    muted: z.boolean(),
    shifts: z.boolean(),
    account: z.boolean(),
    requests: z.boolean(),
    announcements: z.boolean(),
});
export type TelegramLink = z.infer<typeof TelegramLinkSchema>;
export type TelegramLinkPrefs = Pick<TelegramLink, 'muted' | 'shifts' | 'account' | 'requests' | 'announcements'>;

/** The bot's @username (build var). Unset = the Telegram block stays hidden. */
export function telegramBotUsername(): string {
    return String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
}

/** Deep link that opens the bot with the one-time code as the /start payload. */
export function telegramStartUrl(bot: string, code: string): string {
    return `https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(code)}`;
}

export const telegramService = {
    async getLink(userId: string): Promise<TelegramLink | null> {
        const { data, error } = await supabase
            .from('telegram_links')
            .select('username, linked_at, muted, shifts, account, requests, announcements')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;
        return data ? TelegramLinkSchema.parse(data) : null;
    },

    /** A single-use code valid for 10 minutes (refused on the Free plan). */
    async createLinkCode(): Promise<string> {
        const { data, error } = await supabase.rpc('create_telegram_link_code');
        if (error) throw error;
        return z.string().regex(/^[a-f0-9]{40}$/).parse(data);
    },

    async updatePrefs(userId: string, patch: Partial<TelegramLinkPrefs>): Promise<void> {
        const { error } = await supabase.from('telegram_links').update(patch).eq('user_id', userId);
        if (error) throw error;
    },

    async unlink(userId: string): Promise<void> {
        const { error } = await supabase.from('telegram_links').delete().eq('user_id', userId);
        if (error) throw error;
    },
};
