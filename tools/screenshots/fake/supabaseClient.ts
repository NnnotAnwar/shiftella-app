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
import { E2E_AUTH_KEY, E2E_DB_KEY, E2E_INVITES_KEY, E2E_PASSWORD } from './e2eConstants';
import { fakeOrgAnalytics } from './analytics';

// --- E2E mode -----------------------------------------------------------------------
// `localStorage['demo-auth']` set (by the Playwright tests) turns on the fake auth
// below and keeps the dataset in sessionStorage, so a reload or a full-page
// navigation sees earlier writes. Without it nothing changes for the screenshots.
const readStorage = (store: () => Storage, key: string): string | null => {
    try {
        return store().getItem(key);
    } catch {
        return null;
    }
};
let e2eAuth: string | null = readStorage(() => localStorage, E2E_AUTH_KEY);
const e2e = e2eAuth !== null;

function loadDb(): Tables {
    const saved = e2e ? readStorage(() => sessionStorage, E2E_DB_KEY) : null;
    if (saved) {
        try {
            return JSON.parse(saved) as Tables;
        } catch {
            /* fall through to a fresh dataset */
        }
    }
    return buildDemoData();
}
const db: Tables = loadDb();
function persist() {
    if (!e2e) return;
    try {
        sessionStorage.setItem(E2E_DB_KEY, JSON.stringify(db));
    } catch {
        /* quota / storage off: the tab just forgets on reload */
    }
}

