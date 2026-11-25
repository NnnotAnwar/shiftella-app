import { describe, it, expect, vi, beforeEach } from 'vitest';

// A real Storage (the test DOM has none here).
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
        return mem.size;
    },
});

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
const remove = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('./documentsService', () => ({ documentsService: { remove: (...a: unknown[]) => remove(...a) } }));

const KEY = 'pending-document-deletes';
const doc = { id: 'd1', file_path: 'o1/eva/d1.pdf' };

async function load() {
    vi.resetModules();
    return import('./pendingDeletes');
}

describe('pendingDeletes', () => {
    beforeEach(() => {
        localStorage.clear();
        remove.mockReset();
        remove.mockResolvedValue(undefined);
        vi.useRealTimers();
    });

    it('schedule hides and remembers it; Undo forgets it', async () => {
        const { pendingDeletes } = await load();
        pendingDeletes.schedule(doc);
        expect(pendingDeletes.isHidden('d1')).toBe(true);
        expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([expect.objectContaining(doc)]);
        pendingDeletes.cancel('d1');
        expect(pendingDeletes.isHidden('d1')).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(remove).not.toHaveBeenCalled();
    });

    it('commit deletes on the server and stays hidden', async () => {
        const { pendingDeletes } = await load();
        pendingDeletes.schedule(doc);
        await pendingDeletes.commit('d1');
        expect(remove).toHaveBeenCalledWith(expect.objectContaining(doc), { parallel: undefined });
        expect(localStorage.getItem(KEY)).toBeNull();
        expect(pendingDeletes.isHidden('d1')).toBe(true);
    });

    it('a failed delete shows the document again', async () => {
        const { pendingDeletes } = await load();
        remove.mockRejectedValueOnce(new Error('no'));
        pendingDeletes.schedule(doc);
        await expect(pendingDeletes.commit('d1')).rejects.toThrow('no');
        expect(pendingDeletes.isHidden('d1')).toBe(false);
    });

    it('closing the page sends the pending deletes at once, in parallel', async () => {
        const { pendingDeletes } = await load();
        pendingDeletes.schedule(doc);
        window.dispatchEvent(new Event('pagehide'));
        expect(remove).toHaveBeenCalledWith(expect.objectContaining(doc), { parallel: true });
    });

    it('a reload keeps it hidden and the next start finishes the delete after the window', async () => {
        localStorage.setItem(KEY, JSON.stringify([{ ...doc, due: Date.now() + 2000 }]));
        vi.useFakeTimers();
        const { pendingDeletes } = await load();
        expect(pendingDeletes.isHidden('d1')).toBe(true);
        const done = vi.fn();
        pendingDeletes.replay(done);
        pendingDeletes.replay(done); // once per page
        await vi.advanceTimersByTimeAsync(1000);
        expect(remove).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('an Undo in another tab wins over the replay', async () => {
        localStorage.setItem(KEY, JSON.stringify([{ ...doc, due: Date.now() + 2000 }]));
        vi.useFakeTimers();
        const { pendingDeletes } = await load();
        pendingDeletes.replay();
        localStorage.removeItem(KEY); // the other tab undid it
        await vi.advanceTimersByTimeAsync(3000);
        expect(remove).not.toHaveBeenCalled();
    });
});
