import type { HelpArticle } from '../types';

export const attendanceArticles: HelpArticle[] = [
    {
        id: 'clock-in',
        topic: 'attendance',
        route: '/',
        routeLabel: 'nav.dashboard',
        content: {
            en: {
                title: 'Clock in and out',
                summary: 'Start your shift where you work, move it, end it.',
                steps: [
                    'On the Dashboard, choose where you are: tap the clock on a computer, or the {{sidebar.currentLocation}} field on a phone.',
                    'Tap {{shifts.start}}. The board shows who is on shift at each location right now.',
                    'Changed place mid-shift? Tap the location and pick the new one ({{location.moveTo}}) — the shift continues there.',
                    'To finish, click {{shifts.end}} on a computer, or swipe the button on a phone ({{shifts.swipeToEnd}}).',
                ],
                tip: 'Set {{settings.defaultLocation}} in {{nav.settings}} so the right place is already picked.',
                keywords: 'clock in clock out check in start end finish shift attendance arrive leave location live board who is working',
            },
            cs: {
                title: 'Příchod a odchod',
                summary: 'Začněte směnu tam, kde pracujete, přesuňte ji, ukončete ji.',
                steps: [
                    'Na Nástěnce zvolte, kde jste: na počítači klepněte na hodiny, na telefonu na pole {{sidebar.currentLocation}}.',
                    'Klepněte na {{shifts.start}}. Přehled ukazuje, kdo je právě na směně na kterém místě.',
                    'Přešli jste během směny jinam? Klepněte na místo a vyberte nové ({{location.moveTo}}) — směna tam pokračuje.',
                    'Na konci na počítači klikněte na {{shifts.end}}, na telefonu tlačítko přejeďte prstem ({{shifts.swipeToEnd}}).',
                ],
                tip: 'V sekci {{nav.settings}} nastavte {{settings.defaultLocation}}, ať je správné místo rovnou vybrané.',
                keywords: 'prichod odchod pichnout dochazka zacit ukoncit smenu misto kdo je na smene prehled',
            },
            sk: {
                title: 'Príchod a odchod',
                summary: 'Začnite zmenu tam, kde pracujete, presuňte ju, ukončite ju.',
                steps: [
                    'Na Nástenke zvoľte, kde ste: na počítači ťuknite na hodiny, na telefóne na pole {{sidebar.currentLocation}}.',
                    'Ťuknite na {{shifts.start}}. Prehľad ukazuje, kto je práve na zmene na ktorom mieste.',
                    'Prešli ste počas zmeny inam? Ťuknite na miesto a vyberte nové ({{location.moveTo}}) — zmena tam pokračuje.',
                    'Na konci na počítači kliknite na {{shifts.end}}, na telefóne tlačidlo potiahnite prstom ({{shifts.swipeToEnd}}).',
                ],
                tip: 'V sekcii {{nav.settings}} nastavte {{settings.defaultLocation}}, nech je správne miesto hneď vybrané.',
                keywords: 'prichod odchod dochadzka zacat ukoncit zmenu miesto kto je na zmene prehlad',
            },
            uk: {
                title: 'Прихід і відхід',
                summary: 'Почніть зміну там, де працюєте, перенесіть її, завершіть.',
                steps: [
                    'На Панелі виберіть, де ви: на комп’ютері натисніть годинник, на телефоні — поле {{sidebar.currentLocation}}.',
                    'Натисніть {{shifts.start}}. Табло показує, хто зараз на зміні в кожній локації.',
                    'Перейшли під час зміни в іншу локацію? Натисніть локацію й виберіть нову ({{location.moveTo}}) — зміна триває там.',
                    'Щоб завершити, на комп’ютері натисніть {{shifts.end}}, на телефоні проведіть по кнопці ({{shifts.swipeToEnd}}).',
                ],
                tip: 'Задайте {{settings.defaultLocation}} у розділі {{nav.settings}}, щоб потрібна локація вже була вибрана.',
                keywords: 'прихід відхід відмітитися облік часу почати завершити зміну місце хто на зміні табло',
            },
        },
    },
    {
        id: 'my-hours',
        topic: 'attendance',
        route: '/overview',
        routeLabel: 'nav.myHours',
        content: {
            en: {
                title: 'Your hours and breaks',
                summary: 'How much you worked this month, and how breaks are deducted.',
                steps: [
                    'Open {{nav.myHours}} and pick a month (or {{month.allTime}}).',
                    'You see every worked shift with gross time, break and net time, plus how this month compares with your plan.',
                    'Net = gross − mandatory breaks: 30 min from 6 hours, 1 hour from 12 hours.',
                    'The download icon ({{overview.export}}) saves the month for your own records.',
                ],
                tip: 'A wrong clock-in or clock-out time can only be corrected by a manager in {{nav.timesheets}}.',
                keywords: 'my hours worked hours overview break breaks net gross month total pay timesheet history',
            },
            cs: {
                title: 'Vaše hodiny a přestávky',
                summary: 'Kolik jste tento měsíc odpracovali a jak se odečítají přestávky.',
                steps: [
                    'Otevřete {{nav.myHours}} a vyberte měsíc (nebo {{month.allTime}}).',
                    'Uvidíte každou odpracovanou směnu s hrubým časem, přestávkou a čistým časem a také srovnání s plánem na měsíc.',
                    'Čistý čas = hrubý čas − povinné přestávky: 30 min od 6 hodin, 1 hodina od 12 hodin.',
                    'Ikona stažení ({{overview.export}}) uloží měsíc pro vaši evidenci.',
                ],
                tip: 'Chybný čas příchodu nebo odchodu opraví jen vedoucí v sekci {{nav.timesheets}}.',
                keywords: 'moje hodiny odpracovano prestavka prestavky cisty hruby cas mesic celkem vykaz historie',
            },
            sk: {
                title: 'Vaše hodiny a prestávky',
                summary: 'Koľko ste tento mesiac odpracovali a ako sa odpočítavajú prestávky.',
                steps: [
                    'Otvorte {{nav.myHours}} a vyberte mesiac (alebo {{month.allTime}}).',
                    'Uvidíte každú odpracovanú zmenu s hrubým časom, prestávkou a čistým časom a aj porovnanie s plánom na mesiac.',
                    'Čistý čas = hrubý čas − povinné prestávky: 30 min od 6 hodín, 1 hodina od 12 hodín.',
                    'Ikona stiahnutia ({{overview.export}}) uloží mesiac pre vašu evidenciu.',
                ],
                tip: 'Chybný čas príchodu alebo odchodu opraví len vedúci v sekcii {{nav.timesheets}}.',
                keywords: 'moje hodiny odpracovane prestavka prestavky cisty hruby cas mesiac spolu vykaz historia',
            },
            uk: {
                title: 'Ваші години та перерви',
                summary: 'Скільки ви відпрацювали цього місяця і як віднімаються перерви.',
                steps: [
                    'Відкрийте {{nav.myHours}} та виберіть місяць (або {{month.allTime}}).',
                    'Ви побачите кожну відпрацьовану зміну із загальним часом, перервою та чистим часом, а також порівняння з планом на місяць.',
                    'Чистий час = загальний − обов’язкові перерви: 30 хв від 6 годин, 1 година від 12 годин.',
                    'Значок завантаження ({{overview.export}}) зберігає місяць для вашого обліку.',
                ],
                tip: 'Неправильний час приходу чи відходу може виправити лише керівник у розділі {{nav.timesheets}}.',
                keywords: 'мої години відпрацьовано перерва перерви чистий загальний час місяць разом табель історія',
            },
        },
    },
];
