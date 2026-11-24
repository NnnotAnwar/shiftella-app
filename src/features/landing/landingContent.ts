/**
 * --- LANDING CONTENT ---
 * The public landing page's copy, CS (home market, default) + EN. Kept out of
 * the app-wide translations so it ships only in the landing chunk. Facts must
 * match the README ("Features"); prices and limits come from billing/plans.ts,
 * never from here — `{n}`-style placeholders are filled from it.
 */
import type { Language } from '@shared/i18n/translations';

export type FeatureIcon = 'clock' | 'grid' | 'swap' | 'sheet' | 'law' | 'roles' | 'bell' | 'devices';

export interface LandingCopy {
    meta: { title: string; description: string };
    nav: { features: string; pricing: string; faq: string; signIn: string; skip: string; menu: string };
    hero: { eyebrow: string; title: string; titleAccent: string; sub: string; cta: string; secondary: string; trust: string[]; imgAlt: string; phoneAlt: string };
    problem: { eyebrow: string; title: string; before: string; after: string; rows: { before: string; after: string }[] };
    features: { eyebrow: string; title: string; sub: string; items: { icon: FeatureIcon; title: string; body: string }[] };
    steps: { eyebrow: string; title: string; items: { title: string; body: string }[]; imgAlt: string };
    pricing: {
        eyebrow: string;
        title: string;
        sub: string;
        monthly: string;
        yearly: string;
        save: string;
        currency: string;
        perMonth: string;
        perPersonMonth: string;
        forever: string;
        billedYearlyFlat: string;
        billedYearlyPerson: string;
        members: string;
        locations: { one: string; few: string; other: string };
        unlimited: string;
        minSeats: string;
        recommended: string;
        freeCore: string[];
        everythingInFree: string;
        everythingInTeam: string;
        startFree: string;
        startTrial: string;
        trialNote: string;
        vat: string;
        blurb: Record<'free' | 'team' | 'business', string>;
    };
    faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
    final: { title: string; sub: string; cta: string };
    footer: { tagline: string; privacy: string; terms: string; contact: string; signIn: string; signUp: string };
}

