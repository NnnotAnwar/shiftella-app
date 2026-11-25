import { supabase } from '@shared/api/supabaseClient';
import { z } from 'zod';
import type { User } from '@shared/types';
import { HANDOVER_WINDOW_MS, ShiftNoteSchema, cleanNoteBody, type ShiftNote, type ShiftNoteInput } from './types';

/**
 * --- SHIFT NOTE SERVICE ---
 * The only place that talks to `shift_notes` / `shift_note_reads`. RLS is the
 * real guard (own shift to write, 15-minute edit window, handover notes for the
 * whole org, everything for timesheet readers); these shape the queries and
 * validate the rows. organization_id / location_id are filled by a trigger
 * from the shift.
 */

// The author's name rides along. shift_note_reads also links notes ↔ profiles,
// so the FK is named to keep the embed unambiguous.
const SELECT = '*, author:profiles!shift_notes_author_id_fkey(username, first_name, last_name)';

const ReadSchema = z.object({ note_id: z.string() });

/** Local calendar day of a date as `YYYY-MM-DD`. */
export function toDayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** [start, end) of a local calendar day `YYYY-MM-DD`, as ISO instants. */
export function dayBounds(day: string): { start: string; end: string } {
    const [y, m, d] = day.split('-').map(Number);
    return { start: new Date(y, m - 1, d).toISOString(), end: new Date(y, m - 1, d + 1).toISOString() };
}

export const shiftNoteService = {
    /** Notes on these clock records (own shift card, timesheet rows). */
    async forShifts(shiftIds: string[]): Promise<ShiftNote[]> {
        if (shiftIds.length === 0) return [];
        const { data, error } = await supabase
            .from('shift_notes')
            .select(SELECT)
            .in('shift_id', shiftIds)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return z.array(ShiftNoteSchema).parse(data ?? []);
    },

    /** Handover notes others left at a location in the last 24 h, newest first. */
    async handover(locationId: string, userId: string, now = Date.now()): Promise<ShiftNote[]> {
        const { data, error } = await supabase
            .from('shift_notes')
            .select(SELECT)
            .eq('location_id', locationId)
            .eq('handover', true)
            .neq('author_id', userId)
            .gte('created_at', new Date(now - HANDOVER_WINDOW_MS).toISOString())
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) throw error;
        return z.array(ShiftNoteSchema).parse(data ?? []);
    },

    /** Every note of a day (optionally one location) — the manager's list. */
    async forDay(organizationId: string, day: string, locationId: string | null): Promise<ShiftNote[]> {
        const { start, end } = dayBounds(day);
        let q = supabase
            .from('shift_notes')
            .select(SELECT)
            .eq('organization_id', organizationId)
            .gte('created_at', start)
            .lt('created_at', end);
        if (locationId) q = q.eq('location_id', locationId);
        const { data, error } = await q.order('created_at', { ascending: false });
        if (error) throw error;
        return z.array(ShiftNoteSchema).parse(data ?? []);
    },

    async create(user: Pick<User, 'id' | 'organization_id'>, shiftId: string, input: ShiftNoteInput): Promise<ShiftNote> {
        const body = cleanNoteBody(input.body);
        if (!body) throw new Error('empty note');
        const { data, error } = await supabase
            .from('shift_notes')
            .insert({ shift_id: shiftId, author_id: user.id, organization_id: user.organization_id, body, handover: input.handover })
            .select(SELECT)
            .single();
        if (error) throw error;
        return ShiftNoteSchema.parse(data);
    },

    async update(id: string, input: ShiftNoteInput): Promise<ShiftNote> {
        const body = cleanNoteBody(input.body);
        if (!body) throw new Error('empty note');
        const { data, error } = await supabase
            .from('shift_notes')
            .update({ body, handover: input.handover })
            .eq('id', id)
            .select(SELECT)
            .single();
        if (error) throw error;
        return ShiftNoteSchema.parse(data);
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('shift_notes').delete().eq('id', id);
        if (error) throw error;
    },

    /** Which of these notes I've already read. */
    async readIds(userId: string, noteIds: string[]): Promise<string[]> {
        if (noteIds.length === 0) return [];
        const { data, error } = await supabase
            .from('shift_note_reads')
            .select('note_id')
            .eq('user_id', userId)
            .in('note_id', noteIds);
        if (error) throw error;
        return z.array(ReadSchema).parse(data ?? []).map((r) => r.note_id);
    },

    async markRead(user: Pick<User, 'id' | 'organization_id'>, noteIds: string[]): Promise<void> {
        if (noteIds.length === 0) return;
        const { error } = await supabase
            .from('shift_note_reads')
            .upsert(
                noteIds.map((note_id) => ({ note_id, user_id: user.id, organization_id: user.organization_id })),
                { onConflict: 'note_id,user_id' },
            );
        if (error) throw error;
    },

    /** Undo of "Read". */
    async unmarkRead(userId: string, noteIds: string[]): Promise<void> {
        if (noteIds.length === 0) return;
        const { error } = await supabase.from('shift_note_reads').delete().eq('user_id', userId).in('note_id', noteIds);
        if (error) throw error;
    },
};
