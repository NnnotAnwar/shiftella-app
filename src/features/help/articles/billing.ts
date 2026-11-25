import type { HelpArticle } from '../types';

export const billingArticles: HelpArticle[] = [
    {
        id: 'billing-beta',
        topic: 'billing',
        audience: 'owner',
        route: '/billing',
        routeLabel: 'nav.billing',
        content: {
            en: {
                title: 'Subscription during the free beta',
                summary: 'Everything is free while Shiftella is in beta — no card, no limits.',
                steps: [
                    'During the beta every feature is on for your whole team, with no limits on people or locations.',
                    '{{nav.billing}} shows {{billing.status.beta}} and how many people and active locations you have. Only the Head Admin sees it.',
                    'Paid plans come later. We will tell you well in advance, and nothing is ever charged without your card.',
                ],
                keywords: 'billing subscription plan price pricing payment card invoice free beta trial cost upgrade',
            },
            cs: {
                title: 'Předplatné během bety zdarma',
                summary: 'Dokud je Shiftella v betě, je vše zdarma — bez karty a bez limitů.',
                steps: [
                    'Během bety má celý tým zapnuté všechny funkce, bez limitu lidí i míst.',
                    'Sekce {{nav.billing}} ukazuje {{billing.status.beta}} a počet lidí a aktivních míst. Vidí ji jen hlavní admin.',
                    'Placené tarify přijdou později. Dáme vám vědět s dostatečným předstihem a bez vaší karty se nikdy nic nestrhne.',
                ],
                keywords: 'predplatne tarif cena platba karta faktura zdarma beta zkusebni obdobi naklady upgrade',
            },
            sk: {
                title: 'Predplatné počas bety zadarmo',
                summary: 'Kým je Shiftella v bete, je všetko zadarmo — bez karty a bez limitov.',
                steps: [
                    'Počas bety má celý tím zapnuté všetky funkcie, bez limitu ľudí aj miest.',
                    'Sekcia {{nav.billing}} ukazuje {{billing.status.beta}} a počet ľudí a aktívnych miest. Vidí ju len hlavný admin.',
                    'Platené tarify prídu neskôr. Dáme vám vedieť s dostatočným predstihom a bez vašej karty sa nikdy nič nestrhne.',
                ],
                keywords: 'predplatne tarif cena platba karta faktura zadarmo beta skusobne obdobie naklady upgrade',
            },
            uk: {
                title: 'Підписка під час безкоштовної бети',
                summary: 'Поки Shiftella в беті, усе безкоштовно — без картки та без обмежень.',
                steps: [
                    'Під час бети вся команда має всі функції без обмежень на кількість людей і локацій.',
                    'Розділ {{nav.billing}} показує {{billing.status.beta}} та кількість людей і активних локацій. Його бачить лише головний адміністратор.',
                    'Платні тарифи з’являться пізніше. Ми попередимо заздалегідь, і без вашої картки нічого ніколи не буде списано.',
                ],
                keywords: 'підписка тариф ціна оплата картка рахунок безкоштовно бета пробний період вартість',
            },
        },
    },
];