const cs: LandingCopy = {
    meta: {
        title: 'Shiftella – rozpis směn, docházka a výkazy pro malé týmy',
        description:
            'Rozpis směn, docházka podle pobočky, žádosti a výměny směn i výkazy pro kavárny, obchody a ordinace. Bez Excelu a skupinových chatů. 30 dní zdarma, bez karty.',
    },
    nav: { features: 'Funkce', pricing: 'Ceník', faq: 'Otázky', signIn: 'Přihlásit se', skip: 'Přeskočit na obsah', menu: 'Hlavní navigace' },
    hero: {
        eyebrow: 'Pro kavárny, obchody i ordinace',
        title: 'Rozpis směn, docházka a výkazy',
        titleAccent: 'pro malé týmy — bez Excelu',
        sub: 'Naplánujte měsíc za pár minut, tým se přihlašuje na směnu v telefonu a hodiny se sečtou samy. Všechno na jednom místě, česky a podle českých pravidel.',
        cta: 'Vyzkoušet {days} dní zdarma',
        secondary: 'Přihlásit se',
        trust: ['Bez platební karty', 'Web, Android i iPhone', 'Česky i anglicky'],
        imgAlt: 'Nástěnka Shiftelly: kdo je právě na směně na kterých pobočkách',
        phoneAlt: 'Shiftella v telefonu: aktivní směna a další směna',
    },
    problem: {
        eyebrow: 'Proč Shiftella',
        title: 'Konec tabulek, papírů a ztracených zpráv',
        before: 'Dnes',
        after: 'Se Shiftellou',
        rows: [
            { before: 'Rozpis v Excelu, který má každý v jiné verzi', after: 'Jeden živý rozpis, který tým vidí v telefonu' },
            { before: 'Výměny a volno domlouvané ve skupinovém chatu', after: 'Žádosti a výměny s jasným schválením' },
            { before: 'Docházka na papíře, hodiny sčítané ručně', after: 'Příchod a odchod podle pobočky, výkazy samy' },
            { before: 'Odpočinek a přestávky hlídané z hlavy', after: 'Upozornění na 11 h odpočinku, přestávky i svátky' },
        ],
    },
    features: {
        eyebrow: 'Funkce',
        title: 'Všechno, co malý tým potřebuje',
        sub: 'Od plánování přes docházku až po podklady pro mzdy.',
        items: [
            { icon: 'clock', title: 'Docházka podle pobočky', body: 'Příchod a odchod jedním klepnutím. Živá nástěnka ukazuje, kdo je právě na směně a kde.' },
            { icon: 'grid', title: 'Rozpis jako na papíře', body: 'Mřížka lidé × dny, šablony směn a kopírování měsíce. Koncept vidíte jen vy, dokud ho nezveřejníte.' },
            { icon: 'swap', title: 'Žádosti a výměny', body: 'Dovolená, nemoc i výměny směn v jedné schránce. Platí princip čtyř očí: nikdo neschvaluje sám sobě.' },
            { icon: 'sheet', title: 'Výkazy a exporty', body: 'Odpracované hodiny po lidech i za celý tým, s povinnými přestávkami. Export do PDF, Excelu a CSV.' },
            { icon: 'law', title: 'Česká pravidla', body: 'Hlídá 11 hodin odpočinku mezi směnami, víc než 6 dní v řadě, přestávky a státní svátky.' },
            { icon: 'roles', title: 'Role a oprávnění', body: 'Vlastní role s právy pro každou oblast. Každý vidí a mění jen to, co má — vynuceno v databázi.' },
            { icon: 'bell', title: 'Push notifikace', body: 'Zveřejněný rozpis, rozhodnutí o žádostech i upozornění na pozdní příchod přímo do telefonu.' },
            { icon: 'devices', title: 'Web, Android i iPhone', body: 'Jeden účet v prohlížeči i v mobilní aplikaci. Světlý i tmavý režim, česky i anglicky.' },
        ],
    },
    steps: {
        eyebrow: 'Jak to funguje',
        title: 'Za odpoledne máte hotovo',
        items: [
            { title: 'Založte organizaci', body: 'Registrace e-mailem, pak přidáte pobočky a jejich otevírací dobu.' },
            { title: 'Pozvěte tým', body: 'Pozvánky e-mailem rovnou s rolí. Každý si účet dokončí sám.' },
            { title: 'Zveřejněte rozpis', body: 'Naplánujte měsíc v mřížce a jedním klepnutím ho zveřejněte. Tým dostane upozornění.' },
        ],
        imgAlt: 'Rozpis směn v mřížce: lidé × dny, šablony směn a součet hodin',
    },
    pricing: {
        eyebrow: 'Ceník',
        title: 'Jednoduché ceny bez překvapení',
        sub: 'Každá nová organizace má {days} dní tarifu Business zdarma.',
        monthly: 'Měsíčně',
        yearly: 'Ročně',
        save: '−{pct} %',
        currency: 'Kč',
        perMonth: '/ měsíc',
        perPersonMonth: '/ osoba / měsíc',
        forever: 'navždy',
        billedYearlyFlat: 'Účtováno ročně: {total} Kč',
        billedYearlyPerson: 'Účtováno ročně: {total} Kč za osobu',
        members: 'Až {n} lidí',
        locations: { one: '{n} pobočka', few: '{n} pobočky', other: '{n} poboček' },
        unlimited: 'Neomezeně lidí i poboček',
        minSeats: 'Účtuje se od {n} osob',
        recommended: 'Doporučujeme',
        freeCore: ['Docházka a živá nástěnka', 'Rozpis směn a zveřejnění', 'Žádosti o volno', 'Oznámení pro tým'],
        everythingInFree: 'Vše z Free, navíc:',
        everythingInTeam: 'Vše z Team, navíc:',
        startFree: 'Začít zdarma',
        startTrial: 'Vyzkoušet zdarma',
        trialNote: '{days} dní zdarma, bez karty',
        vat: 'Ceny jsou konečné, DPH se nepřipočítává.',
        blurb: {
            free: 'Pro začátek a nejmenší týmy.',
            team: 'Jedna cena za celý tým.',
            business: 'Pro větší a rostoucí provozy.',
        },
    },
    faq: {
        eyebrow: 'Otázky',
        title: 'Časté dotazy',
        items: [
            { q: 'Potřebuji na zkušební dobu kartu?', a: 'Ne. Každá nová organizace dostane {days} dní tarifu Business zdarma a nemusíte zadávat platební kartu.' },
            { q: 'Co se stane po skončení zkušební doby?', a: 'Organizace automaticky přejde na tarif Free. Nic se nesmaže — co přesahuje limity Free, zůstane jen pro čtení, dokud si nevyberete placený tarif.' },
            { q: 'Jsou naše data v bezpečí?', a: 'Data ukládáme v databázi u Supabase na serverech v EU, přenos je šifrovaný. Organizace jsou od sebe oddělené přímo v databázi a každý vidí jen to, co mu dovoluje jeho role.' },
            { q: 'Můžu předplatné kdykoli zrušit?', a: 'Ano, bez závazků. Zrušíte ho v aplikaci; platí do konce zaplaceného období a pak přejdete na Free.' },
            { q: 'Je i mobilní aplikace?', a: 'Ano. Shiftella běží v prohlížeči na počítači i v telefonu a jako aplikace pro Android a iPhone, včetně push notifikací.' },
            { q: 'V jakých jazycích aplikace je?', a: 'V češtině a angličtině. Jazyk si každý přepne sám, takže v jednom týmu můžete mít obojí.' },
        ],
    },
    final: {
        title: 'Zkuste to s vaším týmem',
        sub: '{days} dní všech funkcí zdarma. Bez karty, bez závazků.',
        cta: 'Vyzkoušet {days} dní zdarma',
    },
    footer: {
        tagline: 'Rozpis směn, docházka a výkazy pro malé týmy.',
        privacy: 'Ochrana soukromí',
        terms: 'Podmínky',
        contact: 'Kontakt',
        signIn: 'Přihlásit se',
        signUp: 'Založit organizaci',
    },
};

