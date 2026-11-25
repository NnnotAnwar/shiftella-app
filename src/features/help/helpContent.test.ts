import { describe, expect, it } from 'vitest';
import { en, LANGUAGES, translate, type Language, type TranslationKey } from '@shared/i18n/translations';
import { HELP_ARTICLES, helpArticle, isHelpArticleId } from './articles';
import { labelKeys, resolveLabels } from './helpLogic';
import { HELP_TOPICS } from './topics';
import type { HelpText } from './types';

/**
 * Help content is typed data with ALL four languages (`Record<Language, …>`),
 * so unlike the partial sk/uk UI dictionaries (i18nCoverage.test.ts) it never
 * falls back — these checks keep the translations complete and aligned.
 */

const LANGS = LANGUAGES.map((l) => l.code) as Language[];
const texts = (c: HelpText) => [c.title, c.summary, ...c.steps, ...(c.tip ? [c.tip] : [])];
const APP_ROUTES = ['/', '/schedule', '/overview', '/announcements', '/requests', '/timesheets', '/analytics', '/activity', '/admin', '/settings', '/billing', '/profile', '/help'];

describe('help articles', () => {
    it('has a sensible number of articles with unique ids', () => {
        const ids = HELP_ARTICLES.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBeGreaterThanOrEqual(20);
        expect(ids.length).toBeLessThanOrEqual(35);
        for (const id of ids) {
            expect(isHelpArticleId(id)).toBe(true);
            expect(helpArticle(id)?.id).toBe(id);
        }
        expect(isHelpArticleId('nope')).toBe(false);
    });

    it('covers every topic, and every article sits in a known topic', () => {
        const topics = new Set(HELP_TOPICS.map((t) => t.id));
        for (const a of HELP_ARTICLES) expect(topics.has(a.topic)).toBe(true);
        for (const t of HELP_TOPICS) expect(HELP_ARTICLES.some((a) => a.topic === t.id)).toBe(true);
    });

    it.each(LANGS)('every article is fully written in %s', (lang) => {
        for (const a of HELP_ARTICLES) {
            const c = a.content[lang];
            expect(c, `${a.id}/${lang}`).toBeDefined();
            expect(c.title.trim(), `${a.id}/${lang} title`).not.toBe('');
            expect(c.summary.trim(), `${a.id}/${lang} summary`).not.toBe('');
            expect(c.steps.length, `${a.id}/${lang} steps`).toBeGreaterThanOrEqual(2);
            for (const s of c.steps) expect(s.trim(), `${a.id}/${lang} step`).not.toBe('');
        }
    });

    it('keeps the languages aligned: same steps, same tip, same UI labels', () => {
        for (const a of HELP_ARTICLES) {
            const ref = a.content.en;
            for (const lang of LANGS) {
                const c = a.content[lang];
                expect(c.steps.length, `${a.id}/${lang} step count`).toBe(ref.steps.length);
                expect(!!c.tip, `${a.id}/${lang} tip`).toBe(!!ref.tip);
                expect(texts(c).flatMap(labelKeys).sort(), `${a.id}/${lang} labels`).toEqual(texts(ref).flatMap(labelKeys).sort());
            }
        }
    });

    it('only references real UI labels, which resolve in every language', () => {
        for (const a of HELP_ARTICLES) {
            for (const lang of LANGS) {
                for (const s of texts(a.content[lang])) {
                    for (const k of labelKeys(s)) {
                        expect(k in en, `${a.id}/${lang}: unknown label {{${k}}}`).toBe(true);
                        expect(translate(lang, k as TranslationKey).trim()).not.toBe('');
                    }
                    const out = resolveLabels(s, (k) => translate(lang, k));
                    expect(out, `${a.id}/${lang}: unresolved token`).not.toMatch(/\{\{|\}\}/);
                }
            }
        }
    });

    it('stays short — a few steps, each a sentence or two', () => {
        for (const a of HELP_ARTICLES) {
            for (const lang of LANGS) {
                const c = a.content[lang];
                expect(c.steps.length, `${a.id}`).toBeLessThanOrEqual(6);
                expect(c.title.length, `${a.id}/${lang} title`).toBeLessThanOrEqual(80);
                for (const s of c.steps) expect(s.length, `${a.id}/${lang}: ${s}`).toBeLessThanOrEqual(320);
            }
        }
    });

    it('has unique titles per language', () => {
        for (const lang of LANGS) {
            const titles = HELP_ARTICLES.map((a) => a.content[lang].title);
            expect(new Set(titles).size, lang).toBe(titles.length);
        }
    });

    it('links only to app routes, with a real label', () => {
        for (const a of HELP_ARTICLES) {
            if (!a.route) continue;
            expect(APP_ROUTES, a.id).toContain(a.route.split('?')[0]);
            expect(a.routeLabel && a.routeLabel in en, a.id).toBe(true);
        }
    });
});
