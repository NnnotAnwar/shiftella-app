import { beforeEach, describe, expect, it, vi } from 'vitest';

// A recording stand-in for the supabase query builder.
type Call = [string, ...unknown[]];
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };
function builder(table: string) {
    calls.push(['from', table]);
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'gte', 'lt', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete', 'single']) {
        q[m] = (...args: unknown[]) => {
            calls.push([m, ...args]);
            return q;
        };
    }
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return q;
}
vi.mock('@shared/api/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));

import { dayBounds, shiftNoteService, toDayKey } from './shiftNoteService';
import { AFTER_SHIFT_NOTE_MS, canStillEdit, cleanNoteBody, noteAuthorName, noteTargetShift, NOTE_MAX } from './types';

const note = {
    id: 'n1', shift_id: 's1', organization_id: 'org', location_id: 'loc', author_id: 'u2', body: 'Milk came',
    handover: true, created_at: '2026-11-25T06:00:00.000Z', updated_at: null, author: { first_name: 'Eva', last_name: 'D', username: 'eva' },
};

describe('shift note helpers', () => {
    it('cleans the text: trimmed, not empty, not too long', () => {
        expect(cleanNoteBody('  milk came \n')).toBe('milk came');
        expect(cleanNoteBody('   ')).toBeNull();
        expect(cleanNoteBody('x'.repeat(NOTE_MAX + 1))).toBeNull();
    });

    it('edit window is 15 minutes after writing', () => {
        const t0 = Date.parse(note.created_at);
        expect(canStillEdit(note, t0 + 14 * 60_000)).toBe(true);
        expect(canStillEdit(note, t0 + 16 * 60_000)).toBe(false);
    });

    it('author name falls back to the username, then a dash', () => {
        expect(noteAuthorName(note)).toBe('Eva D');
        expect(noteAuthorName({ author: { first_name: null, last_name: null, username: 'eva' } })).toBe('eva');
        expect(noteAuthorName({ author: null })).toBe('—');
    });

    it('a note goes on the running shift, else the one just ended', () => {
        const now = Date.parse('2026-11-25T12:00:00.000Z');
        const ago = (ms: number) => new Date(now - ms).toISOString();
        const active = { id: 'live', ended_at: null };
        const recent = { id: 'recent', ended_at: ago(30 * 60_000) };
        const older = { id: 'older', ended_at: ago(90 * 60_000) };
        const old = { id: 'old', ended_at: ago(AFTER_SHIFT_NOTE_MS + 1) };
        expect(noteTargetShift(active, [recent], now)).toEqual({ shift: active, ended: false });
        expect(noteTargetShift(null, [older, recent, old], now)).toEqual({ shift: recent, ended: true });
        expect(noteTargetShift(null, [old], now)).toBeNull();
        expect(noteTargetShift(undefined, [], now)).toBeNull();
    });

    it('day bounds are the local calendar day', () => {
        const { start, end } = dayBounds('2026-11-25');
        expect(new Date(start).getDate()).toBe(25);
        expect(new Date(start).getHours()).toBe(0);
        expect(Date.parse(end) - Date.parse(start)).toBeGreaterThanOrEqual(23 * 3600_000);
        expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});

describe('shiftNoteService', () => {
    beforeEach(() => {
        calls.length = 0;
        result = { data: [], error: null };
    });

    it('handover: others’ handover notes at the location from the last 24 h', async () => {
        result = { data: [note], error: null };
        const now = Date.parse('2026-11-25T12:00:00.000Z');
        const out = await shiftNoteService.handover('loc', 'me', now);
        expect(out).toHaveLength(1);
        expect(calls).toContainEqual(['from', 'shift_notes']);
        expect(calls).toContainEqual(['eq', 'location_id', 'loc']);
        expect(calls).toContainEqual(['eq', 'handover', true]);
        expect(calls).toContainEqual(['neq', 'author_id', 'me']);
        expect(calls).toContainEqual(['gte', 'created_at', '2026-11-24T12:00:00.000Z']);
    });

    it('create sends trimmed text and refuses an empty note', async () => {
        result = { data: note, error: null };
        await shiftNoteService.create({ id: 'me', organization_id: 'org' }, 's1', { body: '  Milk came ', handover: true });
        const insert = calls.find((c) => c[0] === 'insert');
        expect(insert?.[1]).toMatchObject({ shift_id: 's1', author_id: 'me', body: 'Milk came', handover: true });
        await expect(shiftNoteService.create({ id: 'me', organization_id: 'org' }, 's1', { body: ' ', handover: false })).rejects.toThrow();
    });

    it('markRead upserts one receipt per note; nothing for an empty list', async () => {
        await shiftNoteService.markRead({ id: 'me', organization_id: 'org' }, ['a', 'b']);
        const upsert = calls.find((c) => c[0] === 'upsert');
        expect(upsert?.[1]).toEqual([
            { note_id: 'a', user_id: 'me', organization_id: 'org' },
            { note_id: 'b', user_id: 'me', organization_id: 'org' },
        ]);
        expect(upsert?.[2]).toEqual({ onConflict: 'note_id,user_id' });
        calls.length = 0;
        await shiftNoteService.markRead({ id: 'me', organization_id: 'org' }, []);
        expect(calls).toEqual([]);
    });

    it('day list filters by location only when one is picked', async () => {
        await shiftNoteService.forDay('org', '2026-11-25', null);
        expect(calls.some((c) => c[0] === 'eq' && c[1] === 'location_id')).toBe(false);
        calls.length = 0;
        await shiftNoteService.forDay('org', '2026-11-25', 'loc');
        expect(calls).toContainEqual(['eq', 'location_id', 'loc']);
    });

    it('surfaces database errors', async () => {
        result = { data: null, error: { message: 'denied' } };
        await expect(shiftNoteService.forShifts(['s1'])).rejects.toEqual({ message: 'denied' });
    });
});
