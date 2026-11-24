/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * --- FAKE SUPABASE CLIENT (screenshot harness only) ---
 * Swapped in for `@shared/api/supabaseClient` by tools/screenshots/vite.config.ts.
 * An in-memory PostgREST look-alike over the invented demo dataset in
 * ./demoData.ts: enough of supabase-js (query builder with embeds + filters,
 * mutations, RPCs, auth, realtime, functions) for the real app pages to render.
 * It never makes a network request.
 */
import { buildDemoData, DEMO_USER_ID, type Row, type Tables } from './demoData';

const db: Tables = buildDemoData();

// --- Foreign keys (just the ones the app's select strings embed through) ------
interface Fk {
    name: string;
    table: string;
    column: string;
    ref: string;
    refColumn: string;
}
const fk = (table: string, column: string, ref: string, refColumn = 'id'): Fk => ({
    name: `${table}_${column}_fkey`,
    table,
    column,
    ref,
    refColumn,
});
const FKS: Fk[] = [
    fk('profiles', 'role', 'roles', 'name'),
    fk('profiles', 'org_role_id', 'org_roles'),
    fk('profiles', 'organization_id', 'organizations'),
    fk('locations', 'organization_id', 'organizations'),
    fk('org_roles', 'organization_id', 'organizations'),
    fk('org_role_permissions', 'role_id', 'org_roles'),
    fk('shifts', 'user_id', 'profiles'),
    fk('shifts', 'location_id', 'locations'),
    fk('scheduled_shifts', 'user_id', 'profiles'),
    fk('scheduled_shifts', 'location_id', 'locations'),
    fk('time_off', 'user_id', 'profiles'),
    fk('open_shifts', 'claimed_by', 'profiles'),
    fk('open_shifts', 'location_id', 'locations'),
    fk('shift_swaps', 'shift_id', 'scheduled_shifts'),
    fk('shift_swaps', 'from_user', 'profiles'),
    fk('shift_swaps', 'taker_id', 'profiles'),
    fk('announcements', 'author_id', 'profiles'),
    fk('availability', 'user_id', 'profiles'),
    fk('name_change_requests', 'user_id', 'profiles'),
];

type Relation = { table: string; many: boolean; local: string; foreign: string };

function resolveRelation(parent: string, target: string, hint: string | null): Relation {
    const toOne = (f: Fk): Relation => ({ table: f.ref, many: false, local: f.column, foreign: f.refColumn });
    const toMany = (f: Fk): Relation => ({ table: f.table, many: true, local: f.refColumn, foreign: f.column });
    if (hint) {
        const f = FKS.find((x) => x.name === hint) ?? FKS.find((x) => x.table === parent && x.column === hint);
        if (!f) throw new Error(`[fake-supabase] unknown FK hint ${parent}->${target}!${hint}`);
        return f.table === parent ? toOne(f) : toMany(f);
    }
    // `profiles:user_id(...)` / `role(...)`: the name is a FK column of the parent.
    const byColumn = FKS.find((x) => x.table === parent && x.column === target);
    if (byColumn) return toOne(byColumn);
    const out = FKS.find((x) => x.table === parent && x.ref === target);
    if (out) return toOne(out);
    const inn = FKS.find((x) => x.table === target && x.ref === parent);
    if (inn) return toMany(inn);
    throw new Error(`[fake-supabase] no relation ${parent} -> ${target}`);
}

// --- Select parser --------------------------------------------------------------
type SelectItem =
    | { kind: 'all' }
    | { kind: 'col'; name: string; alias: string }
    | { kind: 'embed'; alias: string; target: string; hint: string | null; inner: SelectItem[] };

