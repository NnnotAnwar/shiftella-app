/**
 * --- LEGAL CONTENT ---
 * Privacy Policy (cs, en, sk, uk) and Terms of Service (cs, en) for Shiftella.
 * Czech is the main version; the others are translations of it. A language a
 * document lacks falls back to its base language (BASE_LANGUAGE: sk → cs,
 * uk → en) in `legalContent()`.
 *
 * Every data flow in the Privacy Policy was checked against the code
 * (supabase/migrations, supabase/functions, src/features, index.html,
 * deploy/hetzner). If a flow changes — a new provider, table, export field or
 * retention rule — update all four privacy texts in the same PR.
 *
 * Not legal advice: have a lawyer review it before paid plans launch.
 */

import { APP_URL as SERVICE_URL, SUPPORT_EMAIL } from '@shared/brand';
import { BASE_LANGUAGE, type Language } from '@shared/i18n/translations';

export type LegalDoc = 'privacy' | 'terms';
export type LegalLang = Language;
type BaseLang = 'en' | 'cs';

export interface LegalSection {
    h: string;
    /** Lead paragraph. */
    p: string;
    /** Optional bullet list under the paragraph. */
    items?: string[];
    /** Optional closing paragraph under the list. */
    note?: string;
}
export interface LegalContent {
    title: string;
    updated: string;
    intro: string;
    sections: LegalSection[];
}

/** Privacy contact (support@shiftella.app). */
const PRIVACY_EMAIL = SUPPORT_EMAIL;

/**
 * The operator's identity (GDPR art. 13(1)(a)): a private individual during the
 * free beta. Add the IČO here once the owner registers a business.
 */
const OPERATOR: Record<LegalLang, string> = {
    cs: 'Anuar Kairulla, Argentinská 1023/24, Praha 7, Česká republika',
    en: 'Anuar Kairulla, Argentinská 1023/24, Prague 7, Czech Republic',
    sk: 'Anuar Kairulla, Argentinská 1023/24, Praha 7, Česká republika',
    uk: 'Anuar Kairulla, Argentinská 1023/24, Прага 7, Чеська Республіка',
};

const PRIVACY_UPDATED: Record<LegalLang, string> = {
    cs: 'Účinné od 25. listopadu 2026',
    en: 'Effective from 25 November 2026',
    sk: 'Účinné od 25. novembra 2026',
    uk: 'Діє з 25 листопада 2026 року',
};

const TERMS_UPDATED_EN = 'Last updated: 2 July 2026';
const TERMS_UPDATED_CS = 'Naposledy aktualizováno: 2. července 2026';

// --- Privacy Policy: Czech (main version) -------------------------------------

