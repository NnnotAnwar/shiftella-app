import { supabase } from '@shared/api/supabaseClient';

/**
 * --- DEMO DATA SERVICE ---
 * "Try it with demo data": the owner fills their own organization with a
 * sample café (two "Demo" locations, eight people who can never sign in, a
 * month of rota, clock records, requests, leave, announcements) and removes
 * exactly that again. Both run server-side (seed_demo_data / clear_demo_data,
 * owner only); every demo row carries the org's `demo_batch`, real rows never.
 * Nothing is pushed / sent while the demo exists.
 */

/** The content language of the seeded texts (the people are Czech either way). */
export type DemoLang = 'cs' | 'en';

export const demoService = {
    /** The org's current demo batch id, or null when it has no demo data. */
    async fetchBatch(orgId: string): Promise<string | null> {
        const { data, error } = await supabase.from('organizations').select('demo_batch').eq('id', orgId).maybeSingle();
        if (error) throw error;
        return (data as { demo_batch?: string | null } | null)?.demo_batch ?? null;
    },

    async seed(lang: DemoLang): Promise<void> {
        const { error } = await supabase.rpc('seed_demo_data', { p_lang: lang });
        if (error) throw error;
    },

    async clear(): Promise<void> {
        const { error } = await supabase.rpc('clear_demo_data');
        if (error) throw error;
    },
};

/** Demo texts in Czech for Czech / Slovak speakers, English for everyone else. */
export function demoLang(language: string): DemoLang {
    return language === 'cs' || language === 'sk' ? 'cs' : 'en';
}
