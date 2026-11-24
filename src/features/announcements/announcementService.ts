import { supabase } from '@shared/api/supabaseClient';
import { z } from 'zod';
import { type User } from '@shared/types';
import { AnnouncementReaderSchema, AnnouncementSchema, type Announcement, type AnnouncementInput, type AnnouncementReach, type AnnouncementReader } from './types';

/**
 * --- ANNOUNCEMENT SERVICE ---
 * The only place that talks to the `announcements` table. Components never call
 * Supabase directly — they go through the hook (useAnnouncements) which calls
 * these functions. RLS on the table is the real guard; these just shape the
 * queries and validate the results (see locationService for the same pattern).
 */

// Pull the author's name alongside each row for the "posted by" line. We name
// the FK explicitly (announcements_author_id_fkey) to disambiguate: the
// announcement_reads table also links announcements↔profiles, so a bare
// `profiles` embed is ambiguous (PGRST201).
const SELECT_WITH_AUTHOR =
  '*, author:profiles!announcements_author_id_fkey(username, first_name, last_name)';

export const announcementService = {
  /** All announcements the current user may see, newest first, pinned on top. */
  async getAnnouncements(organizationId: string, isSuperAdmin = false): Promise<Announcement[]> {
    let query = supabase
      .from('announcements')
      .select(SELECT_WITH_AUTHOR)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    // Superadmin sees every org; everyone else is scoped by RLS anyway, but we
    // filter client-side too so the query is cheap and explicit.
    if (!isSuperAdmin) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return z.array(AnnouncementSchema).parse(data ?? []);
  },

  /** Post a new announcement as the current user (must be a manager, enforced by RLS). */
  async createAnnouncement(user: User, input: AnnouncementInput): Promise<Announcement> {
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        organization_id: user.organization_id,
        author_id: user.id,
        title: input.title.trim(),
        body: input.body.trim(),
        location_id: input.location_id ?? null,
        org_role_id: input.org_role_id ?? null,
        pinned: input.pinned ?? false,
      })
      .select(SELECT_WITH_AUTHOR)
      .single();

    if (error) throw error;
    return AnnouncementSchema.parse(data);
  },

  /** Edit an existing announcement (manager only, enforced by RLS). */
  async updateAnnouncement(id: string, patch: Partial<AnnouncementInput>): Promise<Announcement> {
    const next: Record<string, unknown> = {};
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.body !== undefined) next.body = patch.body.trim();
    if (patch.location_id !== undefined) next.location_id = patch.location_id;
    if (patch.org_role_id !== undefined) next.org_role_id = patch.org_role_id;
    if (patch.pinned !== undefined) next.pinned = patch.pinned;

    const { data, error } = await supabase
      .from('announcements')
      .update(next)
      .eq('id', id)
      .select(SELECT_WITH_AUTHOR)
      .single();

    if (error) throw error;
    return AnnouncementSchema.parse(data);
  },

  /** "N people will see it" while composing (posters only). */
  async audienceSize(locationId: string | null, roleId: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('announcement_audience_size', { p_location: locationId, p_role: roleId });
    if (error) throw error;
    return Number(data ?? 0);
  },

  /** Read / audience counts for these announcements (posters only; others get an empty map). */
  async reach(ids: string[]): Promise<Record<string, AnnouncementReach>> {
    if (ids.length === 0) return {};
    const { data, error } = await supabase.rpc('announcement_reach', { p_ids: ids });
    if (error) throw error;
    const out: Record<string, AnnouncementReach> = {};
    for (const r of (data ?? []) as { announcement_id: string; readers: number; audience: number }[]) {
      out[r.announcement_id] = { readers: Number(r.readers), audience: Number(r.audience) };
    }
    return out;
  },

  /** Who of the audience has read an announcement (unread first). */
  async readers(id: string): Promise<AnnouncementReader[]> {
    const { data, error } = await supabase.rpc('announcement_readers', { p_id: id });
    if (error) throw error;
    return z.array(AnnouncementReaderSchema).parse(data ?? []);
  },

  /** Remove an announcement (manager only, enforced by RLS). */
  async deleteAnnouncement(id: string): Promise<void> {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;
  },
};
