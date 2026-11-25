import { z } from 'zod';

/** Longest note the database accepts (CHECK on shift_notes.body). */
export const NOTE_MAX = 1000;

/** The author may fix or remove their own note this long after writing it (RLS). */
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** How far back the dashboard's handover card looks. */
export const HANDOVER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** After clock-out the last shift can still get a note for this long (the server allows 12 h). */
export const AFTER_SHIFT_NOTE_MS = 2 * 60 * 60 * 1000;

const AuthorSchema = z.object({
    username: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
});

export const ShiftNoteSchema = z.object({
    id: z.string(),
    shift_id: z.string(),
    organization_id: z.string(),
    location_id: z.string().nullable(),
    author_id: z.string(),
    body: z.string(),
    handover: z.boolean(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
    demo_batch: z.string().nullable().optional(),
    author: AuthorSchema.nullable().optional(),
});
export type ShiftNote = z.infer<typeof ShiftNoteSchema>;

export interface ShiftNoteInput {
    body: string;
    handover: boolean;
}

/** "Eva Dvořáková" — or the username, or an em dash. */
export function noteAuthorName(n: Pick<ShiftNote, 'author'>): string {
    const a = n.author;
    if (!a) return '—';
    return [a.first_name, a.last_name].filter(Boolean).join(' ') || a.username || '—';
}

/** Whether the author may still edit / delete their note (mirrors the RLS window). */
export function canStillEdit(n: Pick<ShiftNote, 'created_at'>, now = Date.now()): boolean {
    return now - new Date(n.created_at).getTime() < NOTE_EDIT_WINDOW_MS;
}

/** Trimmed text, or null when there's nothing to save / it's too long. */
export function cleanNoteBody(raw: string): string | null {
    const body = raw.trim();
    return body.length > 0 && body.length <= NOTE_MAX ? body : null;
}

/**
 * Which of my clock records a note goes on: the running one, else the one I
 * clocked out of in the last AFTER_SHIFT_NOTE_MS ("at clock-out"), else none.
 */
export function noteTargetShift<S extends { id: string; ended_at: string | null }>(
    active: S | null | undefined,
    history: readonly S[],
    now = Date.now(),
): { shift: S; ended: boolean } | null {
    if (active) return { shift: active, ended: false };
    let last: S | null = null;
    let lastEnd = -Infinity;
    for (const s of history) {
        if (!s.ended_at) continue;
        const end = new Date(s.ended_at).getTime();
        if (end > now || now - end > AFTER_SHIFT_NOTE_MS || end <= lastEnd) continue;
        last = s;
        lastEnd = end;
    }
    return last ? { shift: last, ended: true } : null;
}
