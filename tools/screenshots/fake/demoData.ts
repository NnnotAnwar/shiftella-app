/**
 * --- DEMO DATASET (screenshot harness only) ---
 * One invented organization — "Kavárna U Mostu", a Prague café with three
 * locations — and twelve invented people. Every name, e-mail and number here
 * is made up; nothing comes from a real account.
 *
 * All dates are built relative to the (pinned) current time in the browser's
 * time zone, so the harness can be re-shot on any day: the rota covers the
 * current month, worked shifts cover the last three months, and "today" has
 * people on shift.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

const id = (kind: number, n: number) => `00000000-0000-4000-8${String(kind).padStart(3, '0')}-${String(n).padStart(12, '0')}`;

const ORG = id(0, 1);
export const DEMO_USER_ID = id(1, 1);

// --- People -----------------------------------------------------------------------
const P = {
    petra: id(1, 1),
    tomas: id(1, 2),
    jana: id(1, 3),
    martin: id(1, 4),
    eva: id(1, 5),
    lukas: id(1, 6),
    klara: id(1, 7),
    ondrej: id(1, 8),
    tereza: id(1, 9),
    jakub: id(1, 10),
    veronika: id(1, 11),
    david: id(1, 12),
};

const L = { mala: id(2, 1), karlin: id(2, 2), vino: id(2, 3) };

const R = {
    employee: id(3, 1),
    supervisor: id(3, 2),
    manager: id(3, 3),
    admin: id(3, 4),
    head: id(3, 5),
    barista: id(3, 6),
    cook: id(3, 7),
};

/**
 * Billing scenario for the subscription row: `localStorage['demo-billing']` =
 * 'trial' (20 days left) | 'trial3' (3 days left) | 'free' (trial ended) |
 * 'past_due' | 'ended' (the paid Stripe subscription was canceled → Free) |
 * 'cancel_scheduled' (switched to Free: ends at the period end); 'beta' (an
 * expired trial under the free beta — billing_free_beta() answers true); anything
 * else = a paid Business plan (the README shots).
 */
function billingScenario(): string | null {
    try {
        return localStorage.getItem('demo-billing');
    } catch {
        return null;
    }
}

/**
 * Demo-data scenario (features/demo): `localStorage['demo-org']` = 'fresh' (a new
 * owner: only they and nothing planned count, so Home shows the setup checklist
 * with "Try it with demo data") | 'on' (the org holds demo data: everyone else,
 * the rota and two locations are tagged → the demo banner + the checklist).
 */
function demoOrgScenario(): string | null {
    try {
        return localStorage.getItem('demo-org');
    } catch {
        return null;
    }
}

// --- Date helpers (local time = Europe/Prague in the harness) ----------------------
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date: Date, hhmm: string, plusMin = 0) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m + plusMin).toISOString();
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysAgo = (n: number, hhmm = '09:00') => at(addDays(new Date(), -n), hhmm);
/** Deterministic pseudo-random jitter in [-a, b] minutes. */
const jitter = (seed: number, a: number, b: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return Math.round((x - Math.floor(x)) * (a + b)) - a;
};

// --- Rota patterns ------------------------------------------------------------------
// Shift kinds: D = the location's opening hours (shows as its letter in the grid),
// R = morning, O = afternoon, K = kitchen, P = the owner's day. Restaurants run a
// "short / long week" (2-2-3): week A works Mon Tue + Fri Sat Sun, week B Wed Thu.
type Kind = 'D' | 'R' | 'O' | 'K' | 'k' | 'P' | 'p' | '.';
const TIMES: Record<Exclude<Kind, '.' | 'D'>, [string, string]> = {
    R: ['08:00', '14:00'],
    O: ['14:00', '20:00'],
    K: ['08:00', '16:00'],
    k: ['09:00', '17:00'],
    P: ['08:00', '16:00'],
    p: ['08:00', '13:00'],
};
const HOURS: Record<string, [string, string]> = {
    [L.mala]: ['08:00', '20:00'],
    [L.karlin]: ['08:00', '20:00'],
    [L.vino]: ['09:00', '21:00'],
};