/** What the app asked the backend for — tests read it via `window.__fakeSupabase`. */
const fake = {
    calls: [] as { name: string; args: unknown }[],
    outbox: [] as { to: string; kind: string; link: string }[],
};
function record(name: string, args: unknown) {
    fake.calls.push({ name, args: JSON.parse(JSON.stringify(args ?? null)) });
}
if (e2e) (window as unknown as { __fakeSupabase: typeof fake }).__fakeSupabase = fake;

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
    fk('app_feedback', 'user_id', 'profiles'),
    fk('app_feedback', 'organization_id', 'organizations'),
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
// E2E rows outlive the page (sessionStorage), so they need ids a reload can't repeat.
const uuid = () => (e2e && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`);

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
                    // Column defaults the real tables have (e.g. a new clock-in has no end yet).
                    const defaults: Row = this.table === 'shifts' ? { ended_at: null, previous_location_id: null } : {};
                    // app_feedback: the database fills sender, organization and status (BEFORE INSERT trigger).
                    let forced: Row = {};
                    if (this.table === 'app_feedback') {
                        const me = currentProfile();
                        forced = { user_id: me?.id ?? null, organization_id: me?.organization_id ?? null, status: 'new' };
                        Object.assign(defaults, { may_contact: false, route: null, app_version: null, language: null, user_agent: null });
                    }
                    const row: Row = { id: uuid(), created_at: now, updated_at: now, ...defaults, ...p, ...forced };
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

        if (this.op !== 'select') {
            record(`${this.op}.${this.table}`, this.op === 'update' ? this.patch : this.op === 'delete' ? null : this.payload);
            persist();
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
    // Demo data: the harness already is demo data — adding / removing is a no-op.
    seed_demo_data: () => ({ batch: 'demo-batch-0001', people: 8, locations: 2 }),
    clear_demo_data: () => ({ people: 8, locations_kept: 0 }),
    // Owner analytics: derived from the demo rota (see ./analytics.ts).
    org_analytics: (args: Row) => fakeOrgAnalytics(db, args),
    // Announcements: audience size while composing, reach per card, who read it.
    announcement_audience_size: (args: Row) => {
        const loc = args.p_location as string | null;
        return loc ? new Set(db.location_roster.filter((r) => r.location_id === loc).map((r) => r.user_id)).size : db.profiles.length - 1;
    },
    // Leave balances: entitlement from weekly hours, used = approved vacation (+ a demo history), náhradní volno for holiday work.
    leave_balances: () =>
        db.profiles
            .filter((p) => p.role !== 'Superadmin')
            .map((p, i) => {
                const mine = (kind: string, status: string) =>
                    db.time_off.filter((t) => t.user_id === p.id && t.kind === kind && t.status === status).reduce((a, t) => a + Number(t.hours ?? 0), 0);
                const weekly = i % 4 === 3 ? 30 : 40;
                const entitlement = weekly * 4;
                const used = mine('vacation', 'approved') + [24, 0, 56, 16, 8, 40, 0, 32][i % 8];
                const earned = [8, 16, 0, 8, 0, 11.5, 0, 8][i % 8];
                const compUsed = mine('comp_time', 'approved');
                return {
                    user_id: p.id,
                    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username,
                    weekly_hours: weekly,
                    vacation_entitlement: entitlement,
                    vacation_custom: false,
                    vacation_adjust: i === 2 ? 16 : 0,
                    vacation_used: used,
                    vacation_pending: mine('vacation', 'pending'),
                    vacation_left: entitlement + (i === 2 ? 16 : 0) - used,
                    comp_earned: earned,
                    comp_adjust: 0,
                    comp_used: compUsed,
                    comp_pending: mine('comp_time', 'pending'),
                    comp_left: earned - compUsed,
                };
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs')),
    announcement_reach: (args: Row) =>
        ((args.p_ids as string[]) ?? []).map((aid) => {
            const a = db.announcements.find((x) => x.id === aid);
            const audience = a?.location_id
                ? new Set(db.location_roster.filter((r) => r.location_id === a.location_id).map((r) => r.user_id)).size
                : db.profiles.length - 1;
            // Demo: most of the team has read the older notices, about half the newest one.
            const readers = Math.max(0, Math.round(audience * (aid === db.announcements[1]?.id ? 0.45 : 0.8)));
            return { announcement_id: aid, readers, audience };
        }),
    announcement_readers: (args: Row) => {
        const a = db.announcements.find((x) => x.id === args.p_id);
        const people = db.profiles.filter((p) => p.id !== a?.author_id).slice(0, 8);
        return people.map((p, i) => ({
            user_id: p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(' '),
            read_at: i % 3 === 2 ? null : String(a?.created_at ?? ''),
        }));
    },
};

// --- Auth -----------------------------------------------------------------------
// Screenshots: no `demo-auth` key → always signed in as the demo owner.
// E2E (tests in e2e/): `localStorage['demo-auth']` holds who is signed in — a
// profile id, or 'none' when signed out — and sign-in / sign-up / invite go
// through the fake auth below. Mutations then persist across reloads of the tab
// (sessionStorage), like a real backend would keep them.
const authUserFor = (p: Row) => ({
    id: p.id as string,
    aud: 'authenticated',
    role: 'authenticated',
    email: p.email as string,
    app_metadata: { provider: 'email' },
    user_metadata: { first_name: p.first_name ?? null, last_name: p.last_name ?? null },
    created_at: '2026-03-02T09:00:00.000Z',
});
const sessionFor = (p: Row) => ({
    access_token: `demo-access-token:${p.id}`,
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: authUserFor(p),
});
const ok = (data: unknown = {}) => Promise.resolve({ data, error: null });
const fail = (message: string, code: string, status = 400) =>
    Promise.resolve({ data: { user: null, session: null }, error: { name: 'AuthApiError', message, code, status } });

const profileById = (uid: string | null) => (uid ? (db.profiles.find((p) => p.id === uid) ?? null) : null);
const currentProfile = (): Row | null => (e2e ? profileById(e2eAuth === 'none' ? null : e2eAuth) : profileById(DEMO_USER_ID));
const currentSession = () => {
    const p = currentProfile();
    return p ? sessionFor(p) : null;
};

type AuthListener = (event: string, s: unknown) => void;
const listeners = new Set<AuthListener>();
function signInAs(p: Row | null, event: 'SIGNED_IN' | 'SIGNED_OUT') {
    e2eAuth = p ? (p.id as string) : 'none';
    try {
        localStorage.setItem(E2E_AUTH_KEY, e2eAuth);
    } catch {
        /* storage off */
    }
    const s = currentSession();
    setTimeout(() => listeners.forEach((cb) => cb(event, s)), 0);
    return s;
}

const findByLogin = (login: string) =>
    db.profiles.find((p) => String(p.email).toLowerCase() === login.toLowerCase() || String(p.username).toLowerCase() === login.toLowerCase()) ?? null;

/** Invites sent in this browser (token → who), so the "email link" works after a reload. */
const INVITES_KEY = E2E_INVITES_KEY;
type Invite = { email: string; first_name: string | null; last_name: string | null; role: string; org_role_id: string | null; organization_id: string };
const readInvites = (): Record<string, Invite> => {
    try {
        return JSON.parse(localStorage.getItem(INVITES_KEY) ?? '{}');
    } catch {
        return {};
    }
};

const authImpl: Record<string, unknown> = {
    getSession: () => ok({ session: currentSession() }),
    getUser: () => {
        const p = currentProfile();
        return ok({ user: p ? authUserFor(p) : null });
    },
    onAuthStateChange: (cb: AuthListener) => {
        listeners.add(cb);
        setTimeout(() => cb('INITIAL_SESSION', currentSession()), 0);
        return { data: { subscription: { id: 'demo', unsubscribe: () => listeners.delete(cb) } } };
    },
    signOut: () => {
        if (e2e) signInAs(null, 'SIGNED_OUT');
        return ok();
    },
    signInWithPassword: ({ email, password }: { email: string; password: string }) => {
        if (!e2e) return ok({ session: currentSession(), user: currentSession()?.user });
        const p = findByLogin(email);
        if (!p || password !== E2E_PASSWORD) return fail('Invalid login credentials', 'invalid_credentials');
        const s = signInAs(p, 'SIGNED_IN');
        return ok({ session: s, user: s?.user });
    },
    setSession: ({ access_token }: { access_token: string }) => {
        const p = profileById(access_token.replace(/^demo-access-token:/, ''));
        if (!p) return fail('Invalid token', 'bad_jwt', 401);
        const s = e2e ? signInAs(p, 'SIGNED_IN') : sessionFor(p);
        return ok({ session: s, user: s?.user });
    },
    signUp: ({ email, options }: { email: string; password: string; options?: { data?: Row } }) => {
        record('auth.signUp', { email, data: options?.data ?? {} });
        if (findByLogin(email)) return fail('User already registered', 'user_already_exists', 422);
        // Like production: email confirmation is on, so no session yet.
        return ok({ user: { id: uuid(), email, user_metadata: options?.data ?? {} }, session: null });
    },
    resend: (args: Row) => {
        record('auth.resend', args);
        return ok();
    },
    resetPasswordForEmail: (email: string) => {
        record('auth.resetPasswordForEmail', { email });
        return ok();
    },
    verifyOtp: ({ token_hash, type }: { token_hash: string; type: string }) => {
        const inv = type === 'invite' ? readInvites()[token_hash] : undefined;
        if (!e2e || !inv) return fail('Email link is invalid or has expired', 'otp_expired', 403);
        let p = findByLogin(inv.email);
        if (!p) {
            p = {
                id: uuid(),
                username: inv.email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase(),
                first_name: inv.first_name,
                last_name: inv.last_name,
                email: inv.email,
                role: inv.role,
                organization_id: inv.organization_id,
                username_changed_at: null,
                manager_id: null,
                org_role_id: inv.org_role_id,
                created_at: new Date().toISOString(),
            };
            db.profiles.push(p);
            persist();
        }
        const s = signInAs(p, 'SIGNED_IN');
        return ok({ session: s, user: s?.user });
    },
    updateUser: (attrs: Row) => {
        record('auth.updateUser', { ...attrs, password: attrs.password ? '***' : undefined });
        const p = currentProfile();
        return p ? ok({ user: authUserFor(p) }) : fail('Auth session missing!', 'session_not_found', 401);
    },
};
const auth = new Proxy(authImpl, {
    get: (target, key: string) => target[key] ?? (() => ok({ session: currentSession(), user: currentSession()?.user ?? null })),
});

// --- Edge Functions ---------------------------------------------------------------
const functionsImpl: Record<string, (body: Row) => unknown> = {
    // Username sign-in returns tokens the client adopts with setSession().
    'username-login': (body) => {
        const p = e2e ? findByLogin(String(body.username ?? '')) : profileById(DEMO_USER_ID);
        if (!p || (e2e && body.password !== E2E_PASSWORD)) return { error: 'invalid' };
        return { access_token: `demo-access-token:${p.id}`, refresh_token: 'demo-refresh-token' };
    },
    // The invite "email": its link is readable by tests via window.__fakeSupabase.outbox.
    'invite-employee': (body) => {
        const token = `e2e-invite-${Object.keys(readInvites()).length + 1}`;
        const invites = readInvites();
        invites[token] = {
            email: String(body.email),
            first_name: (body.first_name as string) ?? null,
            last_name: (body.last_name as string) ?? null,
            role: String(body.role ?? 'Employee'),
            org_role_id: (body.org_role_id as string) ?? null,
            organization_id: String(body.organization_id),
        };
        try {
            localStorage.setItem(INVITES_KEY, JSON.stringify(invites));
        } catch {
            /* storage off */
        }
        const link = `${String(body.redirect_to ?? '/accept-invite')}?token_hash=${token}&type=invite`;
        fake.outbox.push({ to: String(body.email), kind: 'invite', link });
        return { ok: true };
    },
};

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
        record(`rpc.${fn}`, args);
        const impl = rpcs[fn];
        return Promise.resolve({ data: impl ? impl(args) : null, error: null });
    },
    auth,
    channel,
    removeChannel: () => Promise.resolve('ok'),
    removeAllChannels: () => Promise.resolve([]),
    getChannels: () => [],
    functions: {
        invoke: (fn: string, opts?: { body?: Row }) => {
            record(`functions.${fn}`, opts?.body ?? {});
            const impl = functionsImpl[fn];
            const data = impl ? impl(opts?.body ?? {}) : { ok: true };
            const err = data && typeof data === 'object' && 'error' in (data as Row);
            return Promise.resolve(
                err
                    ? { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(data), { status: 400 }) } }
                    : { data, error: null },
            );
        },
    },
    storage: {
        from: () => ({
            upload: () => ok({ path: 'demo' }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
            remove: () => ok([]),
            createSignedUrl: () => ok({ signedUrl: 'about:blank' }),
        }),
    },
};
