/**
 * Fake `org_analytics` for the screenshot harness — the same payload shape the
 * real RPC returns (supabase/migrations/20261125130000_owner_analytics.sql),
 * derived from the invented demo rota: every past published shift is "worked"
 * with a deterministic sprinkle of late arrivals, no-shows and overtime.
 */
import type { Row, Tables } from './demoData';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const net = (gross: number) => (gross <= 0 ? 0 : Math.max(0, gross - Math.floor((gross - 0.0001) / 6) * 0.5));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Stable 0…1 from a string (FNV-1a). */
function rand(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
}

export function fakeOrgAnalytics(db: Tables, args: Row) {
    const from = String(args.p_from);
    const to = String(args.p_to);
    const loc = (args.p_location as string | null) ?? null;
    const now = Date.now();
    const name = (uid: string) => {
        const p = db.profiles.find((x) => x.id === uid);
        return p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || String(p.username) : '—';
    };
    const rate = (uid: string) => Number(db.member_wages.find((w) => w.user_id === uid)?.hourly_rate ?? 0) || null;

    type M = { worked: number; planned: number; absence: number; on_time: number; late_15: number; late_60: number; no_show: number; lateMin: number[] };
    const members = new Map<string, M>();
    const m = (uid: string) => {
        let x = members.get(uid);
        if (!x) members.set(uid, (x = { worked: 0, planned: 0, absence: 0, on_time: 0, late_15: 0, late_60: 0, no_show: 0, lateMin: [] }));
        return x;
    };
    const days = new Map<string, { worked: number; planned: number }>();
    for (let d = new Date(from + 'T00:00'); ymd(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.set(ymd(d), { worked: 0, planned: 0 });
    const locs = new Map<string | null, { worked: number; planned: number; cost: number }>();
    const lc = (id: string | null) => {
        let x = locs.get(id);
        if (!x) locs.set(id, (x = { worked: 0, planned: 0, cost: 0 }));
        return x;
    };
    const heat = new Map<string, number>();
    const dows = new Map<number, number>();
    const today = ymd(new Date());
    for (const d of days.keys()) {
        if (d > today) continue;
        const w = new Date(d + 'T00:00').getDay() || 7;
        dows.set(w, (dows.get(w) ?? 0) + 1);
    }

    for (const s of db.scheduled_shifts) {
        if (!s.published || s.demo_batch) continue;
        if (db.profiles.find((x) => x.id === s.user_id)?.demo_batch) continue; // sample people never count
        const start = new Date(String(s.starts_at));
        const end = new Date(String(s.ends_at));
        const day = ymd(start);
        if (day < from || day > to || (loc && s.location_id !== loc)) continue;
        const uid = String(s.user_id);
        const plannedH = net((end.getTime() - start.getTime()) / 3600000);
        m(uid).planned += plannedH;
        days.get(day)!.planned += plannedH;
        lc((s.location_id as string) ?? null).planned += plannedH;
        if (start.getTime() > now) continue;

        const r = rand(String(s.id));
        const late = r < 0.05 ? null : r < 0.1 ? 60 + Math.round(r * 300) : r < 0.22 ? 15 + Math.round(r * 100) : Math.round(r * 8) - 4;
        const mm = m(uid);
        if (late === null) {
            if (end.getTime() <= now) mm.no_show += 1;
            continue;
        }
        if (late >= 60) mm.late_60 += 1;
        else if (late >= 15) mm.late_15 += 1;
        else mm.on_time += 1;
        if (late >= 15) mm.lateMin.push(late);
        if (end.getTime() > now) continue; // still on the clock
        const inAt = start.getTime() + Math.max(0, late) * 60000;
        const extra = rand(String(s.id) + 'x') < 0.25 ? Math.round(rand(String(s.id) + 'y') * 75) : 0;
        const outAt = end.getTime() + extra * 60000;
        const h = net((outAt - inAt) / 3600000);
        mm.worked += h;
        days.get(day)!.worked += h;
        const l = lc((s.location_id as string) ?? null);
        l.worked += h;
        l.cost += h * (rate(uid) ?? 0);
        for (let t = new Date(inAt).setMinutes(0, 0, 0); t < outAt; t += 3600000) {
            const slot = new Date(t);
            if (ymd(slot) < from || ymd(slot) > to) continue;
            const ov = (Math.min(t + 3600000, outAt) - Math.max(t, inAt)) / 3600000;
            const k = `${slot.getDay() || 7}:${slot.getHours()}`;
            heat.set(k, (heat.get(k) ?? 0) + ov);
        }
    }

    const absences = new Map<string, { people: Set<string>; days: number; hours: number }>();
    for (const t of db.time_off) {
        if (db.profiles.find((x) => x.id === t.user_id)?.demo_batch) continue;
        if (t.status !== 'approved' || String(t.ends_on) < from || String(t.starts_on) > to) continue;
        const total = (Date.parse(String(t.ends_on)) - Date.parse(String(t.starts_on))) / 86400000 + 1;
        const a = String(t.starts_on) > from ? String(t.starts_on) : from;
        const b = String(t.ends_on) < to ? String(t.ends_on) : to;
        const inside = (Date.parse(b) - Date.parse(a)) / 86400000 + 1;
        const hours = (Number(t.hours ?? total * 8) * inside) / total;
        const x = absences.get(String(t.kind)) ?? { people: new Set<string>(), days: 0, hours: 0 };
        x.people.add(String(t.user_id));
        x.days += inside;
        x.hours += hours;
        absences.set(String(t.kind), x);
        m(String(t.user_id)).absence += hours;
    }

    const memberRows = [...members.entries()].map(([uid, x]) => ({
        user_id: uid,
        name: name(uid),
        worked: r2(x.worked),
        planned: r2(x.planned),
        absence_hours: r2(x.absence),
        on_time: x.on_time,
        late_15: x.late_15,
        late_60: x.late_60,
        no_show: x.no_show,
        avg_late_min: x.lateMin.length ? Math.round(x.lateMin.reduce((s, v) => s + v, 0) / x.lateMin.length) : null,
        cost: rate(uid) === null ? null : r2(x.worked * rate(uid)!),
    }));
    const sum = (k: 'on_time' | 'late_15' | 'late_60' | 'no_show') => memberRows.reduce((s, r) => s + r[k], 0);
    const allLate = [...members.values()].flatMap((x) => x.lateMin);
    const worked = memberRows.reduce((s, r) => s + r.worked, 0);
    const planned = memberRows.reduce((s, r) => s + r.planned, 0);

    return {
        from,
        to,
        location_id: loc,
        can_cost: true,
        currency: 'CZK',
        totals: {
            worked: r2(worked),
            planned: r2(planned),
            absence_hours: r2([...absences.values()].reduce((s, a) => s + a.hours, 0)),
            cost: r2(memberRows.reduce((s, r) => s + (r.cost ?? 0), 0)),
            planned_cost: r2([...members.entries()].reduce((s, [uid, x]) => s + x.planned * (rate(uid) ?? 0), 0)),
            uncosted_hours: 0,
        },
        days: [...days.entries()].map(([day, v]) => ({ day, worked: r2(v.worked), planned: r2(v.planned) })),
        locations: [...locs.entries()]
            .map(([id, v]) => ({ location_id: id, name: db.locations.find((l) => l.id === id)?.name ?? null, worked: r2(v.worked), planned: r2(v.planned), cost: r2(v.cost) }))
            .sort((a, b) => b.worked - a.worked),
        members: memberRows.sort((a, b) => a.name.localeCompare(b.name, 'cs')),
        absences: [...absences.entries()]
            .map(([kind, a]) => ({ kind, people: a.people.size, days: a.days, hours: r2(a.hours) }))
            .sort((a, b) => b.hours - a.hours),
        lateness: {
            on_time: sum('on_time'),
            late_15: sum('late_15'),
            late_60: sum('late_60'),
            no_show: sum('no_show'),
            avg_late_min: allLate.length ? Math.round(allLate.reduce((s, v) => s + v, 0) / allLate.length) : null,
        },
        heatmap: [...heat.entries()]
            .map(([k, ph]) => {
                const [dow, hour] = k.split(':').map(Number);
                return { dow, hour, people: r2(ph / (dows.get(dow) ?? 1)) };
            })
            .sort((a, b) => a.dow - b.dow || a.hour - b.hour),
    };
}
