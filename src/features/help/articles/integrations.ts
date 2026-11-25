import type { HelpArticle } from '../types';

export const integrationArticles: HelpArticle[] = [
    {
        id: 'telegram',
        topic: 'integrations',
        route: '/settings',
        routeLabel: 'nav.settings',
        content: {
            en: {
                title: 'Notifications and commands in Telegram',
                summary: 'Link the Shiftella bot to get notifications and quick answers in Telegram.',
                steps: [
                    'Open {{nav.settings}} → {{settings.telegram.title}} and tap {{settings.telegram.connect}}.',
                    'Telegram opens the bot — tap Start there. Back in the app it shows as {{settings.telegram.linked}}.',
                    'In the chat: /shifts (next 7 days), /today (today’s shift and who else is on), /hours (this month), /news (announcements), /requests (waiting for your decision), /language.',
                    'Under {{settings.telegram.messages}} choose what the bot sends. {{settings.telegram.disconnect}} — or /stop in the chat — unlinks it.',
                ],
                keywords: 'telegram bot chat messenger notifications commands shifts today hours news link connect',
            },
            cs: {
                title: 'Upozornění a příkazy v Telegramu',
                summary: 'Propojte bota Shiftelly a dostávejte upozornění i rychlé odpovědi v Telegramu.',
                steps: [
                    'Otevřete {{nav.settings}} → {{settings.telegram.title}} a klepněte na {{settings.telegram.connect}}.',
                    'Telegram otevře bota — klepněte tam na Start. V aplikaci se pak ukáže {{settings.telegram.linked}}.',
                    'V chatu: /shifts (příštích 7 dní), /today (dnešní směna a kdo je s vámi), /hours (tento měsíc), /news (oznámení), /requests (čeká na vaše rozhodnutí), /language.',
                    'V části {{settings.telegram.messages}} zvolíte, co bot posílá. {{settings.telegram.disconnect}} — nebo /stop v chatu — propojení zruší.',
                ],
                keywords: 'telegram bot chat upozorneni prikazy smeny dnes hodiny oznameni propojit pripojit',
            },
            sk: {
                title: 'Upozornenia a príkazy v Telegrame',
                summary: 'Prepojte bota Shiftelly a dostávajte upozornenia aj rýchle odpovede v Telegrame.',
                steps: [
                    'Otvorte {{nav.settings}} → {{settings.telegram.title}} a ťuknite na {{settings.telegram.connect}}.',
                    'Telegram otvorí bota — ťuknite tam na Start. V aplikácii sa potom ukáže {{settings.telegram.linked}}.',
                    'V chate: /shifts (najbližších 7 dní), /today (dnešná zmena a kto je s vami), /hours (tento mesiac), /news (oznamy), /requests (čaká na vaše rozhodnutie), /language.',
                    'V časti {{settings.telegram.messages}} zvolíte, čo bot posiela. {{settings.telegram.disconnect}} — alebo /stop v chate — prepojenie zruší.',
                ],
                keywords: 'telegram bot chat upozornenia prikazy zmeny dnes hodiny oznamy prepojit pripojit',
            },
            uk: {
                title: 'Сповіщення та команди в Telegram',
                summary: 'Під’єднайте бота Shiftella, щоб отримувати сповіщення й швидкі відповіді в Telegram.',
                steps: [
                    'Відкрийте {{nav.settings}} → {{settings.telegram.title}} і натисніть {{settings.telegram.connect}}.',
                    'Telegram відкриє бота — натисніть там Start. У застосунку з’явиться позначка {{settings.telegram.linked}}.',
                    'У чаті: /shifts (найближчі 7 днів), /today (сьогоднішня зміна і хто ще працює), /hours (цей місяць), /news (оголошення), /requests (чекають вашого рішення), /language.',
                    'У блоці {{settings.telegram.messages}} виберіть, що надсилає бот. {{settings.telegram.disconnect}} — або /stop у чаті — від’єднує його.',
                ],
                keywords: 'telegram телеграм бот чат сповіщення команди зміни сьогодні години оголошення під’єднати',
            },
        },
    },
    {
        id: 'calendar-feed',
        topic: 'integrations',
        route: '/settings',
        routeLabel: 'nav.settings',
        content: {
            en: {
                title: 'Shifts in your calendar',
                summary: 'Your published shifts in Google, Apple or Outlook calendar — updated on their own.',
                steps: [
                    'Open {{nav.settings}} → {{cal.title}} and tap {{cal.add}}.',
                    'Google: tap {{cal.google}} — or copy the link ({{cal.copy}}) and add it in Google Calendar under Other calendars → + → From URL.',
                    'Apple / Outlook: tap the {{cal.apple}} button, or subscribe to the copied link.',
                    'Calendars refresh every few hours, so a change can take a while to show.',
                ],
                tip: 'Keep the link to yourself. If it leaked, tap {{cal.reset}} — the old one stops working.',
                keywords: 'calendar ics ical feed google calendar apple outlook subscribe sync phone calendar link',
            },
            cs: {
                title: 'Směny ve vašem kalendáři',
                summary: 'Zveřejněné směny v kalendáři Google, Apple nebo Outlook — aktualizují se samy.',
                steps: [
                    'Otevřete {{nav.settings}} → {{cal.title}} a klepněte na {{cal.add}}.',
                    'Google: klepněte na {{cal.google}} — nebo zkopírujte odkaz ({{cal.copy}}) a v Kalendáři Google ho přidejte přes Další kalendáře → + → Z adresy URL.',
                    'Apple / Outlook: klepněte na tlačítko {{cal.apple}}, nebo se přihlaste k odběru zkopírovaného odkazu.',
                    'Kalendáře se obnovují jednou za pár hodin, změna se proto může projevit se zpožděním.',
                ],
                tip: 'Odkaz si nechte pro sebe. Pokud unikl, klepněte na {{cal.reset}} — starý přestane fungovat.',
                keywords: 'kalendar ics ical google kalendar apple outlook odber synchronizace telefon odkaz',
            },
            sk: {
                title: 'Zmeny vo vašom kalendári',
                summary: 'Zverejnené zmeny v kalendári Google, Apple alebo Outlook — aktualizujú sa samy.',
                steps: [
                    'Otvorte {{nav.settings}} → {{cal.title}} a ťuknite na {{cal.add}}.',
                    'Google: ťuknite na {{cal.google}} — alebo skopírujte odkaz ({{cal.copy}}) a v Kalendári Google ho pridajte cez Ďalšie kalendáre → + → Z webovej adresy.',
                    'Apple / Outlook: ťuknite na tlačidlo {{cal.apple}}, alebo sa prihláste na odber skopírovaného odkazu.',
                    'Kalendáre sa obnovujú raz za pár hodín, zmena sa preto môže prejaviť s oneskorením.',
                ],
                tip: 'Odkaz si nechajte pre seba. Ak unikol, ťuknite na {{cal.reset}} — starý prestane fungovať.',
                keywords: 'kalendar ics ical google kalendar apple outlook odber synchronizacia telefon odkaz',
            },
            uk: {
                title: 'Зміни у вашому календарі',
                summary: 'Опубліковані зміни в календарі Google, Apple чи Outlook — оновлюються самі.',
                steps: [
                    'Відкрийте {{nav.settings}} → {{cal.title}} і натисніть {{cal.add}}.',
                    'Google: натисніть {{cal.google}} — або скопіюйте посилання ({{cal.copy}}) і додайте його в Google Календарі через Інші календарі → + → З URL-адреси.',
                    'Apple / Outlook: натисніть кнопку {{cal.apple}} або підпишіться на скопійоване посилання.',
                    'Календарі оновлюються раз на кілька годин, тож зміна може з’явитися із запізненням.',
                ],
                tip: 'Нікому не передавайте посилання. Якщо воно потрапило до інших, натисніть {{cal.reset}} — старе перестане працювати.',
                keywords: 'календар ics ical google календар apple outlook підписка синхронізація телефон посилання',
            },
        },
    },
];