const PRIVACY_CS: LegalContent = {
    title: 'Zásady ochrany osobních údajů',
    updated: PRIVACY_UPDATED.cs,
    intro: `Tyto zásady popisují, jak Shiftella (${SERVICE_URL}, webová a mobilní aplikace pro plánování směn a evidenci docházky malých týmů) zpracovává osobní údaje: jaké, proč, kdo je vidí, jak dlouho je uchováváme a jaká máte práva. Platí pro zaměstnance, vedoucí i majitele organizací, kteří Shiftellu používají, a pro návštěvníky webu.`,
    sections: [
        {
            h: 'Kdo jsme a jak nás kontaktovat',
            p: `Shiftellu provozuje ${OPERATOR.cs}. Služba je zatím v bezplatné beta verzi. S čímkoli, co se týká osobních údajů, nám pište na ${PRIVACY_EMAIL}. Pověřence pro ochranu osobních údajů jsme nejmenovali, protože nám to zákon neukládá.`,
        },
        {
            h: 'Kdo za údaje odpovídá: vaše organizace, nebo my',
            p: 'Organizace (zaměstnavatel, firma, provozovna), která Shiftellu používá, je správcem osobních údajů svých lidí: rozhoduje, koho pozve, co o nich vede a jak dlouho. Shiftella je pro tyto údaje zpracovatelem podle čl. 28 GDPR. Zpracovává je jen podle pokynů organizace a jen proto, aby jí poskytovala službu. Smlouvu o zpracování osobních údajů organizaci na požádání zašleme.',
            note: 'Správcem jsme my u údajů o účtech, předplatném, zpětné vazbě, podpoře a návštěvách webu. Jste-li zaměstnanec, se žádostmi o své pracovní údaje se obracejte nejdřív na svého zaměstnavatele. Napíšete-li nám, žádost mu předáme a pomůžeme ji vyřídit.',
        },
        {
            h: 'Údaje, které zpracováváme pro vaši organizaci',
            p: 'Podle toho, které funkce organizace používá:',
            items: [
                'Profil: jméno a příjmení, e-mail, uživatelské jméno, role, nadřízený, přiřazené pobočky.',
                'Docházka: čas příchodu a odchodu, zvolená pobočka a přesuny mezi pobočkami, poznámky ke směně a k předávce a kdo je četl.',
                'Rozpis: plánované směny, jejich potvrzení, dostupnost, výměny a volné směny.',
                'Nepřítomnost: žádosti o volno a jejich druh (např. dovolená, nemoc, lékař, OČR, náhradní volno, rodičovská dovolená), hodiny, zůstatky dovolené a náhradního volna a jejich úpravy.',
                'Žádosti: o změnu jména nebo role, jiné žádosti a stížnosti. Stížnost lze podat anonymně, schvalovatelé pak nevidí, kdo ji poslal.',
                'Mzdové údaje: hodinová sazba, osobní číslo pro mzdový program, náklady na směny, výkazy a podklady pro mzdy.',
                'Dokumenty: smlouvy, dohody, zdravotní a potravinářský průkaz, školení BOZP a další soubory, případně s datem platnosti.',
                'Oznámení pro tým a kdo je přečetl.',
                'Záznam aktivit: kdo co v organizaci změnil a kdy (např. úprava směny, schválení žádosti, odchod člena).',
                'Přehledy pro majitele: odpracované a plánované hodiny, náklady, absence, pozdní příchody a přesčasy, vypočtené z údajů výše.',
            ],
            note: 'Polohu (GPS) nesbíráme, pobočku při příchodu volíte sami. Čas příchodu a odchodu zapisuje server podle svých hodin, ne podle hodin vašeho zařízení. Začátek směny nejde posunout a ukončenou směnu může změnit jen vedoucí. Každou jeho úpravu zapíše záznam aktivit.',
        },
        {
            h: 'Zdravotní údaje',
            p: 'Zdravotní průkaz, druhy nepřítomnosti jako nemoc, lékař nebo OČR a posudky o zdravotní způsobilosti mohou vypovídat o zdraví. Organizace je smí v Shiftelle vést jen v rozsahu, který jí ukládá zákon (např. zákoník práce nebo zákon o ochraně veřejného zdraví), tedy podle čl. 6 odst. 1 písm. c) a čl. 9 odst. 2 písm. b) GDPR. Diagnózy a lékařské zprávy do aplikace nepatří.',
            note: 'Dokumenty leží v neveřejném úložišti. Vidí je jen zaměstnanec a lidé, kterým to organizace povolila, a stahují se přes odkazy platné 60 sekund. Smazáním dokumentu nebo účtu se smaže i soubor.',
        },
        {
            h: 'Údaje, za které odpovídáme my',
            p: 'Jako správce zpracováváme:',
            items: [
                'Účet a přihlášení: e-mail, heslo (ukládá se jen jako hash), časy přihlášení a technické záznamy poskytovatele databáze, např. IP adresu a typ prohlížeče, kvůli zabezpečení. Neúspěšné pokusy o přihlášení počítáme podle IP adresy a uživatelského jména, obojí ukládáme jen jako hash SHA-256.',
                'Organizaci a předplatné: název organizace, tarif a stav zkušební doby. Až spustíme placené tarify, přibude fakturační jméno, e-mail, adresa, DIČ a identifikátor zákazníka u Stripe. Údaje o kartě zadáváte přímo u Stripe, my je nevidíme.',
                'Zpětnou vazbu z aplikace: druh a text zprávy, zda vás smíme kontaktovat, stránku aplikace (bez parametrů), verzi aplikace, jazyk a údaj o prohlížeči (user agent). Upozornění na novou zprávu s vaším jménem, organizací a textem dostává provozovatel jako push oznámení a přes Telegram.',
                'Komunikaci s podporou: e-maily, které nám pošlete, a naše odpovědi.',
                'Návštěvu webu: analytiku ani sledování nepoužíváme a písma i vše ostatní načítáme z vlastního serveru, takže vaši IP adresu při návštěvě nevidí žádná třetí strana.',
            ],
        },
        {
            h: 'Proč údaje zpracováváme a na jakém základě',
            p: 'Účely a právní základy podle čl. 6 GDPR:',
            items: [
                'Služba pro organizaci: jako zpracovatel na pokyn organizace a na jejím právním základě, obvykle plnění pracovní smlouvy, právní povinnost (např. evidence pracovní doby) a oprávněný zájem na organizaci práce.',
                'Účet, přihlášení a servisní e-maily (pozvánka, potvrzení, obnova hesla): plnění smlouvy, písm. b).',
                'Zabezpečení, prevence zneužití (včetně limitu pokusů o přihlášení), záznam aktivit a oprava chyb: oprávněný zájem, písm. f).',
                'Zpětná vazba a podpora: oprávněný zájem na zlepšování služby a na odpovědi na vaše dotazy, písm. f).',
                'Volitelné funkce (push, Telegram, kalendář): na vaši žádost, když je zapnete. Kdykoli je můžete vypnout.',
                'Fakturace, až spustíme placené tarify: plnění smlouvy a povinnosti podle účetních a daňových předpisů, písm. b) a c).',
            ],
            note: 'Údaje neprodáváme a nepoužíváme k reklamě ani k profilování. Žádná automatizovaná rozhodnutí s právními účinky (čl. 22 GDPR) nepřijímáme. Upozornění na pozdní příchod a přehledy jsou jen informace pro vedoucí, rozhodují lidé.',
        },
        {
            h: 'Kdo vaše údaje uvidí',
            p: 'Uvnitř organizace řídí přístup organizace přes role a oprávnění. Výchozí pravidla:',
            items: [
                'Kolegové vidí vaše jméno, rozpis, aktuální docházku a poznámky k předávce.',
                'Hodinovou sazbu vidíte vy a vedoucí s oprávněním, kolegové ne.',
                'Dokumenty a osobní číslo vidíte vy a lidé nad vámi s oprávněním k týmu nebo k výkazům.',
                'Provozovatel Shiftelly má technický přístup ke všem údajům. Používá ho jen k provozu a zabezpečení služby, k podpoře na žádost organizace a tam, kde to ukládá zákon.',
            ],
            note: 'Mimo organizaci údaje předáváme jen poskytovatelům níže, nebo když to ukládá zákon (např. na žádost soudu nebo policie).',
        },
        {
            h: 'Zpracovatelé a další příjemci',
            p: 'Shiftellu provozujeme s těmito poskytovateli:',
            items: [
                'Supabase Inc. (USA): databáze, přihlašování, úložiště souborů a serverové funkce. Data jsou uložena v EU (Irsko, eu-west-1).',
                'Hetzner Online GmbH (Německo): hosting webové aplikace v EU. Server neukládá záznamy jednotlivých návštěv.',
                'Resend, Inc. (USA): odesílání servisních e-mailů z domény shiftella.app přes region EU (Irsko).',
                'Google (Firebase Cloud Messaging) a na zařízeních Apple služba Apple Push Notification service: doručení push oznámení. Dostanou token zařízení a text oznámení, např. jméno kolegy, pobočku nebo název dokumentu, kterému končí platnost.',
                'Cloudflare, Inc. (USA): DNS domény shiftella.app a přeposílání e-mailů z adresy support@shiftella.app do schránky provozovatele u Googlu (Gmail).',
                'Telegram: jen pokud si bota propojíte, viz Volitelné funkce.',
                'Stripe Payments Europe, Ltd. (Irsko): platby, až spustíme placené tarify. Během bezplatné bety se přes Stripe nic neplatí.',
            ],
        },
        {
            h: 'Předávání mimo EU',
            p: 'Údaje ukládáme v EU. Supabase, Resend, Google, Apple, Cloudflare a Stripe jsou americké firmy nebo k údajům mohou mít přístup z USA. Takový přenos chrání rámec EU–USA pro ochranu osobních údajů (Data Privacy Framework), pokud se k němu poskytovatel připojil, jinak standardní smluvní doložky Evropské komise (SCC). Telegram sídlí mimo EU v zemi bez rozhodnutí o odpovídající ochraně. Telegram používáte jen na vlastní žádost a kdykoli ho můžete odpojit.',
        },
        {
            h: 'Volitelné funkce',
            p: 'Tyto funkce zapínáte sami:',
            items: [
                'Push oznámení: po povolení v zařízení uložíme jeho token. Kategorie oznámení nastavíte v Nastavení. Odhlášením se token z daného zařízení odstraní.',
                'Telegram: propojení začíná jednorázovým kódem platným 10 minut, ukládáme jen jeho hash. Pak uložíme ID chatu a vaše uživatelské jméno v Telegramu. Bot posílá stejné zprávy jako push oznámení, včetně celého textu týmových oznámení, a umí vyřídit žádosti, pokud k tomu máte oprávnění. Zprávy zpracovává Telegram podle svých pravidel. Odpojíte ho v Nastavení nebo příkazem /stop.',
                'Kalendář (ICS): odkaz obsahuje tajný náhodný klíč. Kdo ho zná, uvidí vaše zveřejněné směny (30 dní zpět a 180 dní dopředu) a schválené volno. Kalendář, do kterého odkaz přidáte (Google, Apple, Outlook…), si data pravidelně stahuje. Odkaz můžete kdykoli vyměnit nebo vypnout.',
                'Biometrický zámek v mobilní aplikaci: otisk prstu nebo obličej ověřuje jen systém zařízení, k nám se nic nedostane.',
                'Ukázková data: vymyšlené osoby a směny, které si majitel může vložit a jedním klepnutím smazat. Neobsahují údaje skutečných lidí.',
            ],
        },
        {
            h: 'Cookies a úložiště v zařízení',
            p: 'Reklamní ani analytické cookies a sledovací nástroje nepoužíváme. Aplikace si do úložiště prohlížeče (localStorage, v mobilní aplikaci do úložiště aplikace) ukládá jen to, co potřebuje k fungování: přihlášení, jazyk, vzhled a formát času, výchozí a nedávné pobočky, stav postranního panelu a skrytých tipů, token push oznámení (aby šel při odhlášení zrušit) a nastavení biometrického zámku. Tyto údaje zůstávají ve vašem zařízení a souhlas nevyžadují. Přihlášení smažete odhlášením, zbytek vymazáním dat webu v prohlížeči.',
        },
        {
            h: 'Jak dlouho údaje uchováváme',
            p: 'Automatické mazání po uplynutí určité doby zatím nemáme. Platí:',
            items: [
                'Pracovní údaje uchováváme, dokud je organizace nesmaže nebo neodebere člena. Dobu uchování určuje organizace jako správce.',
                'Odebráním člena nebo smazáním vlastního účtu (Nastavení → Smazat účet) smažeme profil, docházku, rozpis, volno, žádosti, mzdové údaje, dokumenty včetně souborů, poznámky, zpětnou vazbu, tokeny a propojení s Telegramem a kalendářem. Organizace by si předtím měla stáhnout výkazy, které musí ze zákona uchovat.',
                'V záznamu aktivit organizace zůstanou položky o vás i s vaším jménem (např. „X opustil tým“) a oznámení, která jste napsali, zůstanou bez autora. Zmizí se smazáním organizace.',
                'Organizaci smažeme na žádost jejího majitele, až z ní odejdou všichni členové. Smaže se s ní vše, co k ní patří.',
                'E-maily podpory uchováváme po dobu nutnou k vyřízení věci a k ochraně našich práv.',
                'Fakturační doklady (po spuštění placených tarifů) uchováváme po dobu, kterou ukládají účetní a daňové předpisy, nejvýš 10 let.',
                'Kódy pro Telegram platí 10 minut. Počítadla neúspěšných přihlášení zapomínáme po jednom dni, záznam o odeslaném ranním přehledu po 7 dnech.',
                'Zálohy databáze dělá Supabase automaticky a drží je omezenou dobu. Smazané údaje z nich zmizí, jakmile se zálohy obmění.',
            ],
        },
        {
            h: 'Zabezpečení',
            p: 'Komunikace je šifrovaná (HTTPS s HSTS) a uložená data šifruje poskytovatel databáze. Každá organizace vidí jen svá data a přístup uvnitř ní řídí role. Hlídá to přímo databáze (Row Level Security), ne jen aplikace. Hesla (nejméně 8 znaků) a kódy pro Telegram ukládáme jen jako hash, dokumenty v neveřejném úložišti s krátkodobými odkazy. Po opakovaných neúspěšných pokusech o přihlášení se přihlášení na 15 minut zablokuje. Čas příchodu a odchodu určuje server. Push oznámení odesílá jen naše vlastní databáze, nikdo zvenčí. Web má přísnou bezpečnostní politiku obsahu (CSP), změny v organizaci se zapisují do záznamu aktivit a správci si mohou v mobilní aplikaci zapnout biometrický zámek.',
            note: 'Pokud dojde k porušení zabezpečení, oznámíme ho bez zbytečného odkladu organizaci a v zákonné lhůtě i ÚOOÚ a dotčeným osobám.',
        },
        {
            h: 'Vaše práva',
            p: 'Podle GDPR máte právo:',
            items: [
                'na přístup a přenositelnost: v Nastavení si stáhnete své údaje ve formátu JSON (profil, docházka, rozpis, volno, oznámení a zpětná vazba). Ostatní údaje vidíte v aplikaci, nebo vám je na požádání pošleme;',
                'na opravu: uživatelské jméno změníte v profilu, změnu jména si vyžádáte v aplikaci, ostatní opraví vaše organizace nebo my;',
                'na výmaz: účet smažete sami v Nastavení. Poslední správce organizace, ve které jsou další členové, musí správu nejdřív předat;',
                'na omezení zpracování a vznést námitku proti zpracování na základě oprávněného zájmu;',
                'kdykoli vypnout volitelnou funkci nebo odvolat souhlas, aniž by to ovlivnilo dřívější zpracování;',
                'podat stížnost u Úřadu pro ochranu osobních údajů (Pplk. Sochora 27, 170 00 Praha 7, www.uoou.cz) nebo u dozorového úřadu v zemi EU, kde žijete či pracujete.',
            ],
            note: `Žádosti posílejte na ${PRIVACY_EMAIL}. Odpovíme do jednoho měsíce. Žádosti o pracovní údaje vyřizujeme spolu s vaší organizací.`,
        },
        {
            h: 'Děti',
            p: 'Shiftella není určena osobám mladším 15 let. Pokud zjistíme, že takový účet vznikl, smažeme ho.',
        },
        {
            h: 'Změny zásad',
            p: 'Zásady upravíme, když se změní služba nebo předpisy. Datum účinnosti je nahoře. O podstatných změnách vás předem informujeme v aplikaci nebo e-mailem.',
        },
    ],
};

