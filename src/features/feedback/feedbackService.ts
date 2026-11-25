import { z } from 'zod';
import { supabase } from '@shared/api/supabaseClient';
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, type FeedbackInput, type FeedbackKind, type FeedbackStatus } from './feedbackLogic';

/**
 * --- FEEDBACK SERVICE ---
 * `app_feedback` reads and writes. RLS: everyone inserts / reads their own
 * rows; the platform Superadmin reads all and sets the status. The database
 * fills user, organization and status itself and alerts the Superadmin.
 */

const nameSchema = z
    .object({
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        username: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
    })
    .nullable()
    .optional();

export const FeedbackRowSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    organization_id: z.string().nullable(),
    kind: z.enum(FEEDBACK_KINDS),
    message: z.string(),
    may_contact: z.boolean(),
    route: z.string().nullable(),
    app_version: z.string().nullable(),
    language: z.string().nullable(),
    user_agent: z.string().nullable(),
    status: z.enum(FEEDBACK_STATUSES),
    created_at: z.string(),
    author: nameSchema,
    organization: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
});
export type FeedbackRow = z.infer<typeof FeedbackRowSchema>;

export interface InboxFilters {
    kind: FeedbackKind | 'all';
    status: FeedbackStatus | 'all';
}

const INBOX_SELECT =
    'id, user_id, organization_id, kind, message, may_contact, route, app_version, language, user_agent, status, created_at, ' +
    'author:profiles!app_feedback_user_id_fkey(first_name, last_name, username, email), organization:organizations(name)';

export const feedbackService = {
    async submit(input: FeedbackInput): Promise<void> {
        // No `.select()`: the insert needs no read-back.
        const { error } = await supabase.from('app_feedback').insert(input);
        if (error) throw error;
    },

    /** The Superadmin inbox: newest first, at most 200 rows. */
    async inbox(filters: InboxFilters): Promise<FeedbackRow[]> {
        let q = supabase.from('app_feedback').select(INBOX_SELECT);
        if (filters.kind !== 'all') q = q.eq('kind', filters.kind);
        if (filters.status !== 'all') q = q.eq('status', filters.status);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return z.array(FeedbackRowSchema).parse(data ?? []);
    },

    /** How many messages wait unread (the nav badge). */
    async countNew(): Promise<number> {
        const { count, error } = await supabase.from('app_feedback').select('id', { count: 'exact', head: true }).eq('status', 'new');
        if (error) throw error;
        return count ?? 0;
    },

    async setStatus(id: string, status: FeedbackStatus): Promise<void> {
        const { error } = await supabase.from('app_feedback').update({ status }).eq('id', id);
        if (error) throw error;
    },
};
