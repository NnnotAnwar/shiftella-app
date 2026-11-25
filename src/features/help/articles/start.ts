import type { HelpArticle } from '../types';

export const startArticles: HelpArticle[] = [
    {
        id: 'first-steps',
        topic: 'start',
        route: '/',
        routeLabel: 'nav.dashboard',
        content: {
            en: {
                title: 'Your first day in Shiftella',
                summary: 'Join your team from the invitation email and find your way around.',
                steps: [
                    'Open the invitation email and tap its link. Pick a username and a password to join your organization.',
                    'From then on you sign in with your email or your username.',
                    'Your shifts are in {{nav.schedule}} → {{schedule.tabMine}}. They appear once a manager publishes the rota.',
                    'On a computer the menu is on the left; on a phone use the bar at the bottom and {{nav.more}}. On a computer, {{cmd.search}} (⌘K / Ctrl+K) jumps to any page.',
                    'Language, theme and time format are in {{nav.settings}}.',
                ],
                keywords: 'invite invitation join sign in login username password start begin menu',
            },
            cs: {
                title: 'První den v aplikaci',
                summary: 'Připojte se k týmu z pozvánky v e-mailu a zorientujte se.',
                steps: [
                    'Otevřete e-mail s pozvánkou a klepněte na odkaz. Zvolte si uživatelské jméno a heslo — tím se připojíte ke své organizaci.',
                    'Potom se přihlašujete e-mailem nebo uživatelským jménem.',
                    'Své směny najdete v sekci {{nav.schedule}} → {{schedule.tabMine}}. Objeví se, jakmile vedoucí rozpis zveřejní.',
                    'Na počítači je menu vlevo, na telefonu lišta dole a {{nav.more}}. Na počítači otevře pole {{cmd.search}} (⌘K / Ctrl+K) libovolnou stránku.',
                    'Jazyk, motiv a formát času změníte v sekci {{nav.settings}}.',
                ],
                keywords: 'pozvanka pozvani pripojit prihlaseni prihlasit uzivatelske jmeno heslo zacatek menu',
            },
            sk: {
                title: 'Prvý deň v aplikácii',
                summary: 'Pripojte sa k tímu z pozvánky v e-maile a zorientujte sa.',
                steps: [
                    'Otvorte e-mail s pozvánkou a ťuknite na odkaz. Zvoľte si používateľské meno a heslo — tým sa pripojíte k svojej organizácii.',
                    'Potom sa prihlasujete e-mailom alebo používateľským menom.',
                    'Svoje zmeny nájdete v sekcii {{nav.schedule}} → {{schedule.tabMine}}. Zobrazia sa, keď vedúci rozpis zverejní.',
                    'Na počítači je menu vľavo, na telefóne lišta dole a {{nav.more}}. Na počítači otvorí pole {{cmd.search}} (⌘K / Ctrl+K) ľubovoľnú stránku.',
                    'Jazyk, motív a formát času zmeníte v sekcii {{nav.settings}}.',
                ],
                keywords: 'pozvanka pripojit prihlasenie prihlasit pouzivatelske meno heslo zaciatok menu',
            },
            uk: {
                title: 'Перший день у застосунку',
                summary: 'Приєднайтеся до команди із запрошення в e-mail і зорієнтуйтеся.',
                steps: [
                    'Відкрийте лист із запрошенням і натисніть посилання. Виберіть ім’я користувача та пароль — так ви приєднаєтеся до своєї організації.',
                    'Надалі ви входите за e-mail або ім’ям користувача.',
                    'Свої зміни ви знайдете в розділі {{nav.schedule}} → {{schedule.tabMine}}. Вони з’являться, щойно керівник опублікує графік.',
                    'На комп’ютері меню ліворуч, на телефоні — панель унизу та {{nav.more}}. На комп’ютері поле {{cmd.search}} (⌘K / Ctrl+K) відкриває будь-яку сторінку.',
                    'Мову, тему та формат часу можна змінити в розділі {{nav.settings}}.',
                ],
                keywords: 'запрошення приєднатися вхід увійти логін ім’я користувача пароль початок меню',
            },
        },
    },
    {
        id: 'owner-setup',
        topic: 'start',
        audience: 'owner',
        route: '/',
        routeLabel: 'nav.dashboard',
        content: {
            en: {
                title: 'Set up your organization',
                summary: 'Four steps on the Dashboard get a new team going.',
                steps: [
                    'After sign-up the Dashboard shows {{start.title}}. Each of the four steps ticks itself off.',
                    'Add your first location: {{nav.team}} → {{admin.tabLocations}} → {{admin.addLocation}}.',
                    'Invite your people one by one or import a list (see “Invite people”).',
                    'Plan the first week in {{nav.schedule}} and publish it — only then does your team see the shifts and get notified.',
                    'Just looking around first? {{demo.try}} adds a sample café with 8 people and a month of shifts; {{demo.clear}} removes it in one tap.',
                ],
                tip: 'The demo people are made up and nobody gets notified.',
                keywords: 'onboarding setup checklist new organization owner demo sample data getting started',
            },
            cs: {
                title: 'Nastavení organizace',
                summary: 'Čtyři kroky na Nástěnce rozjedou nový tým.',
                steps: [
                    'Po registraci uvidíte na Nástěnce kartu {{start.title}}. Každý ze čtyř kroků se odškrtne sám.',
                    'Přidejte první místo: {{nav.team}} → {{admin.tabLocations}} → {{admin.addLocation}}.',
                    'Pozvěte lidi jednotlivě, nebo naimportujte seznam (viz „Pozvání lidí“).',
                    'Naplánujte první týden v sekci {{nav.schedule}} a zveřejněte ho — teprve pak tým směny uvidí a dostane upozornění.',
                    'Chcete se nejdřív jen porozhlédnout? Tlačítko {{demo.try}} přidá ukázkovou kavárnu s 8 lidmi a měsícem směn; {{demo.clear}} ji jedním klepnutím odstraní.',
                ],
                tip: 'Ukázkoví lidé jsou smyšlení a nikomu nic nepřijde.',
                keywords: 'zacatek nastaveni nova organizace majitel vlastnik ukazkova data demo kontrolni seznam',
            },
            sk: {
                title: 'Nastavenie organizácie',
                summary: 'Štyri kroky na Nástenke rozbehnú nový tím.',
                steps: [
                    'Po registrácii uvidíte na Nástenke kartu {{start.title}}. Každý zo štyroch krokov sa odškrtne sám.',
                    'Pridajte prvé miesto: {{nav.team}} → {{admin.tabLocations}} → {{admin.addLocation}}.',
                    'Pozvite ľudí jednotlivo alebo naimportujte zoznam (pozri „Pozvanie ľudí“).',
                    'Naplánujte prvý týždeň v sekcii {{nav.schedule}} a zverejnite ho — až potom tím zmeny uvidí a dostane upozornenie.',
                    'Chcete sa najprv len poobzerať? Tlačidlo {{demo.try}} pridá ukážkovú kaviareň s 8 ľuďmi a mesiacom zmien; {{demo.clear}} ju jedným ťuknutím odstráni.',
                ],
                tip: 'Ukážkoví ľudia sú vymyslení a nikomu nič nepríde.',
                keywords: 'zaciatok nastavenie nova organizacia majitel vlastnik ukazkove data demo kontrolny zoznam',
            },
            uk: {
                title: 'Налаштування організації',
                summary: 'Чотири кроки на Панелі запускають нову команду.',
                steps: [
                    'Після реєстрації на Панелі з’явиться картка {{start.title}}. Кожен із чотирьох кроків позначається сам.',
                    'Додайте першу локацію: {{nav.team}} → {{admin.tabLocations}} → {{admin.addLocation}}.',
                    'Запросіть людей по одному або імпортуйте список (див. «Запрошення людей»).',
                    'Сплануйте перший тиждень у розділі {{nav.schedule}} та опублікуйте його — лише тоді команда побачить зміни й отримає сповіщення.',
                    'Хочете спершу просто роздивитися? Кнопка {{demo.try}} додає зразкову кав’ярню з 8 людьми та місяцем змін; {{demo.clear}} прибирає її одним натиском.',
                ],
                tip: 'Зразкові люди вигадані, і ніхто не отримує сповіщень.',
                keywords: 'початок налаштування нова організація власник демо зразкові дані чекліст',
            },
        },
    },
];
