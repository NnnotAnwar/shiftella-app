import { z } from 'zod';

/**
 * --- ANNOUNCEMENT TYPES ---
 * An announcement is a short notice a manager posts to the whole organization
 * (location_id = null) or to a single location. We validate rows coming back
 * from Supabase with Zod, same as the rest of the app (see shared/types).
 */
export const AnnouncementSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  location_id: z.string().nullable().optional(), // null = whole organization (else: that location's roster)
  org_role_id: z.string().nullable().optional(), // null = every role (else: people with that role)
  author_id: z.string().nullable().optional(), // null if the author left
  title: z.string(),
  body: z.string(),
  pinned: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string(),
  // Author profile, joined in the list query for the "posted by" line.
  author: z
    .object({
      username: z.string(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export type Announcement = z.infer<typeof AnnouncementSchema>;

/** Fields a manager fills in when posting / editing. */
export interface AnnouncementInput {
  title: string;
  body: string;
  location_id?: string | null; // omit / null = whole org
  org_role_id?: string | null; // omit / null = every role
  pinned?: boolean;
}

/** How many of an announcement's audience have read it (posters only). */
export interface AnnouncementReach {
  readers: number;
  audience: number;
}

/** One person of an announcement's audience; read_at null = not read yet. */
export const AnnouncementReaderSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  read_at: z.string().nullable(),
});
export type AnnouncementReader = z.infer<typeof AnnouncementReaderSchema>;
