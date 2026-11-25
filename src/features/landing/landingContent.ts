/**
 * --- LANDING CONTENT ---
 * The public landing page's copy, CS (home market, default), EN, SK and UK. Kept out of
 * the app-wide translations so it ships only in the landing chunk. Facts must
 * match the README ("Features"); prices and limits come from billing/plans.ts,
 * never from here — `{n}`-style placeholders are filled from it.
 */
import type { Language } from '@shared/i18n/translations';

export type FeatureIcon = 'clock' | 'grid' | 'swap' | 'sheet' | 'law' | 'roles' | 'bell' | 'devices';

export interface LandingCopy {
    meta: { title: string; description: string };
    nav: { features: string; pricing: string; faq: string; signIn: string; skip: string; menu: string };
    hero: { eyebrow: string; title: string; titleAccent: string; sub: string; cta: string; demo: string; trust: string[]; imgAlt: string; phoneAlt: string };
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
        /** Free beta: the banner above the plans and the note under each button. */
        betaBadge: string;
        betaTitle: string;
        betaText: string;
        betaNote: string;
        blurb: Record<'free' | 'team' | 'business', string>;
    };
    faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
    final: { title: string; sub: string; cta: string };
    /** Free beta: replaces the trial wording on the sign-up buttons and the final call. */
    beta: { cta: string; finalSub: string; trust: string; metaDescription: string };
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
        demo: 'Prohlédnout ukázku',
        trust: ['Bez platební karty', 'Web, Android i iPhone', 'Česky, slovensky, ukrajinsky i anglicky'],
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
            { icon: 'devices', title: 'Web, Android i iPhone', body: 'Jeden účet v prohlížeči i v mobilní aplikaci. Světlý i tmavý režim, čtyři jazyky.' },
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
        betaBadge: 'Beta',
        betaTitle: 'Během bety je všechno zdarma',
        betaText: 'Všechny funkce tarifu Business, bez limitů a bez karty. Ceny níže začnou platit až po betě a dáme vědět s dostatečným předstihem.',
        betaNote: 'Zdarma během bety, bez karty',
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
            { q: 'V jakých jazycích aplikace je?', a: 'V češtině, slovenštině, ukrajinštině a angličtině. Jazyk si každý přepne sám, takže v jednom týmu můžete mít různé jazyky.' },
        ],
    },
    final: {
        title: 'Zkuste to s vaším týmem',
        sub: '{days} dní všech funkcí zdarma. Bez karty, bez závazků.',
        cta: 'Vyzkoušet {days} dní zdarma',
    },
    beta: { cta: 'Začít zdarma', finalSub: 'Během bety jsou všechny funkce zdarma. Bez karty, bez závazků.', trust: 'Zdarma během bety',
        metaDescription: 'Rozpis směn, docházka podle pobočky, žádosti a výměny směn i výkazy pro kavárny, obchody a ordinace. Bez Excelu a skupinových chatů. Během bety zdarma, bez karty.',
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
        demo: 'See the demo',
        trust: ['No credit card', 'Web, Android and iPhone', 'Czech, Slovak, Ukrainian and English'],
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
            { icon: 'devices', title: 'Web, Android and iPhone', body: 'One account in the browser and the mobile app. Light and dark mode, four languages.' },
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
        betaBadge: 'Beta',
        betaTitle: 'Everything is free during the beta',
        betaText: 'Every Business feature, no limits, no card. The prices below start only after the beta, and we will tell you well in advance.',
        betaNote: 'Free during the beta, no card',
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
            { q: 'Which languages are supported?', a: 'Czech, Slovak, Ukrainian and English. Everyone picks their own, so one team can mix languages.' },
        ],
    },
    final: {
        title: 'Try it with your team',
        sub: '{days} days of every feature, free. No card, no commitment.',
        cta: 'Try {days} days free',
    },
    beta: { cta: 'Start free', finalSub: 'Every feature is free during the beta. No card, no commitment.', trust: 'Free during the beta',
        metaDescription: 'Rota planning, clock in/out by location, time-off requests, shift swaps and timesheets for cafés, shops and clinics. No more spreadsheets or group chats. Free during the beta, no card.',
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


const sk: LandingCopy = {
    meta: {
        title: 'Shiftella – rozpis zmien, dochádzka a výkazy pre malé tímy',
        description:
            'Rozpis zmien, dochádzka podľa pobočky, žiadosti a výmeny zmien aj výkazy pre kaviarne, obchody a ambulancie. Bez Excelu a skupinových chatov. 30 dní zadarmo, bez karty.',
    },
    nav: { features: 'Funkcie', pricing: 'Cenník', faq: 'Otázky', signIn: 'Prihlásiť sa', skip: 'Preskočiť na obsah', menu: 'Hlavná navigácia' },
    hero: {
        eyebrow: 'Pre kaviarne, obchody aj ambulancie',
        title: 'Rozpis zmien, dochádzka a výkazy',
        titleAccent: 'pre malé tímy — bez Excelu',
        sub: 'Naplánujte mesiac za pár minút, tím sa prihlasuje na zmenu v telefóne a hodiny sa spočítajú samy. Všetko na jednom mieste, podľa českej pracovnej legislatívy.',
        cta: 'Vyskúšať {days} dní zadarmo',
        demo: 'Pozrieť ukážku',
        trust: ['Bez platobnej karty', 'Web, Android aj iPhone', 'Slovensky, česky, ukrajinsky aj anglicky'],
        imgAlt: 'Nástenka Shiftelly: kto je práve na zmene na ktorých pobočkách',
        phoneAlt: 'Shiftella v telefóne: aktívna zmena a ďalšia zmena',
    },
    problem: {
        eyebrow: 'Prečo Shiftella',
        title: 'Koniec tabuliek, papierov a stratených správ',
        before: 'Dnes',
        after: 'So Shiftellou',
        rows: [
            { before: 'Rozpis v Exceli, ktorý má každý v inej verzii', after: 'Jeden živý rozpis, ktorý tím vidí v telefóne' },
            { before: 'Výmeny a voľno dohadované v skupinovom chate', after: 'Žiadosti a výmeny s jasným schválením' },
            { before: 'Dochádzka na papieri, hodiny sčítané ručne', after: 'Príchod a odchod podľa pobočky, výkazy samy' },
            { before: 'Odpočinok a prestávky strážené z hlavy', after: 'Upozornenia na 11 h odpočinku, prestávky aj sviatky' },
        ],
    },
    features: {
        eyebrow: 'Funkcie',
        title: 'Všetko, čo malý tím potrebuje',
        sub: 'Od plánovania cez dochádzku až po podklady pre mzdy.',
        items: [
            { icon: 'clock', title: 'Dochádzka podľa pobočky', body: 'Príchod a odchod jedným ťuknutím. Živá nástenka ukazuje, kto je práve na zmene a kde.' },
            { icon: 'grid', title: 'Rozpis ako na papieri', body: 'Mriežka ľudia × dni, šablóny zmien a kopírovanie mesiaca. Koncept vidíte len vy, kým ho nezverejníte.' },
            { icon: 'swap', title: 'Žiadosti a výmeny', body: 'Dovolenka, PN aj výmeny zmien v jednej schránke. Platí princíp štyroch očí: nikto neschvaľuje sám sebe.' },
            { icon: 'sheet', title: 'Výkazy a exporty', body: 'Odpracované hodiny po ľuďoch aj za celý tím, s povinnými prestávkami. Export do PDF, Excelu a CSV.' },
            { icon: 'law', title: 'České pravidlá', body: 'Stráži 11 hodín odpočinku medzi zmenami, viac ako 6 dní v rade, prestávky a štátne sviatky.' },
            { icon: 'roles', title: 'Roly a oprávnenia', body: 'Vlastné roly s právami pre každú oblasť. Každý vidí a mení len to, čo smie — vynútené v databáze.' },
            { icon: 'bell', title: 'Push notifikácie', body: 'Zverejnený rozpis, rozhodnutia o žiadostiach aj upozornenia na neskorý príchod priamo do telefónu.' },
            { icon: 'devices', title: 'Web, Android aj iPhone', body: 'Jeden účet v prehliadači aj v mobilnej aplikácii. Svetlý aj tmavý režim, štyri jazyky.' },
        ],
    },
    steps: {
        eyebrow: 'Ako to funguje',
        title: 'Za jedno popoludnie máte hotovo',
        items: [
            { title: 'Založte organizáciu', body: 'Registrácia e-mailom, potom pridáte pobočky a ich otváracie hodiny.' },
            { title: 'Pozvite tím', body: 'Pozvánky e-mailom rovno s rolou. Každý si účet dokončí sám.' },
            { title: 'Zverejnite rozpis', body: 'Naplánujte mesiac v mriežke a jedným ťuknutím ho zverejnite. Tím dostane upozornenie.' },
        ],
        imgAlt: 'Rozpis zmien v mriežke: ľudia × dni, šablóny zmien a súčet hodín',
    },
    pricing: {
        eyebrow: 'Cenník',
        title: 'Jednoduché ceny bez prekvapení',
        sub: 'Každá nová organizácia má {days} dní tarifu Business zadarmo.',
        monthly: 'Mesačne',
        yearly: 'Ročne',
        save: '−{pct} %',
        currency: 'Kč',
        perMonth: '/ mesiac',
        perPersonMonth: '/ osoba / mesiac',
        forever: 'navždy',
        billedYearlyFlat: 'Účtované ročne: {total} Kč',
        billedYearlyPerson: 'Účtované ročne: {total} Kč za osobu',
        members: 'Až {n} ľudí',
        locations: { one: '{n} pobočka', few: '{n} pobočky', other: '{n} pobočiek' },
        unlimited: 'Neobmedzene ľudí aj pobočiek',
        minSeats: 'Účtuje sa od {n} osôb',
        recommended: 'Odporúčame',
        freeCore: ['Dochádzka a živá nástenka', 'Rozpis zmien a zverejnenie', 'Žiadosti o voľno', 'Oznámenia pre tím'],
        everythingInFree: 'Všetko z Free, navyše:',
        everythingInTeam: 'Všetko z Team, navyše:',
        startFree: 'Začať zadarmo',
        startTrial: 'Vyskúšať zadarmo',
        trialNote: '{days} dní zadarmo, bez karty',
        vat: 'Ceny sú konečné, DPH sa nepripočítava.',
        betaBadge: 'Beta',
        betaTitle: 'Počas bety je všetko zadarmo',
        betaText: 'Všetky funkcie tarifu Business, bez limitov a bez karty. Ceny nižšie začnú platiť až po bete a dáme vedieť s dostatočným predstihom.',
        betaNote: 'Zadarmo počas bety, bez karty',
        blurb: {
            free: 'Na začiatok a pre najmenšie tímy.',
            team: 'Jedna cena za celý tím.',
            business: 'Pre väčšie a rastúce prevádzky.',
        },
    },
    faq: {
        eyebrow: 'Otázky',
        title: 'Časté otázky',
        items: [
            { q: 'Potrebujem na skúšobnú dobu kartu?', a: 'Nie. Každá nová organizácia dostane {days} dní tarifu Business zadarmo a nemusíte zadávať platobnú kartu.' },
            { q: 'Čo sa stane po skončení skúšobnej doby?', a: 'Organizácia automaticky prejde na tarif Free. Nič sa nezmaže — čo presahuje limity Free, zostane len na čítanie, kým si nevyberiete platený tarif.' },
            { q: 'Sú naše dáta v bezpečí?', a: 'Dáta ukladáme v databáze Supabase na serveroch v EÚ, prenos je šifrovaný. Organizácie sú od seba oddelené priamo v databáze a každý vidí len to, čo mu dovoľuje jeho rola.' },
            { q: 'Môžem predplatné kedykoľvek zrušiť?', a: 'Áno, bez záväzkov. Zrušíte ho v aplikácii; platí do konca zaplateného obdobia a potom prejdete na Free.' },
            { q: 'Je aj mobilná aplikácia?', a: 'Áno. Shiftella beží v prehliadači na počítači aj v telefóne a ako aplikácia pre Android a iPhone, vrátane push notifikácií.' },
            { q: 'V akých jazykoch je aplikácia?', a: 'V slovenčine, češtine, ukrajinčine a angličtine. Jazyk si každý prepne sám, takže v jednom tíme môžete mať rôzne jazyky.' },
        ],
    },
    final: {
        title: 'Vyskúšajte to s vaším tímom',
        sub: '{days} dní všetkých funkcií zadarmo. Bez karty, bez záväzkov.',
        cta: 'Vyskúšať {days} dní zadarmo',
    },
    beta: { cta: 'Začať zadarmo', finalSub: 'Počas bety sú všetky funkcie zadarmo. Bez karty, bez záväzkov.', trust: 'Zadarmo počas bety',
        metaDescription: 'Rozpis zmien, dochádzka podľa pobočky, žiadosti a výmeny zmien aj výkazy pre kaviarne, obchody a ambulancie. Bez Excelu a skupinových chatov. Počas bety zadarmo, bez karty.',
    },
    footer: {
        tagline: 'Rozpis zmien, dochádzka a výkazy pre malé tímy.',
        privacy: 'Ochrana súkromia',
        terms: 'Podmienky',
        contact: 'Kontakt',
        signIn: 'Prihlásiť sa',
        signUp: 'Založiť organizáciu',
    },
};

const uk: LandingCopy = {
    meta: {
        title: 'Shiftella – графік змін, облік робочого часу й табелі для малих команд',
        description:
            'Графік змін, відмітки приходу за філією, заявки й обмін змінами, табелі для кав’ярень, магазинів і клінік. Без Excel і групових чатів. 30 днів безкоштовно, без картки.',
    },
    nav: { features: 'Можливості', pricing: 'Ціни', faq: 'Питання', signIn: 'Увійти', skip: 'Перейти до змісту', menu: 'Головна навігація' },
    hero: {
        eyebrow: 'Для кав’ярень, магазинів і клінік',
        title: 'Графік змін, облік часу й табелі',
        titleAccent: 'для малих команд — без Excel',
        sub: 'Плануйте місяць за кілька хвилин: команда відмічає прихід у телефоні, а години рахуються самі. Усе в одному місці, з урахуванням чеського трудового права.',
        cta: 'Спробувати {days} днів безкоштовно',
        demo: 'Переглянути демо',
        trust: ['Без банківської картки', 'Веб, Android та iPhone', 'Українська, чеська, словацька й англійська'],
        imgAlt: 'Панель Shiftella: хто зараз на зміні та на якій філії',
        phoneAlt: 'Shiftella в телефоні: поточна й наступна зміна',
    },
    problem: {
        eyebrow: 'Чому Shiftella',
        title: 'Більше жодних таблиць, паперів і загублених повідомлень',
        before: 'Зараз',
        after: 'Із Shiftella',
        rows: [
            { before: 'Графік в Excel, у кожного своя версія', after: 'Один живий графік, який команда бачить у телефоні' },
            { before: 'Обміни й відгули домовляються в груповому чаті', after: 'Заявки й обміни з чітким погодженням' },
            { before: 'Облік на папері, години рахують вручну', after: 'Прихід і відхід за філією, табелі формуються самі' },
            { before: 'Відпочинок і перерви — по пам’яті', after: 'Попередження про 11 год відпочинку, перерви й свята' },
        ],
    },
    features: {
        eyebrow: 'Можливості',
        title: 'Усе, що потрібно малій команді',
        sub: 'Від планування й обліку часу до даних для зарплати.',
        items: [
            { icon: 'clock', title: 'Облік за філією', body: 'Прихід і відхід одним дотиком. Жива панель показує, хто зараз на зміні та де.' },
            { icon: 'grid', title: 'Графік, як на папері', body: 'Сітка люди × дні, шаблони змін і копіювання місяця. Чернетку бачите лише ви, доки її не опублікуєте.' },
            { icon: 'swap', title: 'Заявки й обміни', body: 'Відпустка, лікарняний і обмін змінами в одній скриньці. Принцип чотирьох очей: ніхто не погоджує сам собі.' },
            { icon: 'sheet', title: 'Табелі та експорт', body: 'Відпрацьовані години по кожному й по всій команді, з обов’язковими перервами. Експорт у PDF, Excel і CSV.' },
            { icon: 'law', title: 'Чеські правила', body: 'Стежить за 11 годинами відпочинку між змінами, понад 6 днями поспіль, перервами й державними святами.' },
            { icon: 'roles', title: 'Ролі та права', body: 'Власні ролі з правами для кожного розділу. Кожен бачить і змінює лише те, що йому дозволено, — це гарантує база даних.' },
            { icon: 'bell', title: 'Push-сповіщення', body: 'Опублікований графік, рішення щодо заявок і попередження про запізнення — одразу в телефон.' },
            { icon: 'devices', title: 'Веб, Android та iPhone', body: 'Один акаунт у браузері й у мобільному застосунку. Світла й темна тема, чотири мови.' },
        ],
    },
    steps: {
        eyebrow: 'Як це працює',
        title: 'Усе готово за пів дня',
        items: [
            { title: 'Створіть організацію', body: 'Реєстрація через e-mail, потім додайте філії та їхні години роботи.' },
            { title: 'Запросіть команду', body: 'Запрошення на e-mail одразу з роллю. Кожен сам завершує свій акаунт.' },
            { title: 'Опублікуйте графік', body: 'Сплануйте місяць у сітці й опублікуйте його одним дотиком. Команда отримає сповіщення.' },
        ],
        imgAlt: 'Графік змін у сітці: люди × дні, шаблони змін і сума годин',
    },
    pricing: {
        eyebrow: 'Ціни',
        title: 'Прості ціни без сюрпризів',
        sub: 'Кожна нова організація отримує {days} днів тарифу Business безкоштовно.',
        monthly: 'Щомісяця',
        yearly: 'Щороку',
        save: '−{pct} %',
        currency: 'Kč',
        perMonth: '/ місяць',
        perPersonMonth: '/ особа / місяць',
        forever: 'назавжди',
        billedYearlyFlat: 'Оплата за рік: {total} Kč',
        billedYearlyPerson: 'Оплата за рік: {total} Kč за особу',
        members: 'До {n} осіб',
        locations: { one: '{n} філія', few: '{n} філії', other: '{n} філій' },
        unlimited: 'Без обмежень на людей і філії',
        minSeats: 'Оплата від {n} осіб',
        recommended: 'Рекомендуємо',
        freeCore: ['Облік часу й жива панель', 'Планування й публікація графіка', 'Заявки на відпустку', 'Оголошення для команди'],
        everythingInFree: 'Усе з Free, а також:',
        everythingInTeam: 'Усе з Team, а також:',
        startFree: 'Почати безкоштовно',
        startTrial: 'Спробувати безкоштовно',
        trialNote: '{days} днів безкоштовно, без картки',
        vat: 'Ціни остаточні, ПДВ не додається.',
        betaBadge: 'Бета',
        betaTitle: 'Під час бети все безкоштовно',
        betaText: 'Усі можливості тарифу Business, без обмежень і без картки. Ціни нижче почнуть діяти лише після бети, і ми попередимо заздалегідь.',
        betaNote: 'Безкоштовно під час бети, без картки',
        blurb: {
            free: 'Для початку й найменших команд.',
            team: 'Одна ціна за всю команду.',
            business: 'Для більших закладів, що зростають.',
        },
    },
    faq: {
        eyebrow: 'Питання',
        title: 'Часті запитання',
        items: [
            { q: 'Чи потрібна картка для пробного періоду?', a: 'Ні. Кожна нова організація отримує {days} днів тарифу Business безкоштовно, без введення платіжної картки.' },
            { q: 'Що буде після закінчення пробного періоду?', a: 'Організація автоматично перейде на тариф Free. Нічого не видаляється — те, що перевищує ліміти Free, буде доступне лише для перегляду, доки ви не оберете платний тариф.' },
            { q: 'Чи безпечні наші дані?', a: 'Дані зберігаються в базі даних Supabase на серверах у ЄС, з’єднання шифрується. Організації відокремлені одна від одної прямо в базі, і кожен бачить лише те, що дозволяє його роль.' },
            { q: 'Чи можна скасувати підписку будь-коли?', a: 'Так, без зобов’язань. Скасуйте її в застосунку: вона діє до кінця оплаченого періоду, а потім ви перейдете на Free.' },
            { q: 'Чи є мобільний застосунок?', a: 'Так. Shiftella працює в браузері на комп’ютері й телефоні, а також як застосунок для Android та iPhone, з push-сповіщеннями.' },
            { q: 'Якими мовами доступний застосунок?', a: 'Українською, чеською, словацькою та англійською. Кожен обирає мову сам, тож в одній команді можуть бути різні мови.' },
        ],
    },
    final: {
        title: 'Спробуйте з вашою командою',
        sub: '{days} днів усіх можливостей безкоштовно. Без картки, без зобов’язань.',
        cta: 'Спробувати {days} днів безкоштовно',
    },
    beta: { cta: 'Почати безкоштовно', finalSub: 'Під час бети всі можливості безкоштовні. Без картки, без зобов’язань.', trust: 'Безкоштовно під час бети',
        metaDescription: 'Графік змін, відмітки приходу за філією, заявки й обмін змінами, табелі для кав’ярень, магазинів і клінік. Без Excel і групових чатів. Безкоштовно під час бети, без картки.',
    },
    footer: {
        tagline: 'Графік змін, облік часу й табелі для малих команд.',
        privacy: 'Конфіденційність',
        terms: 'Умови',
        contact: 'Контакт',
        signIn: 'Увійти',
        signUp: 'Створити організацію',
    },
};

/** The landing copy in every UI language (Czech is the home market and the default). */
export const LANDING: Record<Language, LandingCopy> = { cs, en, sk, uk };

/** Fill `{name}` placeholders (numbers come from plans.ts). */
/** The copy with the free-beta wording: "Start free" instead of "Try 30 days free" (meta description too). */
export function withFreeBeta(c: LandingCopy, freeBeta: boolean): LandingCopy {
    if (!freeBeta) return c;
    return {
        ...c,
        meta: { ...c.meta, description: c.beta.metaDescription },
        hero: { ...c.hero, cta: c.beta.cta, trust: [c.beta.trust, ...c.hero.trust.slice(1)] },
        final: { ...c.final, cta: c.beta.cta, sub: c.beta.finalSub },
    };
}

export function fill(str: string, vars: Record<string, string | number>): string {
    return str.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