// --- Privacy Policy: English ---------------------------------------------------

const PRIVACY_EN: LegalContent = {
    title: 'Privacy Policy',
    updated: PRIVACY_UPDATED.en,
    intro: `This policy explains how Shiftella (${SERVICE_URL}, a web and mobile app for shift planning and attendance for small teams) handles personal data: what we process, why, who sees it, how long we keep it and what your rights are. It applies to employees, managers and owners of organizations that use Shiftella, and to visitors of the website. The Czech version is the main one.`,
    sections: [
        {
            h: 'Who we are and how to reach us',
            p: `Shiftella is operated by ${OPERATOR.en}. The service is currently in a free beta. For anything about personal data, email ${PRIVACY_EMAIL}. We have not appointed a data protection officer, as the law does not require one for us.`,
        },
        {
            h: 'Who is responsible: your organization or us',
            p: 'The organization (employer, company, venue) that uses Shiftella is the controller of its people’s personal data: it decides whom to invite, what to record about them and for how long. For that data Shiftella is a processor under Art. 28 GDPR. We process it only on the organization’s instructions and only to provide the service to it. We send organizations a data processing agreement on request.',
            note: 'We are the controller for account, subscription, feedback, support and website data. If you are an employee, please send requests about your work data to your employer first. If you write to us, we pass the request on and help to handle it.',
        },
        {
            h: 'Data we process for your organization',
            p: 'Depending on which features the organization uses:',
            items: [
                'Profile: first and last name, email, username, role, manager, assigned locations.',
                'Attendance: clock-in and clock-out times, the chosen location and moves between locations, shift and handover notes and who has read them.',
                'Rota: planned shifts, shift confirmations, availability, swaps and open shifts.',
                'Absence: time-off requests and their type (e.g. vacation, sick day, doctor, child-care leave (OČR), time off in lieu (náhradní volno), parental leave), hours, vacation and time-in-lieu balances and adjustments.',
                'Requests: name or role changes, other requests and complaints. A complaint can be sent anonymously; reviewers then don’t see who sent it.',
                'Pay data: hourly rate, personal number for the payroll program, shift costs, timesheets and payroll exports.',
                'Documents: contracts, agreements, health and food-handling certificates, safety training and other files, optionally with an expiry date.',
                'Team announcements and who has read them.',
                'Activity log: who changed what in the organization and when (e.g. a shift edit, a request approval, a member leaving).',
                'Owner analytics: worked vs. planned hours, costs, absences, late arrivals and overtime, calculated from the data above.',
            ],
            note: 'We don’t collect location (GPS); you pick the location when clocking in. Clock-in and clock-out times are set by the server’s clock, not your device’s. The start of a shift can’t be moved, and only a manager can change a finished shift. Every such change is recorded in the activity log.',
        },
        {
            h: 'Health data',
            p: 'A health certificate (zdravotní průkaz), absence types such as sick day, doctor or OČR, and medical fitness assessments can reveal information about health. An organization may keep them in Shiftella only to the extent the law requires (e.g. the Labour Code or the Public Health Protection Act), i.e. under Art. 6(1)(c) and Art. 9(2)(b) GDPR. Diagnoses and medical reports do not belong in the app.',
            note: 'Documents are kept in private storage. Only the employee and people the organization has allowed can see them, and they are downloaded through links valid for 60 seconds. Deleting a document or an account also deletes the file.',
        },
        {
            h: 'Data we are responsible for',
            p: 'As controller we process:',
            items: [
                'Account and sign-in: email, password (stored only as a hash), sign-in times and the database provider’s technical logs, e.g. IP address and browser type, for security. Failed sign-in attempts are counted per IP address and per username, both stored only as SHA-256 hashes.',
                'Organization and subscription: organization name, plan and trial status. Once paid plans start: billing name, email, address, VAT ID and the Stripe customer ID. You enter card details directly at Stripe; we never see them.',
                'In-app feedback: the type and text of the message, whether we may contact you, the app page (without parameters), app version, language and browser details (user agent). The operator is alerted to a new message, with your name, organization and the text, by push notification and via Telegram.',
                'Support communication: emails you send us and our replies.',
                'Website visits: we use no analytics or tracking, and fonts and everything else load from our own server, so no third party sees your IP address when you visit.',
            ],
        },
        {
            h: 'Why we process data and on what legal basis',
            p: 'Purposes and legal bases under Art. 6 GDPR:',
            items: [
                'The service for your organization: as a processor, on the organization’s instructions and its legal basis, usually performance of the employment contract, a legal obligation (e.g. working-time records) and its legitimate interest in organizing work.',
                'Your account, sign-in and service emails (invitation, confirmation, password reset): performance of a contract, point (b).',
                'Security, abuse prevention (including the sign-in attempt limit), the activity log and fixing bugs: legitimate interest, point (f).',
                'Feedback and support: legitimate interest in improving the service and answering you, point (f).',
                'Optional features (push, Telegram, calendar): at your request when you turn them on. You can turn them off at any time.',
                'Billing, once paid plans start: performance of a contract and obligations under accounting and tax law, points (b) and (c).',
            ],
            note: 'We don’t sell data or use it for advertising or profiling. We make no automated decisions with legal effects (Art. 22 GDPR). Late-arrival alerts and analytics are information for managers; people make the decisions.',
        },
        {
            h: 'Who sees your data',
            p: 'Inside an organization, access is set by the organization through roles and permissions. By default:',
            items: [
                'Colleagues see your name, the rota, current attendance and handover notes.',
                'Your hourly rate is visible to you and to managers with permission, not to colleagues.',
                'Documents and your personal number are visible to you and to people above you with team or timesheet permission.',
                'The Shiftella operator has technical access to all data. It uses it only to run and secure the service, for support at the organization’s request, and where the law requires.',
            ],
            note: 'Outside the organization, we share data only with the providers below, or where the law requires (e.g. at the request of a court or the police).',
        },
        {
            h: 'Processors and other recipients',
            p: 'We run Shiftella with these providers:',
            items: [
                'Supabase Inc. (USA): database, sign-in, file storage and server functions. Data is stored in the EU (Ireland, eu-west-1).',
                'Hetzner Online GmbH (Germany): web hosting in the EU. The server keeps no log of individual visits.',
                'Resend, Inc. (USA): sending service emails from the shiftella.app domain through its EU region (Ireland).',
                'Google (Firebase Cloud Messaging) and, on Apple devices, Apple Push Notification service: delivering push notifications. They receive the device token and the notification text, e.g. a colleague’s name, a location or the name of an expiring document.',
                'Cloudflare, Inc. (USA): DNS for shiftella.app and forwarding email sent to support@shiftella.app to the operator’s mailbox at Google (Gmail).',
                'Telegram: only if you link the bot, see Optional features.',
                'Stripe Payments Europe, Ltd. (Ireland): payments, once paid plans start. Nothing is paid through Stripe during the free beta.',
            ],
        },
        {
            h: 'Transfers outside the EU',
            p: 'We store data in the EU. Supabase, Resend, Google, Apple, Cloudflare and Stripe are US companies or may access data from the US. Such transfers are covered by the EU–US Data Privacy Framework where the provider has joined it, otherwise by the European Commission’s Standard Contractual Clauses (SCCs). Telegram is based outside the EU in a country without an adequacy decision. You use Telegram only at your own request and can unlink it at any time.',
        },
        {
            h: 'Optional features',
            p: 'You turn these on yourself:',
            items: [
                'Push notifications: once you allow them on your device, we store its token. You choose notification categories in Settings. Signing out removes the token from that device.',
                'Telegram: linking starts with a one-time code valid for 10 minutes; we store only its hash. We then store the chat ID and your Telegram username. The bot sends the same messages as push notifications, including the full text of team announcements, and can handle requests if you have permission to. Telegram processes the messages under its own terms. Unlink it in Settings or with /stop.',
                'Calendar (ICS): the link contains a secret random key. Anyone who has it can see your published shifts (30 days back, 180 days ahead) and approved time off. The calendar you add it to (Google, Apple, Outlook…) fetches the data regularly. You can replace or turn off the link at any time.',
                'Biometric lock in the mobile app: your fingerprint or face is checked only by your device’s system; nothing reaches us.',
                'Demo data: made-up people and shifts that an owner can add and remove with one tap. It contains no real people’s data.',
            ],
        },
        {
            h: 'Cookies and on-device storage',
            p: 'We use no advertising or analytics cookies and no tracking tools. The app keeps in your browser’s storage (localStorage, or app storage in the mobile app) only what it needs to work: your sign-in, language, theme and time format, default and recent locations, sidebar and dismissed-tip state, the push token (so it can be removed when you sign out) and the biometric lock setting. This stays on your device and needs no consent. Signing out removes the sign-in; clearing the site’s data in your browser removes the rest.',
        },
        {
            h: 'How long we keep data',
            p: 'There is no automatic deletion after a set period yet. This applies:',
            items: [
                'Work data is kept until the organization deletes it or removes the member. The organization, as controller, decides how long.',
                'When a member is removed or deletes their own account (Settings → Delete account), we delete the profile, attendance, rota, time off, requests, pay data, documents including the files, notes, feedback, tokens and the Telegram and calendar links. The organization should first download any timesheets it must keep by law.',
                'The organization’s activity log keeps entries about you, including your name (e.g. “X left the team”), and announcements you wrote stay without an author. They go when the organization is deleted.',
                'We delete an organization at its owner’s request once all members have left. Everything that belongs to it is deleted with it.',
                'Support emails are kept as long as needed to resolve the matter and to protect our rights.',
                'Billing records (once paid plans start) are kept for the period required by accounting and tax law, at most 10 years.',
                'Telegram codes expire after 10 minutes. Failed sign-in counters are forgotten after a day, the record of a sent morning digest after 7 days.',
                'Supabase makes database backups automatically and keeps them for a limited time. Deleted data disappears from them as the backups rotate.',
            ],
        },
        {
            h: 'Security',
            p: 'Traffic is encrypted (HTTPS with HSTS) and the database provider encrypts stored data. Each organization sees only its own data, and roles control access inside it. The database itself enforces this (Row Level Security), not just the app. Passwords (at least 8 characters) and Telegram codes are stored only as hashes, documents in private storage with short-lived links. After repeated failed sign-in attempts, sign-in is locked for 15 minutes. Clock-in and clock-out times are set by the server. Push notifications can be triggered only by our own database, not from outside. The website has a strict Content Security Policy, changes in an organization are written to the activity log, and admins can turn on a biometric lock in the mobile app.',
            note: 'If a security breach occurs, we inform the organization without undue delay and, within the legal deadline, the Czech data protection authority (ÚOOÚ) and the people affected.',
        },
        {
            h: 'Your rights',
            p: 'Under the GDPR you have the right to:',
            items: [
                'access and portability: download your data as JSON in Settings (profile, attendance, rota, time off, notifications and feedback). Other data you can see in the app, or we send it on request;',
                'rectification: change your username in your profile and request a name change in the app; anything else your organization or we correct;',
                'erasure: delete your account yourself in Settings. The last admin of an organization that still has other members must hand over admin rights first;',
                'restriction of processing, and to object to processing based on legitimate interest;',
                'turn off an optional feature or withdraw consent at any time, without affecting earlier processing;',
                'lodge a complaint with the Office for Personal Data Protection (ÚOOÚ, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.cz) or with the supervisory authority of the EU country where you live or work.',
            ],
            note: `Send requests to ${PRIVACY_EMAIL}. We reply within one month. Requests about work data are handled together with your organization.`,
        },
        {
            h: 'Children',
            p: 'Shiftella is not intended for people under 15. If we learn that such an account exists, we delete it.',
        },
        {
            h: 'Changes to this policy',
            p: 'We update this policy when the service or the law changes. The effective date is at the top. We tell you about significant changes in advance, in the app or by email.',
        },
    ],
};

