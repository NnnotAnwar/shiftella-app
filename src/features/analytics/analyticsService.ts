import { supabase } from '@shared/api/supabaseClient';
import { AnalyticsSchema, type Analytics } from './types';

/** Owner analytics — one read-only RPC, permission-checked in the database. */
export const analyticsService = {
    async get(from: string, to: string, locationId: string | null): Promise<Analytics> {
        const { data, error } = await supabase.rpc('org_analytics', {
            p_from: from,
            p_to: to,
            p_location: locationId,
        });
        if (error) throw error;
        return AnalyticsSchema.parse(data);
    },

    /** Active locations of the organization, for the filter. */
    async locations(organizationId: string): Promise<{ id: string; name: string }[]> {
        const { data, error } = await supabase
            .from('locations')
            .select('id, name')
            .eq('organization_id', organizationId)
            .is('archived_at', null)
            .is('demo_batch', null) // sample locations don't feed analytics
            .order('name', { ascending: true });
        if (error) throw error;
        return (data ?? []) as { id: string; name: string }[];
    },
};
