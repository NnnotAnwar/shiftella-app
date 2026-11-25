import type { HelpArticle } from '../types';

export const swapArticles: HelpArticle[] = [
    {
        id: 'swap-shift',
        topic: 'swaps',
        route: '/schedule',
        routeLabel: 'nav.schedule',
        content: {
            en: {
                title: 'Swap a shift with a colleague',
                summary: 'Offer your shift, let someone take it, an admin confirms.',
                steps: [
                    'Open {{nav.schedule}} → {{schedule.tabMine}}. Next to an upcoming shift tap the arrows icon ({{swap.offer}}). {{common.undo}} in the message takes the offer back.',
                    'Colleagues see it on the {{swap.title}} card and tap {{swap.take}}. The app only lets someone take it if they are free — no other shift, leave or “can’t work” that day.',
                    'An admin then approves the swap in {{nav.requests}}. Until then the shift stays with you.',
                    'Offered by mistake? Use {{swap.withdraw}}. Took one by mistake? Use {{swap.giveBack}}.',
                ],
                keywords: 'swap exchange trade give away shift cover colleague take offer replacement',
            },
            cs: {
                title: 'Výměna směny s kolegou',
                summary: 'Nabídněte směnu, někdo ji vezme, admin potvrdí.',
                steps: [
                    'Otevřete {{nav.schedule}} → {{schedule.tabMine}}. U nadcházející směny klepněte na ikonu šipek ({{swap.offer}}). {{common.undo}} ve zprávě nabídku stáhne.',
                    'Kolegové ji uvidí na kartě {{swap.title}} a klepnou na {{swap.take}}. Vzít ji může jen ten, kdo má volno — žádnou jinou směnu, nepřítomnost ani „nemohu“ ten den.',
                    'Výměnu pak schválí admin v sekci {{nav.requests}}. Do té doby směna zůstává vám.',
                    'Nabídli jste omylem? Použijte {{swap.withdraw}}. Vzali jste omylem? Použijte {{swap.giveBack}}.',
                ],
                keywords: 'vymena vymenit smenu prohodit predat zastup kolega vzit nabidnout nahrada',
            },
            sk: {
                title: 'Výmena zmeny s kolegom',
                summary: 'Ponúknite zmenu, niekto ju zoberie, admin potvrdí.',
                steps: [
                    'Otvorte {{nav.schedule}} → {{schedule.tabMine}}. Pri nadchádzajúcej zmene ťuknite na ikonu šípok ({{swap.offer}}). {{common.undo}} v správe ponuku stiahne.',
                    'Kolegovia ju uvidia na karte {{swap.title}} a ťuknú na {{swap.take}}. Zobrať ju môže len ten, kto má voľno — žiadnu inú zmenu, neprítomnosť ani „nemôžem“ v ten deň.',
                    'Výmenu potom schváli admin v sekcii {{nav.requests}}. Dovtedy zmena zostáva vám.',
                    'Ponúkli ste omylom? Použite {{swap.withdraw}}. Zobrali ste omylom? Použite {{swap.giveBack}}.',
                ],
                keywords: 'vymena vymenit zmenu prehodit odovzdat zastup kolega zobrat ponuknut nahrada',
            },
            uk: {
                title: 'Обмін зміною з колегою',
                summary: 'Запропонуйте зміну, хтось її візьме, адміністратор підтвердить.',
                steps: [
                    'Відкрийте {{nav.schedule}} → {{schedule.tabMine}}. Біля майбутньої зміни натисніть значок стрілок ({{swap.offer}}). {{common.undo}} у повідомленні скасовує пропозицію.',
                    'Колеги побачать її на картці {{swap.title}} і натиснуть {{swap.take}}. Взяти її може лише той, хто вільний — без іншої зміни, відсутності чи «не можу» того дня.',
                    'Потім адміністратор схвалює обмін у розділі {{nav.requests}}. Доти зміна лишається за вами.',
                    'Запропонували помилково? Натисніть {{swap.withdraw}}. Взяли помилково? Натисніть {{swap.giveBack}}.',
                ],
                keywords: 'обмін обміняти зміну передати заміна колега взяти запропонувати',
            },
        },
    },
    {
        id: 'open-shifts',
        topic: 'swaps',
        route: '/schedule',
        routeLabel: 'nav.schedule',
        content: {
            en: {
                title: 'Open shifts',
                summary: 'Shifts nobody has yet — whoever claims first gets it.',
                steps: [
                    'When there is something to take, {{nav.schedule}} shows {{open.title}}. Tap {{open.claim}}; the first person wins.',
                    'Can’t make it after all? {{open.release}} hands it back to the others.',
                    'Planners post one with {{open.post}} (location, date, times, optionally a role).',
                    'Once claimed, the planner taps {{open.toRota}} — the shift lands in the rota for that person.',
                ],
                keywords: 'open shift unassigned free shift claim pick up extra shift post vacancy',
            },
            cs: {
                title: 'Volné směny',
                summary: 'Směny, které zatím nikdo nemá — kdo dřív přijde, ten bere.',
                steps: [
                    'Když je co vzít, ukáže sekce {{nav.schedule}} kartu {{open.title}}. Klepněte na {{open.claim}}; vyhrává první.',
                    'Nakonec nemůžete? Tlačítkem {{open.release}} ji uvolníte ostatním.',
                    'Plánující ji vypíše tlačítkem {{open.post}} (místo, datum, časy, případně role).',
                    'Po obsazení klepne plánující na {{open.toRota}} — směna se tomu člověku objeví v rozpisu.',
                ],
                keywords: 'volna smena neobsazena vzit navic brigada vypsat smenu',
            },
            sk: {
                title: 'Voľné zmeny',
                summary: 'Zmeny, ktoré zatiaľ nikto nemá — kto prv príde, ten berie.',
                steps: [
                    'Keď je čo zobrať, ukáže sekcia {{nav.schedule}} kartu {{open.title}}. Ťuknite na {{open.claim}}; vyhráva prvý.',
                    'Nakoniec nemôžete? Tlačidlom {{open.release}} ju uvoľníte ostatným.',
                    'Plánujúci ju vypíše tlačidlom {{open.post}} (miesto, dátum, časy, prípadne rola).',
                    'Po obsadení ťukne plánujúci na {{open.toRota}} — zmena sa tomu človeku zobrazí v rozpise.',
                ],
                keywords: 'volna zmena neobsadena zobrat navyse brigada vypisat zmenu',
            },
            uk: {
                title: 'Вільні зміни',
                summary: 'Зміни, яких ще ніхто не має, — хто перший, того й зміна.',
                steps: [
                    'Коли є що взяти, розділ {{nav.schedule}} показує {{open.title}}. Натисніть {{open.claim}}; виграє перший.',
                    'Зрештою не можете? Кнопка {{open.release}} віддає її іншим.',
                    'Той, хто планує, створює її кнопкою {{open.post}} (локація, дата, час, за бажанням роль).',
                    'Коли зміну взяли, плановик натискає {{open.toRota}} — зміна з’являється в графіку цієї людини.',
                ],
                keywords: 'вільна зміна непризначена взяти додаткова зміна опублікувати вакансія',
            },
        },
    },
];