// --- Privacy Policy: Slovak ----------------------------------------------------
// Terminology: in Slovak GDPR language "prevádzkovateľ" means controller, so the
// service operator is "poskytovateľ" here.

const PRIVACY_SK: LegalContent = {
    title: 'Zásady ochrany osobných údajov',
    updated: PRIVACY_UPDATED.sk,
    intro: `Tieto zásady opisujú, ako Shiftella (${SERVICE_URL}, webová a mobilná aplikácia na plánovanie zmien a evidenciu dochádzky malých tímov) spracúva osobné údaje: aké, prečo, kto ich vidí, ako dlho ich uchovávame a aké máte práva. Platia pre zamestnancov, vedúcich aj majiteľov organizácií, ktorí Shiftellu používajú, a pre návštevníkov webu. Hlavná je česká verzia.`,
    sections: [
        {
            h: 'Kto sme a ako nás kontaktovať',
            p: `Shiftellu poskytuje ${OPERATOR.sk}. Služba je zatiaľ v bezplatnej beta verzii. So všetkým, čo sa týka osobných údajov, nám píšte na ${PRIVACY_EMAIL}. Zodpovednú osobu sme nevymenovali, pretože nám to zákon neukladá.`,
        },
        {
            h: 'Kto za údaje zodpovedá: vaša organizácia, alebo my',
            p: 'Organizácia (zamestnávateľ, firma, prevádzka), ktorá Shiftellu používa, je prevádzkovateľom osobných údajov svojich ľudí: rozhoduje, koho pozve, čo o nich vedie a ako dlho. Shiftella je pre tieto údaje sprostredkovateľom podľa čl. 28 GDPR. Spracúva ich len podľa pokynov organizácie a len preto, aby jej poskytovala službu. Zmluvu o spracúvaní osobných údajov organizácii na požiadanie pošleme.',
            note: 'Prevádzkovateľom sme my pri údajoch o účtoch, predplatnom, spätnej väzbe, podpore a návštevách webu. Ak ste zamestnanec, so žiadosťami o svoje pracovné údaje sa obracajte najprv na svojho zamestnávateľa. Ak napíšete nám, žiadosť mu odovzdáme a pomôžeme ju vybaviť.',
        },
        {
            h: 'Údaje, ktoré spracúvame pre vašu organizáciu',
            p: 'Podľa toho, ktoré funkcie organizácia používa:',
            items: [
                'Profil: meno a priezvisko, e-mail, používateľské meno, rola, nadriadený, priradené pobočky.',
                'Dochádzka: čas príchodu a odchodu, zvolená pobočka a presuny medzi pobočkami, poznámky k zmene a k odovzdávke a kto ich čítal.',
                'Rozpis: plánované zmeny, ich potvrdenie, dostupnosť, výmeny a voľné zmeny.',
                'Neprítomnosť: žiadosti o voľno a ich druh (napr. dovolenka, choroba, lekár, OČR, náhradné voľno, rodičovská dovolenka), hodiny, zostatky dovolenky a náhradného voľna a ich úpravy.',
                'Žiadosti: o zmenu mena alebo roly, iné žiadosti a sťažnosti. Sťažnosť možno podať anonymne, schvaľovatelia potom nevidia, kto ju poslal.',
                'Mzdové údaje: hodinová sadzba, osobné číslo pre mzdový program, náklady na zmeny, výkazy a podklady pre mzdy.',
                'Dokumenty: zmluvy, dohody, zdravotný a potravinársky preukaz, školenie BOZP a ďalšie súbory, prípadne s dátumom platnosti.',
                'Oznámenia pre tím a kto ich prečítal.',
                'Záznam aktivít: kto čo v organizácii zmenil a kedy (napr. úprava zmeny, schválenie žiadosti, odchod člena).',
                'Prehľady pre majiteľa: odpracované a plánované hodiny, náklady, absencie, neskoré príchody a nadčasy, vypočítané z údajov vyššie.',
            ],
            note: 'Polohu (GPS) nezbierame, pobočku pri príchode volíte sami. Čas príchodu a odchodu zapisuje server podľa svojich hodín, nie podľa hodín vášho zariadenia. Začiatok zmeny nemožno posunúť a ukončenú zmenu môže zmeniť len vedúci. Každú jeho úpravu zapíše záznam aktivít.',
        },
        {
            h: 'Údaje o zdraví',
            p: 'Zdravotný preukaz, druhy neprítomnosti ako choroba, lekár alebo OČR a posudky o zdravotnej spôsobilosti môžu vypovedať o zdraví. Organizácia ich smie v Shiftelle viesť len v rozsahu, ktorý jej ukladá zákon (napr. zákonník práce alebo predpisy o ochrane verejného zdravia), teda podľa čl. 6 ods. 1 písm. c) a čl. 9 ods. 2 písm. b) GDPR. Diagnózy a lekárske správy do aplikácie nepatria.',
            note: 'Dokumenty sú v neverejnom úložisku. Vidí ich len zamestnanec a ľudia, ktorým to organizácia povolila, a sťahujú sa cez odkazy platné 60 sekúnd. Zmazaním dokumentu alebo účtu sa zmaže aj súbor.',
        },
        {
            h: 'Údaje, za ktoré zodpovedáme my',
            p: 'Ako prevádzkovateľ spracúvame:',
            items: [
                'Účet a prihlásenie: e-mail, heslo (ukladá sa len ako hash), časy prihlásenia a technické záznamy poskytovateľa databázy, napr. IP adresu a typ prehliadača, kvôli zabezpečeniu. Neúspešné pokusy o prihlásenie počítame podľa IP adresy a používateľského mena, oboje ukladáme len ako hash SHA-256.',
                'Organizáciu a predplatné: názov organizácie, tarifu a stav skúšobnej doby. Keď spustíme platené tarify, pribudne fakturačné meno, e-mail, adresa, DIČ a identifikátor zákazníka v Stripe. Údaje o karte zadávate priamo v Stripe, my ich nevidíme.',
                'Spätnú väzbu z aplikácie: druh a text správy, či vás smieme kontaktovať, stránku aplikácie (bez parametrov), verziu aplikácie, jazyk a údaj o prehliadači (user agent). Upozornenie na novú správu s vaším menom, organizáciou a textom dostáva poskytovateľ ako push oznámenie a cez Telegram.',
                'Komunikáciu s podporou: e-maily, ktoré nám pošlete, a naše odpovede.',
                'Návštevu webu: analytiku ani sledovanie nepoužívame a písma aj všetko ostatné načítavame z vlastného servera, takže vašu IP adresu pri návšteve nevidí žiadna tretia strana.',
            ],
        },
        {
            h: 'Prečo údaje spracúvame a na akom základe',
            p: 'Účely a právne základy podľa čl. 6 GDPR:',
            items: [
                'Služba pre organizáciu: ako sprostredkovateľ na pokyn organizácie a na jej právnom základe, zvyčajne plnenie pracovnej zmluvy, zákonná povinnosť (napr. evidencia pracovného času) a oprávnený záujem na organizácii práce.',
                'Účet, prihlásenie a servisné e-maily (pozvánka, potvrdenie, obnova hesla): plnenie zmluvy, písm. b).',
                'Zabezpečenie, prevencia zneužitia (vrátane limitu pokusov o prihlásenie), záznam aktivít a oprava chýb: oprávnený záujem, písm. f).',
                'Spätná väzba a podpora: oprávnený záujem na zlepšovaní služby a na odpovedi na vaše otázky, písm. f).',
                'Voliteľné funkcie (push, Telegram, kalendár): na vašu žiadosť, keď ich zapnete. Kedykoľvek ich môžete vypnúť.',
                'Fakturácia, keď spustíme platené tarify: plnenie zmluvy a povinnosti podľa účtovných a daňových predpisov, písm. b) a c).',
            ],
            note: 'Údaje nepredávame a nepoužívame na reklamu ani na profilovanie. Žiadne automatizované rozhodnutia s právnymi účinkami (čl. 22 GDPR) neprijímame. Upozornenia na neskorý príchod a prehľady sú len informácie pre vedúcich, rozhodujú ľudia.',
        },
        {
            h: 'Kto vaše údaje uvidí',
            p: 'V rámci organizácie riadi prístup organizácia cez roly a oprávnenia. Predvolené pravidlá:',
            items: [
                'Kolegovia vidia vaše meno, rozpis, aktuálnu dochádzku a poznámky k odovzdávke.',
                'Hodinovú sadzbu vidíte vy a vedúci s oprávnením, kolegovia nie.',
                'Dokumenty a osobné číslo vidíte vy a ľudia nad vami s oprávnením k tímu alebo k výkazom.',
                'Poskytovateľ Shiftelly má technický prístup ku všetkým údajom. Používa ho len na prevádzku a zabezpečenie služby, na podporu na žiadosť organizácie a tam, kde to ukladá zákon.',
            ],
            note: 'Mimo organizácie údaje poskytujeme len sprostredkovateľom nižšie, alebo keď to ukladá zákon (napr. na žiadosť súdu alebo polície).',
        },
        {
            h: 'Sprostredkovatelia a ďalší príjemcovia',
            p: 'Shiftellu prevádzkujeme s týmito poskytovateľmi:',
            items: [
                'Supabase Inc. (USA): databáza, prihlasovanie, úložisko súborov a serverové funkcie. Údaje sú uložené v EÚ (Írsko, eu-west-1).',
                'Hetzner Online GmbH (Nemecko): hosting webovej aplikácie v EÚ. Server neukladá záznamy jednotlivých návštev.',
                'Resend, Inc. (USA): odosielanie servisných e-mailov z domény shiftella.app cez región EÚ (Írsko).',
                'Google (Firebase Cloud Messaging) a na zariadeniach Apple služba Apple Push Notification service: doručenie push oznámení. Dostanú token zariadenia a text oznámenia, napr. meno kolegu, pobočku alebo názov dokumentu, ktorému končí platnosť.',
                'Cloudflare, Inc. (USA): DNS domény shiftella.app a preposielanie e-mailov z adresy support@shiftella.app do schránky poskytovateľa v Google (Gmail).',
                'Telegram: len ak si bota prepojíte, pozri Voliteľné funkcie.',
                'Stripe Payments Europe, Ltd. (Írsko): platby, keď spustíme platené tarify. Počas bezplatnej bety sa cez Stripe nič neplatí.',
            ],
        },
        {
            h: 'Prenos mimo EÚ',
            p: 'Údaje ukladáme v EÚ. Supabase, Resend, Google, Apple, Cloudflare a Stripe sú americké firmy alebo k údajom môžu mať prístup z USA. Taký prenos chráni rámec EÚ – USA pre ochranu osobných údajov (Data Privacy Framework), ak sa k nemu poskytovateľ pripojil, inak štandardné zmluvné doložky Európskej komisie (SCC). Telegram sídli mimo EÚ v krajine bez rozhodnutia o primeranosti ochrany. Telegram používate len na vlastnú žiadosť a kedykoľvek ho môžete odpojiť.',
        },
        {
            h: 'Voliteľné funkcie',
            p: 'Tieto funkcie zapínate sami:',
            items: [
                'Push oznámenia: po povolení v zariadení uložíme jeho token. Kategórie oznámení nastavíte v Nastaveniach. Odhlásením sa token z daného zariadenia odstráni.',
                'Telegram: prepojenie začína jednorazovým kódom platným 10 minút, ukladáme len jeho hash. Potom uložíme ID chatu a vaše používateľské meno v Telegrame. Bot posiela rovnaké správy ako push oznámenia vrátane celého textu tímových oznámení a vie vybaviť žiadosti, ak na to máte oprávnenie. Správy spracúva Telegram podľa svojich pravidiel. Odpojíte ho v Nastaveniach alebo príkazom /stop.',
                'Kalendár (ICS): odkaz obsahuje tajný náhodný kľúč. Kto ho pozná, uvidí vaše zverejnené zmeny (30 dní dozadu a 180 dní dopredu) a schválené voľno. Kalendár, do ktorého odkaz pridáte (Google, Apple, Outlook…), si údaje pravidelne sťahuje. Odkaz môžete kedykoľvek vymeniť alebo vypnúť.',
                'Biometrický zámok v mobilnej aplikácii: odtlačok prsta alebo tvár overuje len systém zariadenia, k nám sa nič nedostane.',
                'Ukážkové údaje: vymyslené osoby a zmeny, ktoré si majiteľ môže vložiť a jedným ťuknutím zmazať. Neobsahujú údaje skutočných ľudí.',
            ],
        },
        {
            h: 'Cookies a úložisko v zariadení',
            p: 'Reklamné ani analytické cookies a sledovacie nástroje nepoužívame. Aplikácia si do úložiska prehliadača (localStorage, v mobilnej aplikácii do úložiska aplikácie) ukladá len to, čo potrebuje na fungovanie: prihlásenie, jazyk, vzhľad a formát času, predvolené a nedávne pobočky, stav bočného panela a skrytých tipov, token push oznámení (aby sa dal pri odhlásení zrušiť) a nastavenie biometrického zámku. Tieto údaje zostávajú vo vašom zariadení a súhlas nevyžadujú. Prihlásenie zmažete odhlásením, zvyšok vymazaním údajov webu v prehliadači.',
        },
        {
            h: 'Ako dlho údaje uchovávame',
            p: 'Automatické mazanie po uplynutí určitej doby zatiaľ nemáme. Platí:',
            items: [
                'Pracovné údaje uchovávame, kým ich organizácia nezmaže alebo neodoberie člena. Dobu uchovávania určuje organizácia ako prevádzkovateľ.',
                'Odobratím člena alebo zmazaním vlastného účtu (Nastavenia → Zmazať účet) zmažeme profil, dochádzku, rozpis, voľno, žiadosti, mzdové údaje, dokumenty vrátane súborov, poznámky, spätnú väzbu, tokeny a prepojenie s Telegramom a kalendárom. Organizácia by si predtým mala stiahnuť výkazy, ktoré musí zo zákona uchovať.',
                'V zázname aktivít organizácie zostanú položky o vás aj s vaším menom (napr. „X opustil tím“) a oznámenia, ktoré ste napísali, zostanú bez autora. Zmiznú so zmazaním organizácie.',
                'Organizáciu zmažeme na žiadosť jej majiteľa, keď z nej odídu všetci členovia. Zmaže sa s ňou všetko, čo k nej patrí.',
                'E-maily podpory uchovávame po dobu potrebnú na vybavenie veci a na ochranu našich práv.',
                'Fakturačné doklady (po spustení platených taríf) uchovávame po dobu, ktorú ukladajú účtovné a daňové predpisy, najviac 10 rokov.',
                'Kódy pre Telegram platia 10 minút. Počítadlá neúspešných prihlásení zabúdame po jednom dni, záznam o odoslanom rannom prehľade po 7 dňoch.',
                'Zálohy databázy robí Supabase automaticky a drží ich obmedzený čas. Zmazané údaje z nich zmiznú, keď sa zálohy obmenia.',
            ],
        },
        {
            h: 'Zabezpečenie',
            p: 'Komunikácia je šifrovaná (HTTPS s HSTS) a uložené údaje šifruje poskytovateľ databázy. Každá organizácia vidí len svoje údaje a prístup v nej riadia roly. Stráži to priamo databáza (Row Level Security), nie len aplikácia. Heslá (najmenej 8 znakov) a kódy pre Telegram ukladáme len ako hash, dokumenty v neverejnom úložisku s krátkodobými odkazmi. Po opakovaných neúspešných pokusoch o prihlásenie sa prihlásenie na 15 minút zablokuje. Čas príchodu a odchodu určuje server. Push oznámenia odosiela len naša vlastná databáza, nikto zvonku. Web má prísnu bezpečnostnú politiku obsahu (CSP), zmeny v organizácii sa zapisujú do záznamu aktivít a správcovia si môžu v mobilnej aplikácii zapnúť biometrický zámok.',
            note: 'Ak dôjde k porušeniu ochrany údajov, oznámime ho bez zbytočného odkladu organizácii a v zákonnej lehote aj dozornému úradu (ÚOOÚ) a dotknutým osobám.',
        },
        {
            h: 'Vaše práva',
            p: 'Podľa GDPR máte právo:',
            items: [
                'na prístup a prenosnosť: v Nastaveniach si stiahnete svoje údaje vo formáte JSON (profil, dochádzka, rozpis, voľno, oznámenia a spätná väzba). Ostatné údaje vidíte v aplikácii, alebo vám ich na požiadanie pošleme;',
                'na opravu: používateľské meno zmeníte v profile, zmenu mena si vyžiadate v aplikácii, ostatné opraví vaša organizácia alebo my;',
                'na vymazanie: účet zmažete sami v Nastaveniach. Posledný správca organizácie, v ktorej sú ďalší členovia, musí správu najprv odovzdať;',
                'na obmedzenie spracúvania a namietať spracúvanie na základe oprávneného záujmu;',
                'kedykoľvek vypnúť voliteľnú funkciu alebo odvolať súhlas bez vplyvu na skoršie spracúvanie;',
                'podať sťažnosť na Úrad pro ochranu osobních údajů (Pplk. Sochora 27, 170 00 Praha 7, www.uoou.cz), na Úrad na ochranu osobných údajov SR (www.dataprotection.gov.sk) alebo na dozorný úrad v krajine EÚ, kde žijete či pracujete.',
            ],
            note: `Žiadosti posielajte na ${PRIVACY_EMAIL}. Odpovieme do jedného mesiaca. Žiadosti o pracovné údaje vybavujeme spolu s vašou organizáciou.`,
        },
        {
            h: 'Deti',
            p: 'Shiftella nie je určená osobám mladším ako 15 rokov. Ak zistíme, že taký účet vznikol, zmažeme ho.',
        },
        {
            h: 'Zmeny zásad',
            p: 'Zásady upravíme, keď sa zmení služba alebo predpisy. Dátum účinnosti je hore. O podstatných zmenách vás vopred informujeme v aplikácii alebo e-mailom.',
        },
    ],
};

