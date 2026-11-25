import type { HelpArticle } from '../types';

export const announcementArticles: HelpArticle[] = [
    {
        id: 'read-announcements',
        topic: 'announcements',
        route: '/announcements',
        routeLabel: 'nav.announcements',
        content: {
            en: {
                title: 'Read announcements',
                summary: 'News from your managers, with a badge until you’ve read it.',
                steps: [
                    'A number next to {{nav.announcements}} in the menu means something is unread. The newest one also shows on the Dashboard.',
                    'Open {{nav.announcements}}. Unread posts are marked {{announcements.new}}; {{announcements.pinned}} ones stay on top.',
                    'Tap a post to mark it read — your manager sees who has read it.',
                ],
                keywords: 'announcement announcements news message notice board read unread pinned',
            },
            cs: {
                title: 'Čtení oznámení',
                summary: 'Novinky od vedoucích, s odznakem, dokud je nepřečtete.',
                steps: [
                    'Číslo u položky {{nav.announcements}} v menu znamená, že máte něco nepřečteného. Nejnovější oznámení je vidět i na Nástěnce.',
                    'Otevřete {{nav.announcements}}. Nepřečtená mají štítek {{announcements.new}}; ta se štítkem {{announcements.pinned}} zůstávají nahoře.',
                    'Klepnutím na oznámení ho označíte jako přečtené — vedoucí vidí, kdo ho četl.',
                ],
                keywords: 'oznameni novinky zprava nastenka precist neprectene pripnute',
            },
            sk: {
                title: 'Čítanie oznamov',
                summary: 'Novinky od vedúcich, s odznakom, kým ich neprečítate.',
                steps: [
                    'Číslo pri položke {{nav.announcements}} v menu znamená, že máte niečo neprečítané. Najnovší oznam je vidieť aj na Nástenke.',
                    'Otvorte {{nav.announcements}}. Neprečítané majú štítok {{announcements.new}}; tie so štítkom {{announcements.pinned}} zostávajú hore.',
                    'Ťuknutím na oznam ho označíte ako prečítaný — vedúci vidí, kto ho čítal.',
                ],
                keywords: 'oznamy oznam novinky sprava nastenka precitat neprecitane pripnute',
            },
            uk: {
                title: 'Читання оголошень',
                summary: 'Новини від керівників зі значком, доки ви їх не прочитаєте.',
                steps: [
                    'Число біля {{nav.announcements}} у меню означає, що є непрочитане. Найновіше оголошення видно й на Панелі.',
                    'Відкрийте {{nav.announcements}}. Непрочитані мають позначку {{announcements.new}}; ті, що з позначкою {{announcements.pinned}}, лишаються вгорі.',
                    'Натисніть оголошення, щоб позначити його прочитаним, — керівник бачить, хто його прочитав.',
                ],
                keywords: 'оголошення новини повідомлення дошка прочитати непрочитане закріплене',
            },
        },
    },
    {
        id: 'post-announcement',
        topic: 'announcements',
        audience: 'announcements.post',
        route: '/announcements',
        routeLabel: 'nav.announcements',
        content: {
            en: {
                title: 'Post an announcement',
                summary: 'Write to everyone or to one location or role, and see who read it.',
                steps: [
                    'Open {{nav.announcements}}, write a title and the text.',
                    'Choose the audience: {{announcements.audienceLocation}} and {{announcements.audienceRole}} ({{announcements.allLocations}} / {{announcements.allRoles}} by default). The line below shows how many people it reaches.',
                    'Tap {{announcements.post}}. Recipients get a notification (and a Telegram message, if they linked it).',
                    'On a post: {{announcements.pin}} keeps it on top; the read count opens {{announcements.readersTitle}}. You can also edit or delete it.',
                ],
                keywords: 'post write publish announcement news message team audience location role pin read receipts who read',
            },
            cs: {
                title: 'Zveřejnění oznámení',
                summary: 'Napište všem nebo jednomu místu či roli a uvidíte, kdo četl.',
                steps: [
                    'Otevřete {{nav.announcements}}, napište nadpis a text.',
                    'Zvolte příjemce: {{announcements.audienceLocation}} a {{announcements.audienceRole}} (výchozí {{announcements.allLocations}} / {{announcements.allRoles}}). Řádek pod tím ukáže, kolika lidem dorazí.',
                    'Klepněte na {{announcements.post}}. Příjemci dostanou upozornění (a zprávu v Telegramu, pokud ho propojili).',
                    'U oznámení: {{announcements.pin}} ho drží nahoře; počet přečtení otevře {{announcements.readersTitle}}. Oznámení můžete i upravit nebo smazat.',
                ],
                keywords: 'zverejnit napsat oznameni novinka zprava tymu prijemci misto role pripnout precteno kdo cetl',
            },
            sk: {
                title: 'Zverejnenie oznamu',
                summary: 'Napíšte všetkým alebo jednému miestu či role a uvidíte, kto čítal.',
                steps: [
                    'Otvorte {{nav.announcements}}, napíšte nadpis a text.',
                    'Zvoľte príjemcov: {{announcements.audienceLocation}} a {{announcements.audienceRole}} (predvolene {{announcements.allLocations}} / {{announcements.allRoles}}). Riadok pod tým ukáže, koľkým ľuďom príde.',
                    'Ťuknite na {{announcements.post}}. Príjemcovia dostanú upozornenie (a správu v Telegrame, ak ho prepojili).',
                    'Pri ozname: {{announcements.pin}} ho drží hore; počet prečítaní otvorí {{announcements.readersTitle}}. Oznam môžete aj upraviť alebo zmazať.',
                ],
                keywords: 'zverejnit napisat oznam novinka sprava timu prijemcovia miesto rola pripnut precitane kto cital',
            },
            uk: {
                title: 'Публікація оголошення',
                summary: 'Напишіть усім або одній локації чи ролі й побачите, хто прочитав.',
                steps: [
                    'Відкрийте {{nav.announcements}}, напишіть заголовок і текст.',
                    'Виберіть одержувачів: {{announcements.audienceLocation}} та {{announcements.audienceRole}} (типово {{announcements.allLocations}} / {{announcements.allRoles}}). Рядок нижче показує, скільком людям воно надійде.',
                    'Натисніть {{announcements.post}}. Одержувачі отримають сповіщення (і повідомлення в Telegram, якщо його під’єднали).',
                    'В оголошенні: {{announcements.pin}} тримає його вгорі; лічильник прочитань відкриває {{announcements.readersTitle}}. Оголошення можна також змінити або видалити.',
                ],
                keywords: 'опублікувати написати оголошення новина повідомлення команді одержувачі місце роль закріпити прочитано хто прочитав',
            },
        },
    },
];
