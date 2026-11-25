import { describe, expect, it } from 'vitest';
import { translate, type Language, type TranslationKey } from '@shared/i18n/translations';
import type { User } from '@shared/types';
import { HELP_ARTICLES } from './articles';
import { arrange, asLabel, fold, isFor, labelKeys, resolveLabels, searchArticles, splitLabels } from './helpLogic';
import type { HelpArticle } from './types';

const tr = (lang: Language) => (k: TranslationKey) => translate(lang, k);

const base = { id: 'u', username: 'u', first_name: 'U', last_name: null, email: 'u@x.io', organization_id: 'org' };
const employee: User = { ...base, role: { name: 'Employee', is_admin: false, rank: 0 } };
const manager: User = { ...base, role: { name: 'Manager', is_admin: false, rank: 20 } };
const admin: User = { ...base, role: { name: 'Admin', is_admin: true, rank: 30 } };
const owner: User = { ...base, role: { name: 'Head Admin', is_admin: true, rank: 40 } };

describe('fold (diacritics-insensitive)', () => {
    it('drops Czech and Slovak diacritics and case', () => {
        expect(fold('Náhradní VOLNO')).toBe('nahradni volno');
        expect(fold('Žádost o dovolenou')).toBe('zadost o dovolenou');
        expect(fold('Ťuknite, prosím!')).toBe('tuknite prosim');
        expect(fold('Rozpis týmu → Směny')).toBe('rozpis tymu smeny');
    });

    it('keeps Cyrillic letters searchable', () => {
        expect(fold('Відпустка')).toBe(fold('відпустка'));
        expect(fold('Графік')).toContain('графік'.normalize('NFD').replace(/\p{M}/gu, ''));
    });
});

describe('labels', () => {
    it('strips placeholders and ellipses from a UI string', () => {
        expect(asLabel('Publish ({count})')).toBe('Publish');
        expect(asLabel('Join {org}')).toBe('Join');
        expect(asLabel('Add member to this location…')).toBe('Add member to this location');
        expect(asLabel('Plan shift')).toBe('Plan shift');
    });

    it('resolves {{key}} tokens in the reader’s language', () => {
        const text = 'Tap {{schedule.copyLast}} in {{nav.schedule}}.';
        expect(labelKeys(text)).toEqual(['schedule.copyLast', 'nav.schedule']);
        expect(resolveLabels(text, tr('en'))).toBe('Tap Copy last month in Schedule.');
        expect(resolveLabels(text, tr('cs'))).toBe('Tap Zkopírovat minulý měsíc in Rozpis.');
        expect(splitLabels(text, tr('en')).filter((p) => p.label).map((p) => p.text)).toEqual(['Copy last month', 'Schedule']);
    });
});

describe('search', () => {
    const all = () => true;

    it('finds Czech articles typed without diacritics', () => {
        const hits = searchArticles(HELP_ARTICLES, 'nahradni volno', 'cs', tr('cs'), all).map((h) => h.article.id);
        expect(hits[0]).toBe('leave-balances');
    });

    it('matches with or without diacritics alike', () => {
        const a = searchArticles(HELP_ARTICLES, 'dovolená', 'cs', tr('cs'), all).map((h) => h.article.id);
        const b = searchArticles(HELP_ARTICLES, 'DOVOLENA', 'cs', tr('cs'), all).map((h) => h.article.id);
        expect(a).toEqual(b);
        expect(a).toContain('request-time-off');
    });

    it('matches word prefixes and needs every word', () => {
        expect(searchArticles(HELP_ARTICLES, 'telegr', 'en', tr('en'), all)[0].article.id).toBe('telegram');
        expect(searchArticles(HELP_ARTICLES, 'telegram zzzz', 'en', tr('en'), all)).toEqual([]);
        expect(searchArticles(HELP_ARTICLES, '   ', 'en', tr('en'), all)).toEqual([]);
    });

    it('searches the resolved UI labels too', () => {
        // "Copy last month" only appears as {{schedule.copyLast}} in the prose.
        const hits = searchArticles(HELP_ARTICLES, 'copy last month', 'en', tr('en'), all).map((h) => h.article.id);
        expect(hits).toContain('rota-templates');
    });

    it('ranks title hits first and the reader’s own articles above managers’ ones on a tie', () => {
        const forEmployee = (a: HelpArticle) => isFor(employee, a.audience);
        const hits = searchArticles(HELP_ARTICLES, 'time off', 'en', tr('en'), forEmployee);
        expect(hits[0].article.id).toBe('request-time-off');
        expect(hits[0].forYou).toBe(true);
        const decide = hits.find((h) => h.article.id === 'decide-time-off');
        expect(decide?.forYou).toBe(false);
    });

    it('works in Slovak and Ukrainian', () => {
        expect(searchArticles(HELP_ARTICLES, 'vymena zmeny', 'sk', tr('sk'), all)[0].article.id).toBe('swap-shift');
        expect(searchArticles(HELP_ARTICLES, 'відпустка', 'uk', tr('uk'), all).map((h) => h.article.id)).toContain('request-time-off');
    });
});

describe('role-aware order', () => {
    it('knows who an article is for', () => {
        expect(isFor(employee, undefined)).toBe(true);
        expect(isFor(employee, 'rota.edit')).toBe(false);
        expect(isFor(admin, 'rota.edit')).toBe(true);
        expect(isFor(manager, 'timesheets.view')).toBe(true);
        expect(isFor(admin, 'owner')).toBe(false);
        expect(isFor(owner, 'owner')).toBe(true);
        expect(isFor(null, 'rota.edit')).toBe(false);
    });

    it('puts an employee’s own articles first in every topic and manager-only topics last', () => {
        const groups = arrange(HELP_ARTICLES, (a) => isFor(employee, a.audience));
        for (const g of groups) {
            const flags = g.articles.map((a) => a.forYou);
            // never a "for you" article after a "for managers" one
            expect(flags.indexOf(false) === -1 || flags.lastIndexOf(true) < flags.indexOf(false)).toBe(true);
        }
        const rota = groups.find((g) => g.topic === 'rota')!;
        expect(rota.articles[0].article.id).toBe('my-schedule');
        expect(rota.articles.at(-1)!.forYou).toBe(false);
        // Billing holds nothing for an employee → it sinks to the bottom.
        expect(groups.at(-1)!.topic).toBe('billing');
        expect(groups[0].topic).toBe('start');
    });

    it('keeps the authored order for the owner, who may read everything', () => {
        const groups = arrange(HELP_ARTICLES, (a) => isFor(owner, a.audience));
        expect(groups.every((g) => g.articles.every((a) => a.forYou))).toBe(true);
        expect(groups.map((g) => g.topic)).toEqual([
            'start', 'rota', 'attendance', 'timeOff', 'swaps', 'announcements', 'timesheets', 'team', 'notifications', 'integrations', 'account', 'billing',
        ]);
        expect(groups.find((g) => g.topic === 'rota')!.articles[0].article.id).toBe('rota-plan');
    });

    it('never hides an article', () => {
        const count = arrange(HELP_ARTICLES, (a) => isFor(employee, a.audience)).reduce((n, g) => n + g.articles.length, 0);
        expect(count).toBe(HELP_ARTICLES.length);
    });
});