// --- Privacy Policy: Ukrainian -------------------------------------------------

const PRIVACY_UK: LegalContent = {
    title: 'Політика конфіденційності',
    updated: PRIVACY_UPDATED.uk,
    intro: `Ця політика пояснює, як Shiftella (${SERVICE_URL}, вебзастосунок і мобільний застосунок для планування змін та обліку робочого часу малих команд у Чехії) обробляє персональні дані: які саме, навіщо, хто їх бачить, як довго ми їх зберігаємо і які у вас права. Вона стосується працівників, керівників і власників організацій, що користуються Shiftella, а також відвідувачів сайту. Основною є чеська версія.`,
    sections: [
        {
            h: 'Хто ми і як з нами зв’язатися',
            p: `Shiftella надає ${OPERATOR.uk}. Сервіс поки що працює в безкоштовній бета-версії. З усіх питань щодо персональних даних пишіть на ${PRIVACY_EMAIL}. Інспектора із захисту даних ми не призначали, бо закон цього від нас не вимагає.`,
        },
        {
            h: 'Хто відповідає за дані: ваша організація чи ми',
            p: 'Організація (роботодавець, компанія, заклад), яка користується Shiftella, є контролером персональних даних своїх людей: вона вирішує, кого запросити, що про них вести і як довго. Щодо цих даних Shiftella є обробником відповідно до ст. 28 GDPR. Ми обробляємо їх лише за вказівками організації і лише для того, щоб надавати їй сервіс. Договір про обробку персональних даних надішлемо організації на запит.',
            note: 'Контролером є ми щодо даних облікових записів, підписки, відгуків, підтримки та відвідувань сайту. Якщо ви працівник, із запитами щодо своїх робочих даних звертайтеся спершу до роботодавця. Якщо напишете нам, ми передамо запит і допоможемо його виконати.',
        },
        {
            h: 'Дані, які ми обробляємо для вашої організації',
            p: 'Залежно від того, якими функціями користується організація:',
            items: [
                'Профіль: ім’я та прізвище, e-mail, ім’я користувача, роль, керівник, призначені філії.',
                'Облік часу: час приходу та відходу, обрана філія і переходи між філіями, нотатки до зміни та передачі зміни і хто їх прочитав.',
                'Графік: заплановані зміни, їх підтвердження, доступність, обміни та вільні зміни.',
                'Відсутність: запити на відгул і їх тип (напр. відпустка, хвороба, лікар, догляд за дитиною (OČR), náhradní volno — відгул за роботу у свято, відпустка по догляду за дитиною), години, залишки відпустки та відгулів і їх коригування.',
                'Запити: на зміну імені чи ролі, інші запити та скарги. Скаргу можна подати анонімно — тоді ті, хто її розглядає, не бачать, хто її надіслав.',
                'Дані про оплату: погодинна ставка, табельний номер для програми нарахування зарплати, витрати на зміни, табелі та дані для нарахування зарплати.',
                'Документи: договори, угоди, санітарна книжка (zdravotní průkaz), посвідчення для роботи з харчовими продуктами, інструктажі з охорони праці та інші файли, за потреби з датою дії.',
                'Оголошення для команди і хто їх прочитав.',
                'Журнал дій: хто що змінив в організації і коли (напр. редагування зміни, схвалення запиту, вихід учасника).',
                'Аналітика для власника: відпрацьовані й заплановані години, витрати, відсутності, запізнення та понаднормові, розраховані з даних вище.',
            ],
            note: 'Геолокацію (GPS) ми не збираємо — філію під час приходу ви обираєте самі. Час приходу та відходу записує сервер за своїм годинником, а не за годинником вашого пристрою. Початок зміни перенести не можна, а завершену зміну може змінити лише керівник. Кожну таку зміну фіксує журнал дій.',
        },
        {
            h: 'Дані про здоров’я',
            p: 'Санітарна книжка, типи відсутності як-от хвороба, лікар чи OČR, а також висновки про придатність до роботи можуть містити відомості про здоров’я. Організація може вести їх у Shiftella лише в обсязі, якого вимагає закон (напр. Трудовий кодекс Чехії чи закон про охорону громадського здоров’я), тобто на підставі ст. 6(1)(c) та ст. 9(2)(b) GDPR. Діагнозам і медичним висновкам у застосунку не місце.',
            note: 'Документи зберігаються в закритому сховищі. Їх бачать лише сам працівник і люди, яким це дозволила організація, а завантажуються вони за посиланнями, що діють 60 секунд. Видалення документа чи облікового запису видаляє й файл.',
        },
        {
            h: 'Дані, за які відповідаємо ми',
            p: 'Як контролер ми обробляємо:',
            items: [
                'Обліковий запис і вхід: e-mail, пароль (зберігається лише як хеш), час входу та технічні журнали постачальника бази даних, напр. IP-адресу і тип браузера, для безпеки. Невдалі спроби входу ми рахуємо за IP-адресою та ім’ям користувача; обидва значення зберігаються лише як хеш SHA-256.',
                'Організацію та підписку: назву організації, тариф і стан пробного періоду. Коли запрацюють платні тарифи — платіжне ім’я, e-mail, адресу, податковий номер і ідентифікатор клієнта в Stripe. Дані картки ви вводите безпосередньо на сторінці Stripe, ми їх не бачимо.',
                'Відгуки із застосунку: тип і текст повідомлення, чи можна з вами зв’язатися, сторінку застосунку (без параметрів), версію застосунку, мову та дані браузера (user agent). Сповіщення про нове повідомлення з вашим ім’ям, організацією і текстом постачальник отримує як push-сповіщення та через Telegram.',
                'Листування з підтримкою: листи, які ви нам надсилаєте, і наші відповіді.',
                'Відвідування сайту: аналітики чи стеження ми не використовуємо, а шрифти й усе інше завантажуємо з власного сервера, тож вашу IP-адресу під час відвідування не бачить жодна третя сторона.',
            ],
        },
        {
            h: 'Навіщо ми обробляємо дані і на якій підставі',
            p: 'Цілі та правові підстави за ст. 6 GDPR:',
            items: [
                'Сервіс для організації: як обробник, за вказівками організації та на її правовій підставі — зазвичай виконання трудового договору, юридичний обов’язок (напр. облік робочого часу) і її законний інтерес в організації роботи.',
                'Обліковий запис, вхід і службові листи (запрошення, підтвердження, відновлення пароля): виконання договору, п. (b).',
                'Безпека, запобігання зловживанням (зокрема ліміт спроб входу), журнал дій і виправлення помилок: законний інтерес, п. (f).',
                'Відгуки та підтримка: законний інтерес у покращенні сервісу та відповідях вам, п. (f).',
                'Додаткові функції (push, Telegram, календар): на ваше прохання, коли ви їх вмикаєте. Вимкнути їх можна будь-коли.',
                'Виставлення рахунків, коли запрацюють платні тарифи: виконання договору та обов’язки за бухгалтерським і податковим законодавством, пп. (b) і (c).',
            ],
            note: 'Ми не продаємо дані і не використовуємо їх для реклами чи профілювання. Ми не ухвалюємо автоматизованих рішень з правовими наслідками (ст. 22 GDPR). Сповіщення про запізнення та аналітика — це лише інформація для керівників, рішення ухвалюють люди.',
        },
        {
            h: 'Хто бачить ваші дані',
            p: 'Усередині організації доступ визначає сама організація через ролі та дозволи. За замовчуванням:',
            items: [
                'Колеги бачать ваше ім’я, графік, поточну присутність і нотатки передачі зміни.',
                'Погодинну ставку бачите ви і керівники з дозволом, колеги — ні.',
                'Документи і табельний номер бачите ви і люди над вами з дозволом до команди чи табелів.',
                'Постачальник Shiftella має технічний доступ до всіх даних. Він використовує його лише для роботи й безпеки сервісу, для підтримки на прохання організації і там, де цього вимагає закон.',
            ],
            note: 'За межі організації ми передаємо дані лише постачальникам, наведеним нижче, або коли цього вимагає закон (напр. на запит суду чи поліції).',
        },
        {
            h: 'Обробники та інші одержувачі',
            p: 'Shiftella працює з такими постачальниками:',
            items: [
                'Supabase Inc. (США): база даних, вхід, сховище файлів і серверні функції. Дані зберігаються в ЄС (Ірландія, eu-west-1).',
                'Hetzner Online GmbH (Німеччина): хостинг вебзастосунку в ЄС. Сервер не веде журналу окремих відвідувань.',
                'Resend, Inc. (США): надсилання службових листів із домену shiftella.app через регіон ЄС (Ірландія).',
                'Google (Firebase Cloud Messaging), а на пристроях Apple — Apple Push Notification service: доставка push-сповіщень. Вони отримують токен пристрою і текст сповіщення, напр. ім’я колеги, філію чи назву документа, строк дії якого спливає.',
                'Cloudflare, Inc. (США): DNS домену shiftella.app і пересилання листів з адреси support@shiftella.app до поштової скриньки постачальника в Google (Gmail).',
                'Telegram: лише якщо ви підключите бота, див. Додаткові функції.',
                'Stripe Payments Europe, Ltd. (Ірландія): платежі, коли запрацюють платні тарифи. Під час безкоштовної бети через Stripe нічого не оплачується.',
            ],
        },
        {
            h: 'Передавання за межі ЄС',
            p: 'Ми зберігаємо дані в ЄС. Supabase, Resend, Google, Apple, Cloudflare і Stripe — американські компанії або можуть мати доступ до даних зі США. Таке передавання захищене рамкою ЄС–США щодо захисту даних (Data Privacy Framework), якщо постачальник до неї приєднався, інакше — стандартними договірними положеннями Європейської комісії (SCC). Telegram розташований за межами ЄС у країні без рішення про належний рівень захисту. Telegram ви використовуєте лише на власне прохання і можете відключити його будь-коли.',
        },
        {
            h: 'Додаткові функції',
            p: 'Ці функції ви вмикаєте самі:',
            items: [
                'Push-сповіщення: після дозволу на пристрої ми зберігаємо його токен. Категорії сповіщень налаштовуються в Налаштуваннях. Вихід з облікового запису видаляє токен цього пристрою.',
                'Telegram: підключення починається з одноразового коду, дійсного 10 хвилин; ми зберігаємо лише його хеш. Далі зберігаємо ID чату і ваше ім’я користувача в Telegram. Бот надсилає ті самі повідомлення, що й push-сповіщення, зокрема повний текст оголошень команди, і може розглядати запити, якщо у вас є такий дозвіл. Повідомлення Telegram обробляє за власними правилами. Відключити бота можна в Налаштуваннях або командою /stop.',
                'Календар (ICS): посилання містить секретний випадковий ключ. Хто його має, бачить ваші опубліковані зміни (30 днів назад і 180 днів уперед) та схвалені відгули. Календар, до якого ви додасте посилання (Google, Apple, Outlook…), регулярно завантажує дані. Посилання можна будь-коли замінити або вимкнути.',
                'Біометричне блокування в мобільному застосунку: відбиток пальця чи обличчя перевіряє лише система вашого пристрою, до нас нічого не потрапляє.',
                'Демонстраційні дані: вигадані люди та зміни, які власник може додати і видалити одним натисканням. Вони не містять даних реальних людей.',
            ],
        },
        {
            h: 'Cookies і сховище на пристрої',
            p: 'Ми не використовуємо рекламних чи аналітичних cookies і жодних інструментів стеження. Застосунок зберігає у сховищі браузера (localStorage, у мобільному застосунку — у сховищі застосунку) лише те, що потрібно для роботи: вхід, мову, тему і формат часу, типову та нещодавні філії, стан бічної панелі та прихованих підказок, push-токен (щоб видалити його під час виходу) і налаштування біометричного блокування. Ці дані залишаються на вашому пристрої і не потребують згоди. Вихід видаляє дані входу, решту — очищення даних сайту в браузері.',
        },
        {
            h: 'Як довго ми зберігаємо дані',
            p: 'Автоматичного видалення після певного строку поки немає. Діє таке:',
            items: [
                'Робочі дані зберігаються, доки організація їх не видалить або не вилучить учасника. Строк зберігання визначає організація як контролер.',
                'Коли учасника вилучають або він видаляє свій обліковий запис (Налаштування → Видалити обліковий запис), ми видаляємо профіль, облік часу, графік, відгули, запити, дані про оплату, документи разом із файлами, нотатки, відгуки, токени та підключення Telegram і календаря. Перед цим організації варто завантажити табелі, які вона мусить зберігати за законом.',
                'У журналі дій організації залишаються записи про вас разом з вашим ім’ям (напр. «X залишив команду»), а написані вами оголошення залишаються без автора. Вони зникають разом з організацією.',
                'Організацію ми видаляємо на прохання її власника, коли з неї вийдуть усі учасники. Разом з нею видаляється все, що їй належить.',
                'Листи підтримки зберігаємо стільки, скільки потрібно для вирішення питання та захисту наших прав.',
                'Платіжні документи (після запуску платних тарифів) зберігаємо стільки, скільки вимагає бухгалтерське і податкове законодавство, щонайбільше 10 років.',
                'Коди для Telegram діють 10 хвилин. Лічильники невдалих входів видаляються через добу, запис про надісланий ранковий огляд — через 7 днів.',
                'Резервні копії бази даних Supabase створює автоматично і зберігає обмежений час. Видалені дані зникають з них під час оновлення копій.',
            ],
        },
        {
            h: 'Безпека',
            p: 'З’єднання зашифровані (HTTPS з HSTS), а збережені дані шифрує постачальник бази даних. Кожна організація бачить лише свої дані, а доступ усередині неї визначають ролі. Це забезпечує сама база даних (Row Level Security), а не лише застосунок. Паролі (щонайменше 8 символів) та коди для Telegram зберігаються лише як хеші, документи — у закритому сховищі з короткочасними посиланнями. Після кількох невдалих спроб входу вхід блокується на 15 хвилин. Час приходу та відходу визначає сервер. Push-сповіщення може ініціювати лише наша власна база даних, а не хтось ззовні. Сайт має сувору політику безпеки вмісту (CSP), зміни в організації записуються в журнал дій, а адміністратори можуть увімкнути біометричне блокування в мобільному застосунку.',
            note: 'У разі порушення безпеки даних ми без зайвої затримки повідомимо організацію, а в строк, визначений законом, — також чеський орган захисту даних (ÚOOÚ) і осіб, яких це стосується.',
        },
        {
            h: 'Ваші права',
            p: 'Згідно з GDPR ви маєте право:',
            items: [
                'на доступ і перенесення: у Налаштуваннях можна завантажити свої дані у форматі JSON (профіль, облік часу, графік, відгули, сповіщення та відгуки). Інші дані ви бачите в застосунку, або ми надішлемо їх на запит;',
                'на виправлення: ім’я користувача змінюється в профілі, зміну імені можна запросити в застосунку, решту виправить ваша організація або ми;',
                'на видалення: обліковий запис можна видалити самостійно в Налаштуваннях. Останній адміністратор організації, де є інші учасники, має спершу передати адміністрування;',
                'на обмеження обробки та заперечення проти обробки на підставі законного інтересу;',
                'будь-коли вимкнути додаткову функцію або відкликати згоду без впливу на попередню обробку;',
                'подати скаргу до Úřad pro ochranu osobních údajů (Pplk. Sochora 27, 170 00 Praha 7, www.uoou.cz) або до наглядового органу країни ЄС, де ви живете чи працюєте.',
            ],
            note: `Запити надсилайте на ${PRIVACY_EMAIL}. Ми відповімо протягом місяця. Запити щодо робочих даних ми виконуємо разом з вашою організацією.`,
        },
        {
            h: 'Діти',
            p: 'Shiftella не призначена для осіб, молодших 15 років. Якщо ми дізнаємося про такий обліковий запис, ми його видалимо.',
        },
        {
            h: 'Зміни політики',
            p: 'Ми оновлюємо цю політику, коли змінюється сервіс або законодавство. Дата набрання чинності вказана вгорі. Про суттєві зміни ми повідомимо заздалегідь у застосунку або електронною поштою.',
        },
    ],
};