function splitTop(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur);
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s: string): SelectItem[] {
    return splitTop(s.replace(/\s+/g, ' ')).map((item): SelectItem => {
        if (item === '*') return { kind: 'all' };
        const paren = item.indexOf('(');
        if (paren === -1) {
            const [a, b] = item.includes(':') ? item.split(':') : [item, item];
            return { kind: 'col', alias: a.trim(), name: b.trim() };
        }
        const head = item.slice(0, paren).trim();
        const inner = parseSelect(item.slice(paren + 1, item.lastIndexOf(')')));
        let alias = head;
        let rest = head;
        if (head.includes(':')) [alias, rest] = head.split(':').map((x) => x.trim());
        const [target, hint] = rest.includes('!') ? rest.split('!') : [rest, null];
        const cleanHint = hint ? hint.replace(/^inner$/, '') || null : null;
        return { kind: 'embed', alias: alias.trim(), target: target.trim(), hint: cleanHint, inner };
    });
}

function project(table: string, row: Row, items: SelectItem[]): Row {
    const out: Row = {};
    for (const it of items) {
        if (it.kind === 'all') Object.assign(out, row);
        else if (it.kind === 'col') out[it.alias] = row[it.name] ?? null;
        else {
            const rel = resolveRelation(table, it.target, it.hint);
            const rows = (db[rel.table] ?? []).filter((r) => r[rel.foreign] != null && r[rel.foreign] === row[rel.local]);
            out[it.alias] = rel.many
                ? rows.map((r) => project(rel.table, r, it.inner))
                : rows[0]
                  ? project(rel.table, rows[0], it.inner)
                  : null;
        }
    }
    return out;
}

// --- Filters --------------------------------------------------------------------
type Pred = (r: Row) => boolean;

const cmp = (a: unknown, b: unknown): number => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
};
const parseLiteral = (v: string): unknown => {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v.replace(/^"(.*)"$/, '$1');
};

