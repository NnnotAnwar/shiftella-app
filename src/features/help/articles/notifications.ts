import type { HelpArticle } from '../types';

export const notificationArticles: HelpArticle[] = [
    {
        id: 'notifications',
        topic: 'notifications',
        route: '/settings',
        routeLabel: 'nav.settings',
        content: {
            en: {
                title: 'Notifications and reminders',
                summary: 'What you get notified about and how to tune it.',
                steps: [
                    'The bell at the top collects everything: rota changes, request decisions, swaps, announcements, expiring documents.',
                    'An hour before a published shift you get a reminder, unless you have already clocked in.',
                    'Not clocked in 15 minutes after a shift started? You and your manager are notified — and again after an hour. Admins get “{{notif.dailyDigest}}” at 7:00 when there is something to say.',
                    'Choose what reaches your phone in {{nav.settings}} → {{settings.notifications}}: {{settings.notif.push}}, {{settings.notif.shifts}}, {{settings.notif.account}} and, for reviewers, {{settings.notif.requests}}.',
                ],
                tip: 'The switches only affect push on your devices — the bell always shows everything.',
                keywords: 'notifications notification push bell reminder alert late digest morning summary mute turn off phone',
            },
            cs: {
                title: 'Upozornění a připomínky',
                summary: 'Na co vás aplikace upozorní a jak to nastavit.',
                steps: [
                    'Zvonek nahoře shromažďuje vše: změny rozpisu, rozhodnutí o žádostech, výměny, oznámení a končící dokumenty.',
                    'Hodinu před zveřejněnou směnou vám přijde připomínka, pokud ještě nemáte zaznamenaný příchod.',
                    'Nemáte 15 minut po začátku směny zaznamenaný příchod? Upozornění dostanete vy i vedoucí — a znovu po hodině. Admini dostávají v 7:00 „{{notif.dailyDigest}}“, když je co hlásit.',
                    'Co vám chodí do telefonu, zvolíte v sekci {{nav.settings}} → {{settings.notifications}}: {{settings.notif.push}}, {{settings.notif.shifts}}, {{settings.notif.account}} a pro schvalující {{settings.notif.requests}}.',
                ],
                tip: 'Přepínače se týkají jen push upozornění na vašich zařízeních — zvonek vždy ukáže vše.',
                keywords: 'upozorneni notifikace push zvonek pripominka zpozdeni pozde ranni prehled ztlumit vypnout telefon',
            },
            sk: {
                title: 'Upozornenia a pripomienky',
                summary: 'Na čo vás aplikácia upozorní a ako to nastaviť.',
                steps: [
                    'Zvonček hore zhromažďuje všetko: zmeny rozpisu, rozhodnutia o žiadostiach, výmeny, oznamy a končiace dokumenty.',
                    'Hodinu pred zverejnenou zmenou vám príde pripomienka, ak ešte nemáte zaznamenaný príchod.',
                    'Nemáte 15 minút po začiatku zmeny zaznamenaný príchod? Upozornenie dostanete vy aj vedúci — a znova po hodine. Admini dostávajú o 7:00 „{{notif.dailyDigest}}“, keď je čo hlásiť.',
                    'Čo vám chodí do telefónu, zvolíte v sekcii {{nav.settings}} → {{settings.notifications}}: {{settings.notif.push}}, {{settings.notif.shifts}}, {{settings.notif.account}} a pre schvaľujúcich {{settings.notif.requests}}.',
                ],
                tip: 'Prepínače sa týkajú len push upozornení na vašich zariadeniach — zvonček vždy ukáže všetko.',
                keywords: 'upozornenia notifikacie push zvoncek pripomienka meskanie neskoro ranny prehlad stlmit vypnut telefon',
            },
            uk: {
                title: 'Сповіщення та нагадування',
                summary: 'Про що вас сповіщає застосунок і як це налаштувати.',
                steps: [
                    'Дзвіночок угорі збирає все: зміни графіка, рішення щодо запитів, обміни, оголошення та документи, що спливають.',
                    'За годину до опублікованої зміни ви отримаєте нагадування, якщо ще не відмітили прихід.',
                    'Не відмітили прихід через 15 хвилин після початку зміни? Сповіщення отримаєте ви й керівник — і ще раз через годину. Адміністратори о 7:00 отримують «{{notif.dailyDigest}}», якщо є що повідомити.',
                    'Що надходить на телефон, виберіть у розділі {{nav.settings}} → {{settings.notifications}}: {{settings.notif.push}}, {{settings.notif.shifts}}, {{settings.notif.account}} і, для тих, хто розглядає запити, {{settings.notif.requests}}.',
                ],
                tip: 'Перемикачі стосуються лише push на ваших пристроях — дзвіночок завжди показує все.',
                keywords: 'сповіщення push дзвіночок нагадування запізнення ранковий підсумок вимкнути телефон',
            },
        },
    },
];
