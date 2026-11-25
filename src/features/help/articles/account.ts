import type { HelpArticle } from '../types';

export const accountArticles: HelpArticle[] = [
    {
        id: 'profile-account',
        topic: 'account',
        route: '/profile',
        routeLabel: 'nav.profile',
        content: {
            en: {
                title: 'Profile, username and password',
                summary: 'Change how you sign in, your name and how the app looks.',
                steps: [
                    'Open {{nav.profile}} → {{profile.edit}}. You can change your {{profile.editor.username}} once every 7 days.',
                    'Your name is changed by an admin: use {{profile.editor.requestNameChange}} and you get a notification with the answer.',
                    'Forgot your password? On the sign-in screen tap {{auth.forgotLink}} and follow the email (it works with your email address, not the username).',
                    '{{nav.settings}} sets {{settings.language}}, {{settings.theme}}, {{settings.colorScheme}} and {{settings.timeFormat}}.',
                ],
                keywords: 'profile account username login name change password forgot reset language theme dark mode colour time format 24h',
            },
            cs: {
                title: 'Profil, uživatelské jméno a heslo',
                summary: 'Změňte, jak se přihlašujete, své jméno a vzhled aplikace.',
                steps: [
                    'Otevřete {{nav.profile}} → {{profile.edit}}. {{profile.editor.username}} můžete změnit jednou za 7 dní.',
                    'Jméno mění admin: použijte {{profile.editor.requestNameChange}} a odpověď vám přijde v upozornění.',
                    'Zapomněli jste heslo? Na přihlašovací obrazovce klepněte na {{auth.forgotLink}} a pokračujte podle e-mailu (funguje s e-mailem, ne s uživatelským jménem).',
                    'V sekci {{nav.settings}} nastavíte {{settings.language}}, {{settings.theme}}, {{settings.colorScheme}} a {{settings.timeFormat}}.',
                ],
                keywords: 'profil ucet uzivatelske jmeno prihlaseni zmena jmena heslo zapomenute obnovit jazyk motiv tmavy rezim barva format casu',
            },
            sk: {
                title: 'Profil, používateľské meno a heslo',
                summary: 'Zmeňte, ako sa prihlasujete, svoje meno a vzhľad aplikácie.',
                steps: [
                    'Otvorte {{nav.profile}} → {{profile.edit}}. {{profile.editor.username}} môžete zmeniť raz za 7 dní.',
                    'Meno mení admin: použite {{profile.editor.requestNameChange}} a odpoveď vám príde v upozornení.',
                    'Zabudli ste heslo? Na prihlasovacej obrazovke ťuknite na {{auth.forgotLink}} a pokračujte podľa e-mailu (funguje s e-mailom, nie s používateľským menom).',
                    'V sekcii {{nav.settings}} nastavíte {{settings.language}}, {{settings.theme}}, {{settings.colorScheme}} a {{settings.timeFormat}}.',
                ],
                keywords: 'profil ucet pouzivatelske meno prihlasenie zmena mena heslo zabudnute obnovit jazyk motiv tmavy rezim farba format casu',
            },
            uk: {
                title: 'Профіль, ім’я користувача та пароль',
                summary: 'Змініть спосіб входу, своє ім’я та вигляд застосунку.',
                steps: [
                    'Відкрийте {{nav.profile}} → {{profile.edit}}. {{profile.editor.username}} можна змінювати раз на 7 днів.',
                    'Ім’я змінює адміністратор: скористайтеся кнопкою {{profile.editor.requestNameChange}}, і відповідь надійде у сповіщенні.',
                    'Забули пароль? На екрані входу натисніть {{auth.forgotLink}} і дійте за листом (працює з e-mail, а не з іменем користувача).',
                    'У розділі {{nav.settings}} задаються {{settings.language}}, {{settings.theme}}, {{settings.colorScheme}} та {{settings.timeFormat}}.',
                ],
                keywords: 'профіль обліковий запис ім’я користувача вхід зміна імені пароль забув відновити мова тема темний режим колір формат часу',
            },
        },
    },
    {
        id: 'gdpr',
        topic: 'account',
        route: '/settings',
        routeLabel: 'nav.settings',
        content: {
            en: {
                title: 'Your data: export or delete your account',
                summary: 'Download everything we hold about you, or erase it.',
                steps: [
                    'Open {{nav.settings}} → {{settings.dataPrivacy}}.',
                    '{{settings.exportData}} downloads all your data as a JSON file.',
                    '{{settings.deleteAccount}} permanently erases your account with your shifts, schedule and time off. It cannot be undone.',
                    'The last admin of a team with other members must hand over the admin role first.',
                ],
                tip: 'How we handle data is described in the {{settings.privacy}}.',
                keywords: 'gdpr privacy data export download json delete account erase remove right to be forgotten personal data',
            },
            cs: {
                title: 'Vaše data: export nebo smazání účtu',
                summary: 'Stáhněte vše, co o vás máme, nebo to vymažte.',
                steps: [
                    'Otevřete {{nav.settings}} → {{settings.dataPrivacy}}.',
                    '{{settings.exportData}} stáhne všechna vaše data jako soubor JSON.',
                    '{{settings.deleteAccount}} natrvalo vymaže váš účet i se směnami, rozpisem a volnem. Nejde to vrátit.',
                    'Poslední admin týmu, kde jsou další členové, musí nejdřív předat roli admina.',
                ],
                tip: 'Jak s daty zacházíme, popisují {{settings.privacy}}.',
                keywords: 'gdpr soukromi osobni udaje data export stahnout json smazat ucet vymazat odstranit pravo byt zapomenut',
            },
            sk: {
                title: 'Vaše údaje: export alebo zmazanie účtu',
                summary: 'Stiahnite všetko, čo o vás máme, alebo to vymažte.',
                steps: [
                    'Otvorte {{nav.settings}} → {{settings.dataPrivacy}}.',
                    '{{settings.exportData}} stiahne všetky vaše údaje ako súbor JSON.',
                    '{{settings.deleteAccount}} natrvalo vymaže váš účet aj so zmenami, rozpisom a voľnom. Nedá sa to vrátiť.',
                    'Posledný admin tímu, kde sú ďalší členovia, musí najprv odovzdať rolu admina.',
                ],
                tip: 'Ako s údajmi zaobchádzame, opisujú {{settings.privacy}}.',
                keywords: 'gdpr sukromie osobne udaje data export stiahnut json zmazat ucet vymazat odstranit pravo na zabudnutie',
            },
            uk: {
                title: 'Ваші дані: експорт або видалення облікового запису',
                summary: 'Завантажте все, що ми про вас зберігаємо, або видаліть це.',
                steps: [
                    'Відкрийте {{nav.settings}} → {{settings.dataPrivacy}}.',
                    '{{settings.exportData}} завантажує всі ваші дані як файл JSON.',
                    '{{settings.deleteAccount}} назавжди видаляє ваш обліковий запис разом зі змінами, графіком і вихідними. Скасувати це не можна.',
                    'Останній адміністратор команди, де є інші учасники, має спершу передати роль адміністратора.',
                ],
                tip: 'Як ми поводимося з даними, описано в документі {{settings.privacy}}.',
                keywords: 'gdpr приватність персональні дані експорт завантажити json видалити обліковий запис стерти право на забуття',
            },
        },
    },
];