function opPred(col: string, op: string, value: unknown): Pred {
    switch (op) {
        case 'eq':
            return (r) => r[col] === value || (r[col] != null && value != null && String(r[col]) === String(value));
        case 'neq':
            return (r) => r[col] != null && String(r[col]) !== String(value);
        case 'gt':
            return (r) => r[col] != null && cmp(r[col], value) > 0;
        case 'gte':
            return (r) => r[col] != null && cmp(r[col], value) >= 0;
        case 'lt':
            return (r) => r[col] != null && cmp(r[col], value) < 0;
        case 'lte':
            return (r) => r[col] != null && cmp(r[col], value) <= 0;
        case 'is':
            return (r) => (value === null ? r[col] == null : r[col] === value);
        case 'in': {
            const list = (Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, '').split(',')).map(String);
            return (r) => r[col] != null && list.includes(String(r[col]));
        }
        case 'like':
        case 'ilike': {
            const re = new RegExp(`^${String(value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, op === 'ilike' ? 'i' : '');
            return (r) => r[col] != null && re.test(String(r[col]));
        }
        case 'contains':
        case 'cs': {
            const want = Array.isArray(value) ? value : [value];
            return (r) => Array.isArray(r[col]) && want.every((w) => (r[col] as unknown[]).includes(w));
        }
        default:
            console.warn(`[fake-supabase] unsupported operator ${op}`);
            return () => true;
    }
}

function parseOr(expr: string): Pred {
    const parts = splitTop(expr).map((p): Pred => {
        const and = p.match(/^and\((.*)\)$/);
        if (and) {
            const preds = splitTop(and[1]).map((x) => parseOr(x));
            return (r) => preds.every((f) => f(r));
        }
        const [col, op, ...rest] = p.split('.');
        const raw = rest.join('.');
        if (op === 'not') {
            const [op2, ...r2] = rest;
            const inner = opPred(col, op2, op2 === 'in' ? r2.join('.') : parseLiteral(r2.join('.')));
            return (r) => !inner(r);
        }
        return opPred(col, op, op === 'in' ? raw : parseLiteral(raw));
    });
    return (r) => parts.some((f) => f(r));
}

// --- Query builder --------------------------------------------------------------
let seq = 1000;
const uuid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;

type Result = { data: any; error: any; count?: number | null; status: number; statusText: string };

class Query implements PromiseLike<Result> {
    private preds: Pred[] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private lim: number | null = null;
    private offset = 0;
    private selectStr: string | null = null;
    private countMode = false;
    private head = false;
    private singleMode: 'one' | 'maybe' | null = null;
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    private payload: Row[] = [];
    private patch: Row = {};
    private conflict = 'id';
    private table: string;

    constructor(table: string) {
        this.table = table;
        if (!db[table]) db[table] = [];
    }

    select(cols = '*', opts?: { count?: string; head?: boolean }) {
        this.selectStr = cols;
        if (opts?.count) this.countMode = true;
        if (opts?.head) this.head = true;
        return this;
    }
    insert(rows: Row | Row[]) {
        this.op = 'insert';
        this.payload = Array.isArray(rows) ? rows : [rows];
        return this;
    }
    upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        this.op = 'upsert';
        this.payload = Array.isArray(rows) ? rows : [rows];
        if (opts?.onConflict) this.conflict = opts.onConflict;
        return this;
    }
    update(patch: Row) {
        this.op = 'update';
        this.patch = patch;
        return this;
    }
    delete() {
        this.op = 'delete';
        return this;
    }

    eq(c: string, v: unknown) { this.preds.push(opPred(c, 'eq', v)); return this; }
    neq(c: string, v: unknown) { this.preds.push(opPred(c, 'neq', v)); return this; }
    gt(c: string, v: unknown) { this.preds.push(opPred(c, 'gt', v)); return this; }
    gte(c: string, v: unknown) { this.preds.push(opPred(c, 'gte', v)); return this; }
    lt(c: string, v: unknown) { this.preds.push(opPred(c, 'lt', v)); return this; }
    lte(c: string, v: unknown) { this.preds.push(opPred(c, 'lte', v)); return this; }
    is(c: string, v: unknown) { this.preds.push(opPred(c, 'is', v)); return this; }
    in(c: string, v: unknown[]) { this.preds.push(opPred(c, 'in', v)); return this; }
    like(c: string, v: string) { this.preds.push(opPred(c, 'like', v)); return this; }
    ilike(c: string, v: string) { this.preds.push(opPred(c, 'ilike', v)); return this; }
    contains(c: string, v: unknown) { this.preds.push(opPred(c, 'contains', v)); return this; }
    match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
    filter(c: string, op: string, v: unknown) { this.preds.push(opPred(c, op, v)); return this; }
    not(c: string, op: string, v: unknown) { const p = opPred(c, op, v); this.preds.push((r) => !p(r)); return this; }
    or(expr: string) { this.preds.push(parseOr(expr)); return this; }
    order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
    limit(n: number) { this.lim = n; return this; }
    range(from: number, to: number) { this.offset = from; this.lim = to - from + 1; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }
    single() { this.singleMode = 'one'; return this; }
    abortSignal() { return this; }
    returns() { return this; }
    throwOnError() { return this; }

    private matches(r: Row) {
        return this.preds.every((p) => p(r));
    }

    private run(): Result {
        const rows = db[this.table];
        let affected: Row[] = [];
        const now = new Date().toISOString();
        if (this.op === 'insert' || this.op === 'upsert') {
            const keys = this.conflict.split(',').map((k) => k.trim());
            for (const p of this.payload) {
                const existing = this.op === 'upsert' ? rows.find((r) => keys.every((k) => p[k] !== undefined && r[k] === p[k])) : undefined;
                if (existing) {
                    Object.assign(existing, p, { updated_at: now });
                    affected.push(existing);
                } else {
                    const row: Row = { id: uuid(), created_at: now, updated_at: now, ...p };
                    rows.push(row);
                    affected.push(row);
                }
            }
        } else if (this.op === 'update') {
            affected = rows.filter((r) => this.matches(r));
            for (const r of affected) Object.assign(r, this.patch);
        } else if (this.op === 'delete') {
            affected = rows.filter((r) => this.matches(r));
            db[this.table] = rows.filter((r) => !affected.includes(r));
        } else {
            affected = rows.filter((r) => this.matches(r));
        }

        if (this.op !== 'select' && this.selectStr === null) {
            return { data: null, error: null, status: 201, statusText: 'OK' };
        }
        let list = [...affected];
        for (const o of [...this.orders].reverse()) {
            list.sort((a, b) => {
                const av = a[o.col];
                const bv = b[o.col];
                if (av == null && bv == null) return 0;
                if (av == null) return o.asc ? 1 : -1;
                if (bv == null) return o.asc ? -1 : 1;
                return o.asc ? cmp(av, bv) : -cmp(av, bv);
            });
        }
        const count = list.length;
        if (this.lim !== null || this.offset) list = list.slice(this.offset, this.lim !== null ? this.offset + this.lim : undefined);
        const items = parseSelect(this.selectStr ?? '*');
        const data = list.map((r) => project(this.table, r, items));
        if (this.head) return { data: null, error: null, count, status: 200, statusText: 'OK' };
        if (this.singleMode) {
            if (data.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, status: 200, statusText: 'OK' };
            if (data.length !== 1) {
                return {
                    data: null,
                    error: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned (${this.table})`, details: '', hint: '' },
                    status: 406,
                    statusText: 'Not Acceptable',
                };
            }
            return { data: data[0], error: null, status: 200, statusText: 'OK' };
        }
        return { data, error: null, count: this.countMode ? count : null, status: 200, statusText: 'OK' };
    }

    then<T1 = Result, T2 = never>(onOk?: ((v: Result) => T1 | PromiseLike<T1>) | null, onErr?: ((e: unknown) => T2 | PromiseLike<T2>) | null) {
        return new Promise<Result>((resolve, reject) => {
            // A tick of latency, like the network — lets loaders mount and settle.
            setTimeout(() => {
                try {
                    resolve(this.run());
                } catch (e) {
                    console.error(e);
                    reject(e);
                }
            }, 5);
        }).then(onOk, onErr);
    }
}

