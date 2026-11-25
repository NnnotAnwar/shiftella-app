import type { HelpArticle } from '../types';

export const timesheetArticles: HelpArticle[] = [
    {
        id: 'timesheets',
        topic: 'timesheets',
        audience: 'timesheets.view',
        route: '/timesheets',
        routeLabel: 'nav.timesheets',
        content: {
            en: {
                title: 'Check and correct timesheets',
                summary: 'Everyone’s worked shifts per month, with fixes logged.',
                steps: [
                    'Open {{nav.timesheets}}, pick the month and tap a person.',
                    'You see each shift with gross time, break and net time, and the month’s totals.',
                    'Someone forgot to clock out, or came late? With edit rights, use the pencil on a row or {{ts.addShift}} for a missing shift.',
                    'Every change is recorded in the {{nav.activity}}.',
                    'The download icon exports this person’s timesheet — or, from the list, {{ts.exportAll}} — as PDF, Excel or CSV.',
                ],
                tip: 'You can only edit people below your own role.',
                keywords: 'timesheet timesheets attendance worked hours correct fix edit missing clock out add shift export pdf excel csv',
            },
            cs: {
                title: 'Kontrola a oprava výkazů',
                summary: 'Odpracované směny všech po měsících, opravy se zaznamenávají.',
                steps: [
                    'Otevřete {{nav.timesheets}}, vyberte měsíc a klepněte na člověka.',
                    'Uvidíte každou směnu s hrubým časem, přestávkou a čistým časem a součty za měsíc.',
                    'Někdo zapomněl zaznamenat odchod nebo přišel pozdě? S právem úprav použijte tužku u řádku, chybějící směnu přidáte tlačítkem {{ts.addShift}}.',
                    'Každá změna se zapíše do sekce {{nav.activity}}.',
                    'Ikona stažení vyexportuje výkaz tohoto člověka — nebo ze seznamu {{ts.exportAll}} — do PDF, Excelu nebo CSV.',
                ],
                tip: 'Upravovat můžete jen lidi pod svou rolí.',
                keywords: 'vykaz vykazy dochazka odpracovane hodiny opravit upravit chybejici odchod pridat smenu export pdf excel csv',
            },
            sk: {
                title: 'Kontrola a oprava výkazov',
                summary: 'Odpracované zmeny všetkých po mesiacoch, opravy sa zaznamenávajú.',
                steps: [
                    'Otvorte {{nav.timesheets}}, vyberte mesiac a ťuknite na človeka.',
                    'Uvidíte každú zmenu s hrubým časom, prestávkou a čistým časom a súčty za mesiac.',
                    'Niekto zabudol zaznamenať odchod alebo prišiel neskoro? S právom úprav použite ceruzku pri riadku, chýbajúcu zmenu pridáte tlačidlom {{ts.addShift}}.',
                    'Každá zmena sa zapíše do sekcie {{nav.activity}}.',
                    'Ikona stiahnutia vyexportuje výkaz tohto človeka — alebo zo zoznamu {{ts.exportAll}} — do PDF, Excelu alebo CSV.',
                ],
                tip: 'Upravovať môžete len ľudí pod svojou rolou.',
                keywords: 'vykaz vykazy dochadzka odpracovane hodiny opravit upravit chybajuci odchod pridat zmenu export pdf excel csv',
            },
            uk: {
                title: 'Перевірка та виправлення табелів',
                summary: 'Відпрацьовані зміни всіх за місяцями, виправлення фіксуються.',
                steps: [
                    'Відкрийте {{nav.timesheets}}, виберіть місяць і натисніть людину.',
                    'Ви побачите кожну зміну із загальним часом, перервою та чистим часом і підсумки за місяць.',
                    'Хтось забув відмітити відхід чи прийшов пізно? З правом редагування скористайтеся олівцем у рядку, а пропущену зміну додайте кнопкою {{ts.addShift}}.',
                    'Кожна зміна записується в розділ {{nav.activity}}.',
                    'Значок завантаження експортує табель цієї людини — або зі списку {{ts.exportAll}} — у PDF, Excel чи CSV.',
                ],
                tip: 'Редагувати можна лише людей нижче за вашою роллю.',
                keywords: 'табель табелі облік часу відпрацьовані години виправити редагувати пропущений відхід додати зміну експорт pdf excel csv',
            },
        },
    },
    {
        id: 'payroll-export',
        topic: 'timesheets',
        audience: 'timesheets.view',
        route: '/timesheets',
        routeLabel: 'nav.timesheets',
        content: {
            en: {
                title: 'Payroll data for the accountant',
                summary: 'One file per month with hours, surcharges and absences per person.',
                steps: [
                    'Open {{nav.timesheets}}, pick a month, then tap the calculator icon ({{payroll.button}}).',
                    'Choose {{payroll.excel}}, {{payroll.csv}} or {{payroll.money}}.',
                    'Hours are net of breaks; public holiday, Sat/Sun and night (22:00–06:00) hours are listed as “of which” parts. Only approved absences are included.',
                    'For Money S3, fill in {{payroll.personalNumbers}} (osobní číslo) — people without one are left out of that file.',
                ],
                tip: 'POHODA has no attendance import: the accountant types the Excel totals into Mzdy.',
                keywords: 'payroll accountant wages salary export excel csv money s3 pohoda month surcharges night weekend holiday personal number',
            },
            cs: {
                title: 'Podklady pro mzdy pro účetní',
                summary: 'Jeden soubor za měsíc s hodinami, příplatky a nepřítomnostmi každého.',
                steps: [
                    'Otevřete {{nav.timesheets}}, vyberte měsíc a klepněte na ikonu kalkulačky ({{payroll.button}}).',
                    'Zvolte {{payroll.excel}}, {{payroll.csv}} nebo {{payroll.money}}.',
                    'Hodiny jsou po odečtení přestávek; hodiny ve svátek, o víkendu a v noci (22:00–06:00) jsou uvedené jako „z toho“. Započítají se jen schválené nepřítomnosti.',
                    'Pro Money S3 vyplňte {{payroll.personalNumbers}} — lidé bez osobního čísla v tom souboru chybí.',
                ],
                tip: 'POHODA nemá import docházky: účetní přepíše součty z Excelu do Mezd.',
                keywords: 'mzdy podklady ucetni vyplata export excel csv money s3 pohoda mesic priplatky noc vikend svatek osobni cislo',
            },
            sk: {
                title: 'Podklady pre mzdy pre účtovníka',
                summary: 'Jeden súbor za mesiac s hodinami, príplatkami a neprítomnosťami každého.',
                steps: [
                    'Otvorte {{nav.timesheets}}, vyberte mesiac a ťuknite na ikonu kalkulačky ({{payroll.button}}).',
                    'Zvoľte {{payroll.excel}}, {{payroll.csv}} alebo {{payroll.money}}.',
                    'Hodiny sú po odpočítaní prestávok; hodiny vo sviatok, cez víkend a v noci (22:00–06:00) sú uvedené ako „z toho“. Započítajú sa len schválené neprítomnosti.',
                    'Pre Money S3 vyplňte {{payroll.personalNumbers}} (osobné číslo) — ľudia bez neho v tom súbore chýbajú.',
                ],
                tip: 'POHODA nemá import dochádzky: účtovník prepíše súčty z Excelu do Miezd.',
                keywords: 'mzdy podklady uctovnik vyplata export excel csv money s3 pohoda mesiac priplatky noc vikend sviatok osobne cislo',
            },
            uk: {
                title: 'Дані для зарплати бухгалтеру',
                summary: 'Один файл на місяць із годинами, доплатами та відсутностями кожного.',
                steps: [
                    'Відкрийте {{nav.timesheets}}, виберіть місяць і натисніть значок калькулятора ({{payroll.button}}).',
                    'Виберіть {{payroll.excel}}, {{payroll.csv}} або {{payroll.money}}.',
                    'Години подано без перерв; години у свята, вихідні та вночі (22:00–06:00) вказано як «з них». Враховуються лише погоджені відсутності.',
                    'Для Money S3 заповніть {{payroll.personalNumbers}} (osobní číslo) — людей без нього в цьому файлі не буде.',
                ],
                tip: 'POHODA не має імпорту обліку часу: бухгалтер переносить підсумки з Excel у модуль Mzdy.',
                keywords: 'зарплата бухгалтер дані експорт excel csv money s3 pohoda місяць доплати ніч вихідні свято табельний номер',
            },
        },
    },
    {
        id: 'analytics-activity',
        topic: 'timesheets',
        audience: 'analytics.view',
        route: '/analytics',
        routeLabel: 'nav.analytics',
        content: {
            en: {
                title: 'Analytics and the Activity Log',
                summary: 'The numbers behind your team, and who changed what.',
                steps: [
                    '{{nav.analytics}} shows hours, labour cost, absences and punctuality for a period you choose.',
                    'Worked hours are set against what the published rota planned ({{analytics.hoursChart}}).',
                    '{{nav.activity}} lists every change in the organization: shifts, timesheet fixes, requests, roles and more, with who made it and when.',
                ],
                keywords: 'analytics report statistics dashboard owner labour cost punctuality late absences activity log audit trail history changes who changed',
            },
            cs: {
                title: 'Analytika a protokol aktivit',
                summary: 'Čísla za vaším týmem a kdo co změnil.',
                steps: [
                    '{{nav.analytics}} ukazuje hodiny, mzdové náklady, nepřítomnosti a dochvilnost za zvolené období.',
                    'Odpracované hodiny se porovnávají s tím, co plánoval zveřejněný rozpis ({{analytics.hoursChart}}).',
                    '{{nav.activity}} vypisuje každou změnu v organizaci: směny, opravy výkazů, žádosti, role a další, s tím, kdo a kdy ji udělal.',
                ],
                keywords: 'analytika prehled statistiky reporty naklady mzdy dochvilnost pozdni prichody nepritomnosti protokol aktivit audit historie zmeny kdo zmenil',
            },
            sk: {
                title: 'Analytika a protokol aktivít',
                summary: 'Čísla za vaším tímom a kto čo zmenil.',
                steps: [
                    '{{nav.analytics}} ukazuje hodiny, mzdové náklady, neprítomnosti a dochvíľnosť za zvolené obdobie.',
                    'Odpracované hodiny sa porovnávajú s tým, čo plánoval zverejnený rozpis ({{analytics.hoursChart}}).',
                    '{{nav.activity}} vypisuje každú zmenu v organizácii: zmeny, opravy výkazov, žiadosti, roly a ďalšie, s tým, kto a kedy ju urobil.',
                ],
                keywords: 'analytika prehlad statistiky reporty naklady mzdy dochvilnost neskore prichody nepritomnosti protokol aktivit audit historia kto zmenil',
            },
            uk: {
                title: 'Аналітика та журнал дій',
                summary: 'Цифри вашої команди і хто що змінив.',
                steps: [
                    '{{nav.analytics}} показує години, витрати на оплату праці, відсутності та пунктуальність за вибраний період.',
                    'Відпрацьовані години порівнюються з тим, що планував опублікований графік ({{analytics.hoursChart}}).',
                    '{{nav.activity}} показує кожну зміну в організації: зміни, виправлення табелів, запити, ролі тощо — хто і коли її зробив.',
                ],
                keywords: 'аналітика звіт статистика витрати оплата праці пунктуальність запізнення відсутності журнал дій аудит історія хто змінив',
            },
        },
    },
];