type LegalDocs = Record<BaseLang, LegalContent> & Partial<Record<LegalLang, LegalContent>>;

export const LEGAL: Record<LegalDoc, LegalDocs> = {
    privacy: { cs: PRIVACY_CS, en: PRIVACY_EN, sk: PRIVACY_SK, uk: PRIVACY_UK },
    terms: {
        en: {
            title: 'Terms of Service',
            updated: TERMS_UPDATED_EN,
            intro: 'These Terms govern your use of Shiftella. By using the app you agree to them.',
            sections: [
                { h: 'The service', p: `Shiftella (${SERVICE_URL}) is a workforce shift-management tool for tracking shifts, locations and timesheets, provided on an "as is" basis.` },
                { h: 'Accounts', p: 'You are responsible for keeping your login credentials secure and for the accuracy of the information you provide. Do not share your account.' },
                { h: 'Acceptable use', p: 'Do not misuse the service, attempt unauthorized access, disrupt its operation, or use it to break any applicable law or your employer’s policies.' },
                { h: 'Your data responsibilities', p: 'If you create an organization and invite members, you act as the data controller for their personal data (names, shifts, locations). You are responsible for having a lawful basis to process it, for informing your team how it is used, and for handling their data-subject requests. You must not use the app to process personal data unlawfully.' },
                { h: 'Timesheet accuracy', p: 'Records reflect the clock-in/out data entered in the app. For payroll or legal purposes, verify records with your employer; we are not a party to your employment.' },
                { h: 'Availability', p: 'We aim for reliable service but do not guarantee uninterrupted or error-free availability, and may change or suspend features.' },
                { h: 'Liability', p: 'To the maximum extent permitted by law, the app is provided without warranties and we are not liable for indirect or consequential damages arising from its use.' },
                { h: 'Changes', p: 'We may update the app and these Terms. Continued use after changes means you accept the updated Terms.' },
                { h: 'Governing law', p: 'These Terms are governed by the laws of the Czech Republic.' },
                { h: 'Contact', p: `Questions about these Terms? Email ${SUPPORT_EMAIL}.` },
            ],
        },
        cs: {
            title: 'Podmínky použití',
            updated: TERMS_UPDATED_CS,
            intro: 'Tyto podmínky upravují používání aplikace Shiftella. Používáním aplikace s nimi souhlasíte.',
            sections: [
                { h: 'Služba', p: `Shiftella (${SERVICE_URL}) je nástroj pro správu směn — evidenci směn, míst a výkazů — poskytovaný „tak, jak je“.` },
                { h: 'Účty', p: 'Odpovídáte za bezpečnost svých přihlašovacích údajů a za správnost zadaných informací. Účet nesdílejte.' },
                { h: 'Přijatelné použití', p: 'Nezneužívejte službu, nepokoušejte se o neoprávněný přístup, nenarušujte její provoz a nepoužívejte ji v rozporu se zákony či pravidly zaměstnavatele.' },
                { h: 'Vaše odpovědnost za údaje', p: 'Pokud vytvoříte organizaci a pozvete členy, vystupujete jako správce jejich osobních údajů (jména, směny, místa). Odpovídáte za právní základ jejich zpracování, za informování svého týmu o způsobu použití a za vyřízení žádostí subjektů údajů. Aplikaci nesmíte používat ke zpracování osobních údajů v rozporu se zákonem.' },
                { h: 'Přesnost výkazů', p: 'Záznamy odrážejí data o začátku/konci směny zadaná v aplikaci. Pro mzdové či právní účely si je ověřte u zaměstnavatele; nejsme stranou vašeho pracovního poměru.' },
                { h: 'Dostupnost', p: 'Usilujeme o spolehlivý provoz, ale nezaručujeme nepřerušovanou či bezchybnou dostupnost a můžeme funkce měnit či pozastavit.' },
                { h: 'Odpovědnost', p: 'V maximálním rozsahu povoleném zákonem je aplikace poskytována bez záruk a neneseme odpovědnost za nepřímé či následné škody vzniklé jejím používáním.' },
                { h: 'Změny', p: 'Aplikaci i tyto podmínky můžeme aktualizovat. Pokračujícím používáním po změnách vyjadřujete souhlas s aktualizovaným zněním.' },
                { h: 'Rozhodné právo', p: 'Tyto podmínky se řídí právem České republiky.' },
                { h: 'Kontakt', p: `Dotazy k podmínkám? Napište na ${SUPPORT_EMAIL}.` },
            ],
        },
    },
};

/** The document in `language`, or in its base language when it has no translation. */
export function legalContent(doc: LegalDoc, language: Language): LegalContent {
    return LEGAL[doc][language] ?? LEGAL[doc][BASE_LANGUAGE[language]];
}
