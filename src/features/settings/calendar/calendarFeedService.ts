import { supabase } from '@shared/api/supabaseClient';

/**
 * The signed-in member's secret calendar-feed token (table `calendar_feeds`,
 * own row only by RLS). Creating / replacing goes through the
 * `calendar_feed_token` RPC; replacing revokes the old link at once.
 */
export const calendarFeedService = {
    /** The current token, or null when the member never turned the feed on. */
    async get(): Promise<string | null> {
        const { data, error } = await supabase.from('calendar_feeds').select('token').maybeSingle();
        if (error) throw new Error(error.message);
        return (data?.token as string | undefined) ?? null;
    },

    /** Returns the token (creating it on first use); `reset` replaces it. */
    async ensure(reset = false): Promise<string> {
        const { data, error } = await supabase.rpc('calendar_feed_token', { p_reset: reset });
        if (error) throw new Error(error.message);
        return String(data);
    },
};