// --- RPCs -------------------------------------------------------------------------
const rpcs: Record<string, (args: Row) => unknown> = {
    list_member_requests: () => db.member_requests_view,
    org_usage: () => ({
        members: db.profiles.length,
        locations: db.locations.filter((l) => !l.archived_at).length,
    }),
    org_plan: () => 'business',
    // `--billing beta`: the free beta is on.
    billing_free_beta: () => {
        try {
            return localStorage.getItem('demo-billing') === 'beta';
        } catch {
            return false;
        }
    },
    // Settings → Calendar: a fixed demo feed token.
    calendar_feed_token: () => 'd3m0'.replace(/[^a-f0-9]/g, '0').padEnd(64, 'a'),
    log_members_imported: () => null,
};

// --- Auth -----------------------------------------------------------------------
const me = db.profiles.find((p) => p.id === DEMO_USER_ID)!;
const authUser = {
    id: DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: me.email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-03-02T09:00:00.000Z',
};
const session = {
    access_token: 'demo-access-token',
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUser,
};
const ok = (data: unknown = {}) => Promise.resolve({ data, error: null });

const auth = new Proxy(
    {
        getSession: () => ok({ session }),
        getUser: () => ok({ user: authUser }),
        onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
            setTimeout(() => cb('INITIAL_SESSION', session), 0);
            return { data: { subscription: { id: 'demo', unsubscribe() {} } } };
        },
        signOut: () => ok(),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? (() => ok({ session, user: authUser })) },
);

// --- Realtime ---------------------------------------------------------------------
function channel(name: string) {
    const ch: any = {
        topic: `realtime:${name}`,
        on: () => ch,
        subscribe: (cb?: (status: string) => void) => {
            setTimeout(() => cb?.('SUBSCRIBED'), 0);
            return ch;
        },
        unsubscribe: () => Promise.resolve('ok'),
        send: () => Promise.resolve('ok'),
        track: () => Promise.resolve('ok'),
        untrack: () => Promise.resolve('ok'),
        presenceState: () => ({}),
    };
    return ch;
}

export const supabase: any = {
    from: (table: string) => new Query(table),
    rpc: (fn: string, args: Row = {}) => {
        const impl = rpcs[fn];
        return Promise.resolve({ data: impl ? impl(args) : null, error: null });
    },
    auth,
    channel,
    removeChannel: () => Promise.resolve('ok'),
    removeAllChannels: () => Promise.resolve([]),
    getChannels: () => [],
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
    storage: {
        from: () => ({
            upload: () => ok({ path: 'demo' }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
            remove: () => ok([]),
        }),
    },
};