interface Plan {
    user: string;
    loc: string;
    a: string; // Mon..Sun, week A
    b: string; // Mon..Sun, week B
}
const PLANS: Plan[] = [
    { user: P.petra, loc: L.mala, a: 'PP.PP..', b: 'PP.PPp.' },
    { user: P.tomas, loc: L.mala, a: 'DD..DDD', b: '..DD...' },
    { user: P.eva, loc: L.mala, a: '..DD...', b: 'DD..DDD' },
    { user: P.ondrej, loc: L.mala, a: 'OOO..OO', b: 'O..OOO.' },
    { user: P.veronika, loc: L.mala, a: 'R.R.RO.', b: '.R.R..O' },
    { user: P.martin, loc: L.karlin, a: 'DD..DDD', b: '..DD...' },
    { user: P.david, loc: L.karlin, a: '..DD...', b: 'DD..DDD' },
    { user: P.lukas, loc: L.karlin, a: 'KKK..KK', b: 'KK.KK.K' },
    { user: P.tereza, loc: L.karlin, a: 'OO.OO..', b: '.OO.OO.' },
    { user: P.jana, loc: L.vino, a: 'DD..DDD', b: '..DD...' },
    { user: P.klara, loc: L.vino, a: '..DD...', b: 'DD..DDD' },
    { user: P.jakub, loc: L.vino, a: 'kk...kk', b: 'k..kkk.' },
];

/** ISO week parity relative to a fixed Monday, so the pattern is stable across months. */
const weekA = (d: Date) => {
    const weeks = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 5)) / (7 * 86400000));
    return weeks % 2 !== 0; // parity chosen so the pinned "today" falls on a week-B Thursday
};
const kindOn = (plan: Plan, d: Date): Kind => {
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    return (weekA(d) ? plan.a : plan.b)[dow] as Kind;
};
const timesFor = (plan: Plan, kind: Kind): [string, string] => (kind === 'D' ? HOURS[plan.loc] : TIMES[kind as keyof typeof TIMES]);