const en: LandingCopy = {
    meta: {
        title: 'Shiftella – shift planning, time tracking and timesheets for small teams',
        description:
            'Rota planning, clock in/out by location, time-off requests, shift swaps and timesheets for cafés, shops and clinics. No more spreadsheets or group chats. 30 days free, no card.',
    },
    nav: { features: 'Features', pricing: 'Pricing', faq: 'FAQ', signIn: 'Sign in', skip: 'Skip to content', menu: 'Main navigation' },
    hero: {
        eyebrow: 'For cafés, shops and clinics',
        title: 'Rota, time tracking and timesheets',
        titleAccent: 'for small teams — no spreadsheets',
        sub: 'Plan the month in minutes, your team clocks in from their phones and the hours add up on their own. One place for everything, built around Czech labour rules.',
        cta: 'Try {days} days free',
        secondary: 'Sign in',
        trust: ['No credit card', 'Web, Android and iPhone', 'Czech and English'],
        imgAlt: 'Shiftella dashboard: who is on shift right now, by location',
        phoneAlt: 'Shiftella on a phone: the active shift and the next one',
    },
    problem: {
        eyebrow: 'Why Shiftella',
        title: 'No more spreadsheets, paper and lost messages',
        before: 'Today',
        after: 'With Shiftella',
        rows: [
            { before: 'A rota spreadsheet everyone has a different copy of', after: 'One live rota your team sees on their phones' },
            { before: 'Swaps and time off sorted out in a group chat', after: 'Requests and swaps with a clear approval' },
            { before: 'Paper attendance sheets, hours added up by hand', after: 'Clock in/out by location, timesheets built for you' },
            { before: 'Rest periods and breaks tracked in your head', after: 'Warnings for 11 h rest, breaks and public holidays' },
        ],
    },
    features: {
        eyebrow: 'Features',
        title: 'Everything a small team needs',
        sub: 'From planning and attendance to the numbers for payroll.',
        items: [
            { icon: 'clock', title: 'Clock in by location', body: 'Clock in and out with one tap. The live board shows who is on shift right now, and where.' },
            { icon: 'grid', title: 'A rota like on paper', body: 'A people × days grid, shift templates and copy last month. Drafts stay yours until you publish.' },
            { icon: 'swap', title: 'Requests and swaps', body: 'Vacation, sick days and shift swaps in one inbox. Four-eyes approval: nobody approves their own.' },
            { icon: 'sheet', title: 'Timesheets and exports', body: 'Hours worked per person and for the whole team, with mandatory breaks. Export to PDF, Excel and CSV.' },
            { icon: 'law', title: 'Czech labour rules', body: 'Flags less than 11 hours of rest between shifts, more than 6 days in a row, breaks and public holidays.' },
            { icon: 'roles', title: 'Roles and permissions', body: 'Custom roles with rights per area. Everyone sees and changes only what they may — enforced in the database.' },
            { icon: 'bell', title: 'Push notifications', body: 'A published rota, request decisions and late-for-shift alerts, straight to the phone.' },
            { icon: 'devices', title: 'Web, Android and iPhone', body: 'One account in the browser and the mobile app. Light and dark mode, Czech and English.' },
        ],
    },
    steps: {
        eyebrow: 'How it works',
        title: 'Up and running in an afternoon',
        items: [
            { title: 'Create your organization', body: 'Sign up with your email, then add your locations and their opening hours.' },
            { title: 'Invite your team', body: 'Email invites with the role already set. Everyone finishes their own account.' },
            { title: 'Publish the rota', body: 'Plan the month in the grid and publish it with one tap. Your team gets notified.' },
        ],
        imgAlt: 'The rota grid: people × days, shift templates and total hours',
    },
    pricing: {
        eyebrow: 'Pricing',
        title: 'Simple prices, no surprises',
        sub: 'Every new organization gets {days} days of Business for free.',
        monthly: 'Monthly',
        yearly: 'Yearly',
        save: '−{pct} %',
        currency: 'CZK',
        perMonth: '/ month',
        perPersonMonth: '/ person / month',
        forever: 'forever',
        billedYearlyFlat: 'Billed yearly: {total} CZK',
        billedYearlyPerson: 'Billed yearly: {total} CZK per person',
        members: 'Up to {n} people',
        locations: { one: '{n} location', few: '{n} locations', other: '{n} locations' },
        unlimited: 'Unlimited people and locations',
        minSeats: 'Billed from {n} people',
        recommended: 'Recommended',
        freeCore: ['Clock in/out and live board', 'Rota planning and publishing', 'Time-off requests', 'Team announcements'],
        everythingInFree: 'Everything in Free, plus:',
        everythingInTeam: 'Everything in Team, plus:',
        startFree: 'Start free',
        startTrial: 'Try it free',
        trialNote: '{days} days free, no card',
        vat: 'Prices are final, no VAT is added.',
        blurb: {
            free: 'To get started, and for the smallest teams.',
            team: 'One price for the whole team.',
            business: 'For larger and growing businesses.',
        },
    },
    faq: {
        eyebrow: 'FAQ',
        title: 'Frequently asked questions',
        items: [
            { q: 'Do I need a card for the trial?', a: 'No. Every new organization gets {days} days of Business for free, without entering a payment card.' },
            { q: 'What happens when the trial ends?', a: 'Your organization moves to the Free plan automatically. Nothing is deleted — anything above the Free limits becomes read-only until you pick a paid plan.' },
            { q: 'Is our data safe?', a: 'Data is stored in a Supabase database on servers in the EU, and every connection is encrypted. Organizations are separated in the database itself, and everyone sees only what their role allows.' },
            { q: 'Can I cancel any time?', a: 'Yes, with no commitment. Cancel in the app; your plan runs to the end of the paid period, then you move to Free.' },
            { q: 'Is there a mobile app?', a: 'Yes. Shiftella runs in the browser on desktop and phone, and as an app for Android and iPhone, with push notifications.' },
            { q: 'Which languages are supported?', a: 'Czech and English. Everyone picks their own, so one team can use both.' },
        ],
    },
    final: {
        title: 'Try it with your team',
        sub: '{days} days of every feature, free. No card, no commitment.',
        cta: 'Try {days} days free',
    },
    footer: {
        tagline: 'Rota, time tracking and timesheets for small teams.',
        privacy: 'Privacy',
        terms: 'Terms',
        contact: 'Contact',
        signIn: 'Sign in',
        signUp: 'Create an organization',
    },
};

export const LANDING: Record<Language, LandingCopy> = { cs, en };

/** Fill `{name}` placeholders (numbers come from plans.ts). */
export function fill(str: string, vars: Record<string, string | number>): string {
    return str.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
