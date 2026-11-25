import { documentsService, type MemberDocument } from './documentsService';

/**
 * --- PENDING DOCUMENT DELETES ---
 * Deleting a document is one tap with Undo: it disappears at once and is
 * removed on the server only when the Undo window has passed. The pending
 * deletes are kept in localStorage too, so leaving the page inside the window
 * (reload, closed tab, app killed) still deletes the file:
 *   • on `pagehide` the pending deletes are sent right away (keepalive);
 *   • the next signed-in app start replays any that are left.
 * While pending, a document stays hidden in every list, also after a reload.
 */

export const DOC_UNDO_MS = 5000;
const KEY = 'pending-document-deletes';

type Entry = Pick<MemberDocument, 'id' | 'file_path'> & { due: number };

// localStorage when there is one (shared across tabs, survives a reload),
// otherwise just this page's memory.
let memory: Entry[] = [];
function storage(): Storage | null {
    try {
        return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
    } catch {
        return null;
    }
}

function read(): Entry[] {
    const ls = storage();
    if (!ls) return memory;
    try {
        const v = JSON.parse(ls.getItem(KEY) ?? '[]') as unknown;
        return Array.isArray(v) ? (v as Entry[]).filter((e) => typeof e?.id === 'string' && typeof e?.file_path === 'string') : [];
    } catch {
        return memory;
    }
}

function write(entries: Entry[]) {
    memory = entries;
    try {
        const ls = storage();
        if (!ls) return;
        if (entries.length) ls.setItem(KEY, JSON.stringify(entries));
        else ls.removeItem(KEY);
    } catch {
        /* storage blocked: memory still covers this page */
    }
}

const leftover = read();
let replayed = false;
const hidden = new Set<string>(leftover.map((e) => e.id));
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
    version++;
    listeners.forEach((l) => l());
};

export const pendingDeletes = {
    subscribe(l: () => void) {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    version: () => version,
    isHidden: (id: string) => hidden.has(id),

    /** Hide now and remember it, so it is deleted even if the page goes away. */
    schedule(doc: Pick<MemberDocument, 'id' | 'file_path'>, windowMs = DOC_UNDO_MS) {
        write([...read().filter((e) => e.id !== doc.id), { id: doc.id, file_path: doc.file_path, due: Date.now() + windowMs }]);
        hidden.add(doc.id);
        emit();
    },

    /** Undo. */
    cancel(id: string) {
        write(read().filter((e) => e.id !== id));
        hidden.delete(id);
        emit();
    },

    /** Delete on the server now. Safe to repeat (the file and row may already be gone). */
    async commit(id: string, opts: { leaving?: boolean } = {}) {
        const entry = read().find((e) => e.id === id);
        if (!entry) return;
        try {
            await documentsService.remove(entry, { parallel: opts.leaving });
        } catch (err) {
            // Failed: show it again (the next app start will not retry it either).
            write(read().filter((e) => e.id !== id));
            if (!opts.leaving) {
                hidden.delete(id);
                emit();
            }
            throw err;
        }
        // Gone: it stays in the hidden set, so a stale list can't flash it back.
        write(read().filter((e) => e.id !== id));
    },

    /** Leaving the page: send every pending delete at once. */
    flush() {
        for (const e of read()) void pendingDeletes.commit(e.id, { leaving: true }).catch(() => undefined);
    },

    /**
     * Signed-in app start: finish the deletes a previous page left behind, each
     * once its Undo window is over (another open tab may still undo it). Runs
     * once per page and only for what was pending when this page loaded.
     */
    replay(onDone?: () => void) {
        if (replayed) return;
        replayed = true;
        for (const e of leftover) {
            setTimeout(() => {
                void pendingDeletes
                    .commit(e.id)
                    .catch(() => undefined)
                    .finally(() => onDone?.());
            }, Math.max(0, e.due - Date.now()) + 500);
        }
    },
};

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => pendingDeletes.flush());
}

/** Tests only: forget everything (module state outlives a single test). */
export function resetPendingDeletesForTests() {
    write([]);
    hidden.clear();
    leftover.length = 0;
    replayed = false;
    emit();
}