// --- Build ----------------------------------------------------------------------------
export function buildDemoData(): Tables {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const created = '2026-03-02T09:00:00.000Z';

    const organizations: Row[] = [{ id: ORG, name: 'Kavárna U Mostu', slug: 'kavarna-u-mostu', created_at: created }];

    const locations: Row[] = [
        { id: L.mala, name: 'U Mostu – Malá Strana', code: 'M', organization_id: ORG, archived_at: null, created_at: created },
        { id: L.karlin, name: 'Karlín', code: 'K', organization_id: ORG, archived_at: null, created_at: created },
        { id: L.vino, name: 'Vinohrady', code: 'V', organization_id: ORG, archived_at: null, created_at: created },
    ];

    const roles: Row[] = [
        { name: 'Superadmin', color: '#9333ea', description: 'Full system access', is_admin: true, rank: 100 },
        { name: 'Head Admin', color: '#f59e0b', description: 'Organization owner', is_admin: true, rank: 40 },
        { name: 'Admin', color: '#ef4444', description: 'Organization admin', is_admin: true, rank: 30 },
        { name: 'Manager', color: '#eab308', description: 'View only', is_admin: true, rank: 20 },
        { name: 'Supervisor', color: '#3b82f6', description: 'Shift control', is_admin: false, rank: 10 },
        { name: 'Employee', color: '#22c55e', description: 'Employee', is_admin: false, rank: 0 },
    ];

    // Presets as a Czech owner would rename them (Head Admin can't be renamed),
    // plus two custom roles.
    const org_roles: Row[] = [
        { id: R.head, organization_id: ORG, name: 'Head Admin', color: '#f59e0b', base_role: 'Head Admin', preset_key: 'head_admin', sort: 40, created_at: created },
        { id: R.admin, organization_id: ORG, name: 'Admin', color: '#ef4444', base_role: 'Admin', preset_key: 'admin', sort: 30, created_at: created },
        { id: R.manager, organization_id: ORG, name: 'Provozní', color: '#eab308', base_role: 'Manager', preset_key: 'manager', sort: 20, created_at: created },
        { id: R.supervisor, organization_id: ORG, name: 'Vedoucí směny', color: '#3b82f6', base_role: 'Supervisor', preset_key: 'supervisor', sort: 10, created_at: created },
        { id: R.barista, organization_id: ORG, name: 'Barista', color: '#8b5cf6', base_role: 'Employee', preset_key: null, sort: 5, created_at: created },
        { id: R.cook, organization_id: ORG, name: 'Kuchař', color: '#f97316', base_role: 'Employee', preset_key: null, sort: 3, created_at: created },
        { id: R.employee, organization_id: ORG, name: 'Obsluha', color: '#22c55e', base_role: 'Employee', preset_key: 'employee', sort: 0, created_at: created },
    ];

    const perm = (role: string, areas: string[], write: boolean) =>
        areas.map((area) => ({ id: `${role}-${area}`, role_id: role, area, can_read: true, can_write: write, can_delete: write }));
    const ALL = ['rota', 'timesheets', 'requests', 'announcements', 'members', 'wages', 'locations', 'activity', 'roles'];
    const org_role_permissions: Row[] = [
        ...perm(R.head, ALL, true),
        ...perm(R.admin, ['rota', 'timesheets', 'requests', 'announcements', 'members', 'wages'], true),
        ...perm(R.admin, ['locations', 'activity'], false),
        ...perm(R.manager, ['rota', 'timesheets', 'requests', 'members', 'announcements'], false),
        ...perm(R.supervisor, ['rota'], false),
    ];

    const person = (
        uid: string,
        username: string,
        first: string,
        last: string,
        role: string,
        orgRole: string,
        manager: string | null,
    ): Row => ({
        id: uid,
        username,
        first_name: first,
        last_name: last,
        email: `${username}@umostu.example`,
        role,
        organization_id: ORG,
        username_changed_at: null,
        manager_id: manager,
        org_role_id: orgRole,
        created_at: created,
    });
    const profiles: Row[] = [
        person(P.petra, 'petra.novakova', 'Petra', 'Nováková', 'Head Admin', R.head, null),
        person(P.tomas, 'tomas.kral', 'Tomáš', 'Král', 'Manager', R.manager, P.petra),
        person(P.jana, 'jana.vesela', 'Jana', 'Veselá', 'Supervisor', R.supervisor, P.petra),
        person(P.martin, 'martin.svoboda', 'Martin', 'Svoboda', 'Manager', R.manager, P.petra),
        person(P.eva, 'eva.dvorakova', 'Eva', 'Dvořáková', 'Employee', R.barista, P.tomas),
        person(P.lukas, 'lukas.cerny', 'Lukáš', 'Černý', 'Employee', R.cook, P.martin),
        person(P.klara, 'klara.horakova', 'Klára', 'Horáková', 'Employee', R.barista, P.petra),
        person(P.ondrej, 'ondrej.prochazka', 'Ondřej', 'Procházka', 'Employee', R.employee, P.tomas),
        person(P.tereza, 'tereza.kucerova', 'Tereza', 'Kučerová', 'Employee', R.employee, P.martin),
        person(P.jakub, 'jakub.marek', 'Jakub', 'Marek', 'Employee', R.cook, P.petra),
        person(P.veronika, 'veronika.pokorna', 'Veronika', 'Pokorná', 'Employee', R.employee, P.tomas),
        person(P.david, 'david.benes', 'David', 'Beneš', 'Supervisor', R.supervisor, P.martin),
    ];
    const baseRole = (uid: string) => profiles.find((p) => p.id === uid)!.role as string;

    const location_roster: Row[] = PLANS.map((p, i) => ({ id: id(4, i + 1), location_id: p.loc, user_id: p.user, organization_id: ORG, added_by: P.petra }));

    // --- Leave (approved leave clears planned shifts, like the DB trigger) ---------
    const md = (day: number, monthOffset = 0) => ymd(new Date(today.getFullYear(), today.getMonth() + monthOffset, day));
    const time_off: Row[] = [
        { id: id(5, 1), user_id: P.tereza, organization_id: ORG, kind: 'vacation', starts_on: md(21), ends_on: md(27), hours: 40, hours_auto: true, note: 'Vánoce u rodiny v Brně', status: 'pending', reviewed_by: null, review_note: null, reviewed_at: null, created_at: daysAgo(3, '18:12') },
        { id: id(5, 2), user_id: P.ondrej, organization_id: ORG, kind: 'comp_time', starts_on: md(31), ends_on: md(31), hours: 8, hours_auto: true, note: 'Za práci na Štědrý den', status: 'pending', reviewed_by: null, review_note: null, reviewed_at: null, created_at: daysAgo(1, '21:40') },
        { id: id(5, 3), user_id: P.lukas, organization_id: ORG, kind: 'sick', starts_on: md(8), ends_on: md(9), note: 'Angína, neschopenka do středy', status: 'approved', reviewed_by: P.petra, review_note: 'Brzy se uzdrav!', reviewed_at: daysAgo(2, '07:15'), created_at: daysAgo(2, '06:48') },
        { id: id(5, 4), user_id: P.eva, organization_id: ORG, kind: 'vacation', starts_on: md(28), ends_on: md(31), hours: 32, hours_auto: true, note: 'Hory s rodinou', status: 'approved', reviewed_by: P.petra, review_note: null, reviewed_at: daysAgo(14, '10:02'), created_at: daysAgo(16, '15:30') },
        { id: id(5, 5), user_id: P.jakub, organization_id: ORG, kind: 'vacation', starts_on: md(19), ends_on: md(20), note: 'Prodloužený víkend', status: 'declined', reviewed_by: P.petra, review_note: 'Ten víkend máme firemní večírek na Vinohradech – zkusíme jiný termín?', reviewed_at: daysAgo(5, '11:20'), created_at: daysAgo(6, '19:05') },
        { id: id(5, 6), user_id: P.petra, organization_id: ORG, kind: 'vacation', starts_on: md(4, 1), ends_on: md(8, 1), hours: 40, hours_auto: true, note: 'Lyže', status: 'approved', reviewed_by: P.petra, review_note: null, reviewed_at: daysAgo(20, '08:30'), created_at: daysAgo(20, '08:29') },
    ];
    const onLeave = (uid: string, day: string) =>
        time_off.some((t) => t.status === 'approved' && t.user_id === uid && (t.starts_on as string) <= day && day <= (t.ends_on as string));

    // --- Rota for the current month (published) -------------------------------------
    const scheduled_shifts: Row[] = [];
    let n = 0;
    for (let d = new Date(monthStart); d < nextMonthStart; d = addDays(d, 1)) {
        for (const plan of PLANS) {
            const kind = kindOn(plan, d);
            if (kind === '.' || onLeave(plan.user, ymd(d))) continue;
            const [s, e] = timesFor(plan, kind);
            scheduled_shifts.push({
                id: id(6, ++n),
                user_id: plan.user,
                organization_id: ORG,
                location_id: plan.loc,
                starts_at: at(d, s),
                ends_at: at(d, e),
                all_day: false,
                published: true,
                note: null,
                created_by: P.petra,
                created_at: daysAgo(18, '20:00'),
                updated_at: daysAgo(18, '20:00'),
            });
        }
    }
    const planned = (uid: string, day: number) =>
        scheduled_shifts.find((s) => s.user_id === uid && ymd(new Date(s.starts_at as string)) === md(day))!;

    // --- Worked shifts: the owner's last three months + today's live board ------------
    const shifts: Row[] = [];
    let sn = 0;
    const histStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const petraPlan = PLANS[0];
    for (let d = new Date(histStart); d < today; d = addDays(d, 1)) {
        const kind = kindOn(petraPlan, d);
        if (kind === '.') continue;
        const [s, e] = timesFor(petraPlan, kind);
        const seed = d.getTime() / 86400000;
        shifts.push({
            id: id(7, ++sn),
            user_id: P.petra,
            location_id: L.mala,
            previous_location_id: null,
            organization_id: ORG,
            started_at: at(d, s, jitter(seed, 9, 4)),
            ended_at: at(d, e, jitter(seed + 1, 5, 40)),
            role: 'Head Admin',
        });
    }
    // Live now: whoever's planned shift has started (+ a location switch).
    for (const plan of PLANS) {
        const kind = kindOn(plan, today);
        if (kind === '.') continue;
        const [s] = timesFor(plan, kind);
        const start = at(today, s, jitter(sn + plan.user.length + s.length * 7, 6, 3));
        if (Date.parse(start) > now.getTime()) continue;
        const moved = plan.user === P.veronika;
        shifts.push({
            id: id(7, ++sn),
            user_id: plan.user,
            location_id: plan.loc,
            previous_location_id: moved ? L.karlin : null,
            organization_id: ORG,
            started_at: start,
            ended_at: null,
            role: baseRole(plan.user),
        });
    }

    // --- Swaps ---------------------------------------------------------------------------
    const swapShift = planned(P.eva, 12) ?? scheduled_shifts.find((s) => s.user_id === P.eva && Date.parse(s.starts_at as string) > now.getTime())!;
    const openOffer = scheduled_shifts.find((s) => s.user_id === P.ondrej && Date.parse(s.starts_at as string) > now.getTime() + 5 * 86400000)!;
    const pastSwap = scheduled_shifts.find((s) => s.user_id === P.tomas && Date.parse(s.starts_at as string) < now.getTime())!;
    const shift_swaps: Row[] = [
        { id: id(8, 1), organization_id: ORG, shift_id: swapShift.id, from_user: P.eva, to_user: null, taker_id: P.veronika, status: 'taken', note: 'V sobotu mám svatbu kamarádky.', review_note: null, reviewed_at: null, created_at: daysAgo(2, '13:10'), updated_at: daysAgo(1, '09:42') },
        { id: id(8, 2), organization_id: ORG, shift_id: openOffer.id, from_user: P.ondrej, to_user: null, taker_id: null, status: 'open', note: 'Zkouška ve škole, vezme to někdo?', review_note: null, reviewed_at: null, created_at: daysAgo(1, '16:25'), updated_at: daysAgo(1, '16:25') },
        { id: id(8, 3), organization_id: ORG, shift_id: pastSwap.id, from_user: P.tomas, to_user: null, taker_id: P.eva, status: 'approved', note: 'Lékař', review_note: 'Díky, Evo!', reviewed_at: daysAgo(9, '08:05'), created_at: daysAgo(11, '12:00'), updated_at: daysAgo(9, '08:05') },
    ];

    // --- Member requests (what the list_member_requests RPC returns) ---------------------
    const member_requests_view: Row[] = [
        { id: id(9, 1), organization_id: ORG, user_id: P.jana, person_name: 'Jana Veselá', kind: 'role', subject: null, body: 'Od ledna bych ráda převzala provoz na Vinohradech.', org_role_id: R.manager, role_name: 'Provozní', role_color: '#eab308', current_role_name: 'Vedoucí směny', anonymous: false, status: 'pending', review_note: null, reviewer_name: null, reviewed_at: null, created_at: daysAgo(2, '20:31'), mine: false, can_review: true },
        { id: id(9, 2), organization_id: ORG, user_id: P.ondrej, person_name: 'Ondřej Procházka', kind: 'other', subject: 'Nové zástěry', body: 'Ty současné jsou už dost seprané – šlo by objednat nové, ideálně s kapsou na telefon?', org_role_id: null, role_name: null, role_color: null, current_role_name: null, anonymous: false, status: 'pending', review_note: null, reviewer_name: null, reviewed_at: null, created_at: daysAgo(1, '10:05'), mine: false, can_review: true },
        { id: id(9, 3), organization_id: ORG, user_id: null, person_name: null, kind: 'complaint', subject: 'Přeplněný sklad v Karlíně', body: 'Krabice s mlékem se skládají až ke dveřím, špatně se tam chodí.', org_role_id: null, role_name: null, role_color: null, current_role_name: null, anonymous: true, status: 'approved', review_note: 'Díky za upozornění – nové regály přijdou v pondělí.', reviewer_name: 'Petra Nováková', reviewed_at: daysAgo(6, '09:12'), created_at: daysAgo(8, '22:47'), mine: false, can_review: false },
        { id: id(9, 4), organization_id: ORG, user_id: P.eva, person_name: 'Eva Dvořáková', kind: 'role', subject: null, body: 'Mám za sebou baristický kurz.', org_role_id: R.barista, role_name: 'Barista', role_color: '#8b5cf6', current_role_name: 'Obsluha', anonymous: false, status: 'approved', review_note: 'Gratuluji!', reviewer_name: 'Petra Nováková', reviewed_at: daysAgo(12, '14:00'), created_at: daysAgo(13, '17:20'), mine: false, can_review: false },
    ];

    const name_change_requests: Row[] = [
        { id: id(10, 1), user_id: P.veronika, organization_id: ORG, current_first_name: 'Veronika', current_last_name: 'Pokorná', requested_first_name: 'Veronika', requested_last_name: 'Šťastná', note: 'Vdala jsem se, prosím o změnu příjmení.', review_note: null, status: 'pending', reviewed_at: null, created_at: daysAgo(1, '19:55') },
    ];

    const announcements: Row[] = [
        { id: id(11, 1), organization_id: ORG, location_id: null, author_id: P.petra, title: 'Vánoční otevírací doba', body: 'Na Štědrý den zavíráme ve 14:00, 25. a 26. 12. máme otevřeno 10–18. Rozpis na prosinec je zveřejněný – projděte si své směny a potvrďte je.', pinned: true, created_at: daysAgo(4, '08:30'), updated_at: daysAgo(4, '08:30') },
        { id: id(11, 2), organization_id: ORG, location_id: null, author_id: P.tomas, title: 'Zimní nabídka na lístku', body: 'Od pondělí nabízíme perníkové latte a horký jablečný mošt. Ochutnávka pro celý tým v pátek v 15:00 na Malé Straně.', pinned: false, created_at: daysAgo(2, '11:15'), updated_at: daysAgo(2, '11:15') },
        { id: id(11, 3), organization_id: ORG, location_id: L.karlin, author_id: P.martin, title: 'Karlín: servis kávovaru', body: 'Ve středu ráno přijde technik, do 9:00 jedeme jen s jedním mlýnkem.', pinned: false, created_at: daysAgo(6, '17:00'), updated_at: daysAgo(6, '17:00') },
    ];
    // The newest one is still unread, so Home shows its banner.
    const announcement_reads: Row[] = announcements
        .filter((a) => a.id !== id(11, 2))
        .map((a, i) => ({ id: id(12, i + 1), announcement_id: a.id, user_id: P.petra, organization_id: ORG, read_at: daysAgo(1) }));

    const open_shifts: Row[] = [
        { id: id(13, 1), organization_id: ORG, location_id: L.karlin, role: 'Obsluha', starts_at: at(addDays(today, 2), '14:00'), ends_at: at(addDays(today, 2), '20:00'), note: 'Posila na adventní trhy', created_by: P.martin, claimed_by: null, claimed_at: null, created_at: daysAgo(1, '12:00') },
        { id: id(13, 2), organization_id: ORG, location_id: L.vino, role: 'Barista', starts_at: at(addDays(today, 9), '09:00'), ends_at: at(addDays(today, 9), '15:00'), note: null, created_by: P.petra, claimed_by: P.klara, claimed_at: daysAgo(1, '18:20'), created_at: daysAgo(3, '09:00') },
    ];

    const shift_templates: Row[] = [
        { id: id(14, 1), organization_id: ORG, name: 'Ranní', role: null, start_time: '08:00:00', end_time: '14:00:00', color: '#0ea5e9', created_by: P.petra, created_at: created },
        { id: id(14, 2), organization_id: ORG, name: 'Odpolední', role: null, start_time: '14:00:00', end_time: '20:00:00', color: '#8b5cf6', created_by: P.petra, created_at: created },
        { id: id(14, 3), organization_id: ORG, name: 'Kuchyně', role: 'Kuchař', start_time: '08:00:00', end_time: '16:00:00', color: '#f97316', created_by: P.petra, created_at: created },
    ];

    const coverage_requirements: Row[] = [L.mala, L.karlin, L.vino].flatMap((loc, li) =>
        [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ id: id(15, li * 10 + dow + 1), organization_id: ORG, location_id: loc, day_of_week: dow, min_headcount: loc === L.vino ? 1 : 2, created_at: created })),
    );

    const location_settings: Row[] = locations.map((l) => ({
        location_id: l.id,
        organization_id: ORG,
        open_time: `${HOURS[l.id as string][0]}:00`,
        close_time: `${HOURS[l.id as string][1]}:00`,
        timezone: 'Europe/Prague',
        break_minutes: 30,
        updated_at: created,
    }));

    const y = today.getFullYear();
    const public_holidays: Row[] = [
        { holiday_date: `${y}-01-01`, name_cs: 'Nový rok', name_en: "New Year's Day", country: 'CZ' },
        { holiday_date: `${y}-05-01`, name_cs: 'Svátek práce', name_en: 'Labour Day', country: 'CZ' },
        { holiday_date: `${y}-05-08`, name_cs: 'Den vítězství', name_en: 'Liberation Day', country: 'CZ' },
        { holiday_date: `${y}-07-05`, name_cs: 'Den slovanských věrozvěstů Cyrila a Metoděje', name_en: 'Saints Cyril and Methodius Day', country: 'CZ' },
        { holiday_date: `${y}-07-06`, name_cs: 'Den upálení mistra Jana Husa', name_en: 'Jan Hus Day', country: 'CZ' },
        { holiday_date: `${y}-09-28`, name_cs: 'Den české státnosti', name_en: 'St. Wenceslas Day', country: 'CZ' },
        { holiday_date: `${y}-10-28`, name_cs: 'Den vzniku samostatného československého státu', name_en: 'Independent Czechoslovak State Day', country: 'CZ' },
        { holiday_date: `${y}-11-17`, name_cs: 'Den boje za svobodu a demokracii', name_en: 'Struggle for Freedom and Democracy Day', country: 'CZ' },
        { holiday_date: `${y}-12-24`, name_cs: 'Štědrý den', name_en: 'Christmas Eve', country: 'CZ' },
        { holiday_date: `${y}-12-25`, name_cs: '1. svátek vánoční', name_en: 'Christmas Day', country: 'CZ' },
        { holiday_date: `${y}-12-26`, name_cs: '2. svátek vánoční', name_en: "St. Stephen's Day", country: 'CZ' },
        { holiday_date: `${y + 1}-01-01`, name_cs: 'Nový rok', name_en: "New Year's Day", country: 'CZ' },
    ];

    const availability: Row[] = [
        { id: id(16, 1), user_id: P.klara, organization_id: ORG, kind: 'preferred', day_of_week: 6, specific_date: null, all_day: true, start_time: null, end_time: null, note: 'Víkendy mi vyhovují', created_at: daysAgo(30) },
        { id: id(16, 2), user_id: P.ondrej, organization_id: ORG, kind: 'unavailable', day_of_week: null, specific_date: md(31), all_day: true, start_time: null, end_time: null, note: 'Stěhování', created_at: daysAgo(1) },
    ];

    const rates: Record<string, number> = {
        [P.petra]: 290, [P.tomas]: 245, [P.martin]: 245, [P.jana]: 215, [P.david]: 215,
        [P.eva]: 195, [P.klara]: 195, [P.lukas]: 210, [P.jakub]: 205, [P.ondrej]: 175, [P.tereza]: 175, [P.veronika]: 175,
    };
    const member_wages: Row[] = profiles.map((p, i) => ({
        id: id(17, i + 1), organization_id: ORG, user_id: p.id, hourly_rate: rates[p.id as string], currency: 'CZK', effective_from: '2026-09-01', created_by: P.petra, updated_at: created,
    }));

    // Employee documents: one health card about to expire, one expired training, a contract.
    const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const doc = (n: number, user: string, doc_type: string, name: string, valid: Date | null, by: string, mime = 'application/pdf'): Row => ({
        id: id(19, n), organization_id: ORG, user_id: user, doc_type, name, file_path: `${ORG}/${user}/${id(19, n)}.pdf`,
        mime_type: mime, size_bytes: 240_000, valid_until: valid ? dayStr(valid) : null, uploaded_by: by, created_at: daysAgo(40 - n),
    });
    const member_documents: Row[] = [
        doc(1, P.eva, 'contract', 'Pracovní smlouva 2026', null, P.petra),
        doc(2, P.eva, 'health_card', 'Zdravotní průkaz', addDays(today, 12), P.eva, 'image/jpeg'),
        doc(3, P.eva, 'safety_training', 'Školení BOZP', addDays(today, -4), P.petra),
        doc(4, P.eva, 'food_card', 'Potravinářský průkaz', addDays(today, 300), P.petra),
        doc(5, P.petra, 'contract', 'Smlouva jednatelky', null, P.petra),
    ];

    const shift_confirmations: Row[] = scheduled_shifts
        .filter((s) => s.user_id !== P.ondrej && Date.parse(s.starts_at as string) < now.getTime() + 4 * 86400000)
        .map((s) => ({ scheduled_shift_id: s.id, user_id: s.user_id, organization_id: ORG, confirmed_at: daysAgo(10) }));

    const audit = (n: number, action: string, minutesAgo: number, details: Row, extra: Row = {}): Row => ({
        id: id(18, n),
        organization_id: ORG,
        shift_id: null,
        actor_id: null,
        target_user_id: P.petra,
        subject_id: null,
        action,
        details,
        created_at: new Date(now.getTime() - minutesAgo * 60000).toISOString(),
        ...extra,
    });
    const shift_audit_log: Row[] = [
        audit(1, 'swap_requested', 60 * 25, { from_name: 'Eva Dvořáková', taker_name: 'Veronika Pokorná' }),
        audit(2, 'timeoff_requested', 60 * 14, { actor_name: 'Ondřej Procházka', kind: 'other', starts_on: md(31), ends_on: md(31) }),
        audit(3, 'schedule_published', 60 * 24 * 4, { actor_name: 'Petra Nováková', count: scheduled_shifts.length, month_start: md(1) }),
    ];

    const paid: Row = {
        organization_id: ORG,
        plan: 'business',
        status: 'active',
        interval: 'month',
        seats: profiles.length,
        trial_ends_at: null,
        current_period_end: at(new Date(today.getFullYear(), today.getMonth() + 1, 3), '00:00'),
        cancel_at_period_end: false,
        stripe_customer_id: 'cus_demo',
        stripe_subscription_id: 'sub_demo',
        source: 'stripe',
        manual_plan: null,
        manual_until: null,
        manual_note: null,
    };
    // Our own no-card Business trial (no Stripe ids), ending `days` from now.
    const trial = (days: number): Row => ({
        ...paid,
        status: 'trialing',
        interval: null,
        seats: null,
        current_period_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        source: 'trial',
        trial_ends_at: new Date(now.getTime() + days * 86400000).toISOString(),
    });
    const scenario = billingScenario();
    const subscriptions: Row[] = [
        scenario === 'trial'
            ? trial(20)
            : scenario === 'trial3'
              ? trial(2.5)
              : scenario === 'free' || scenario === 'beta'
                ? trial(-2)
                : scenario === 'past_due'
                  ? { ...paid, status: 'past_due' }
                  : scenario === 'ended'
                    ? { ...paid, status: 'canceled', current_period_end: new Date(now.getTime() - 2 * 86400000).toISOString() }
                    : scenario === 'cancel_scheduled'
                      ? { ...paid, cancel_at_period_end: true }
                      : paid,
    ];

    const notification_preferences: Row[] = [
        { user_id: P.petra, push_enabled: true, shifts: true, account: true, requests: true, language: 'cs', updated_at: created },
    ];

    const demoOrg = demoOrgScenario();
    if (demoOrg === 'fresh' || demoOrg === 'on') {
        const batch = 'demo-batch-0001';
        for (const p of profiles) if (p.id !== P.petra) p.demo_batch = batch;
        for (const s of scheduled_shifts) s.demo_batch = batch;
        if (demoOrg === 'on') {
            organizations[0].demo_batch = batch;
            for (const l of locations) if (l.id !== L.mala) l.demo_batch = batch;
        }
    }

    return {
        organizations,
        locations,
        roles,
        org_roles,
        org_role_permissions,
        profiles,
        location_roster,
        time_off,
        scheduled_shifts,
        shifts,
        shift_swaps,
        member_requests_view,
        name_change_requests,
        announcements,
        announcement_reads,
        open_shifts,
        shift_templates,
        coverage_requirements,
        location_settings,
        public_holidays,
        availability,
        member_wages,
        member_documents,
        shift_confirmations,
        shift_audit_log,
        subscriptions,
        notification_preferences,
        device_tokens: [],
    };
}
