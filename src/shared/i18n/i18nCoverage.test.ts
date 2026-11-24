import { describe, expect, it } from 'vitest';
import { BASE_LANGUAGE, INTL_LOCALE, LANGUAGES, en, cs, translate, translations, type PartialDictionary, type TranslationKey } from './translations';
import { peopleKey } from '@features/roles/types';

/**
 * sk + uk are partial dictionaries: other work keeps adding en/cs keys, and a
 * missing translation must never break the build — it falls back instead.
 * This test reports how complete each one is and fails only when coverage
 * drops below MIN_COVERAGE (raise it as the backlog gets translated).
 */
const MIN_COVERAGE = 95;

const PARTIAL = { sk: translations.sk, uk: translations.uk } satisfies Record<string, PartialDictionary>;
const enKeys = Object.keys(en) as TranslationKey[];
const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();

describe('i18n coverage (sk, uk)', () => {
    for (const [lang, dict] of Object.entries(PARTIAL)) {
        const has = enKeys.filter((k) => typeof dict[k] === 'string');
        const pct = Math.floor((has.length / enKeys.length) * 1000) / 10;

        it(`${lang}: ${pct} % of ${enKeys.length} keys (min ${MIN_COVERAGE} %)`, () => {
            const missing = enKeys.filter((k) => dict[k] === undefined);
            console.info(`[i18n] ${lang}: ${has.length}/${enKeys.length} = ${pct} %${missing.length ? ` — missing: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}` : ''}`);
            expect(pct).toBeGreaterThanOrEqual(MIN_COVERAGE);
        });

        it(`${lang}: no keys that English doesn't have, no empty strings`, () => {
            const extra = Object.keys(dict).filter((k) => !(k in en));
            expect(extra).toEqual([]);
            const empty = has.filter((k) => !dict[k]?.trim() && en[k].trim());
            expect(empty).toEqual([]);
        });

        it(`${lang}: keeps every {placeholder} of the source string`, () => {
            const bad = has.filter((k) => {
                const p = placeholders(dict[k]!).join();
                return p !== placeholders(en[k]).join() && p !== placeholders(cs[k]).join();
            });
            expect(bad).toEqual([]);
        });
    }
});

describe('translate() fallback', () => {
    it('uses the language, then its base language, then English', () => {
        const key = 'nav.schedule' as const;
        expect(translate('sk', key)).toBe(translations.sk[key]);
        expect(translate('uk', key)).toBe(translations.uk[key]);
        // Simulate a key the partial dictionaries don't have yet.
        const sk = translations.sk as PartialDictionary;
        const uk = translations.uk as PartialDictionary;
        const [skSaved, ukSaved] = [sk[key], uk[key]];
        delete sk[key];
        delete uk[key];
        try {
            expect(translate('sk', key)).toBe(cs[key]);
            expect(translate('uk', key)).toBe(en[key]);
        } finally {
            sk[key] = skSaved;
            uk[key] = ukSaved;
        }
    });

    it('every UI language has a base language, an Intl locale and a switcher label', () => {
        for (const { code, label } of LANGUAGES) {
            expect(label).toBeTruthy();
            expect(['en', 'cs']).toContain(BASE_LANGUAGE[code]);
            expect(() => new Intl.DateTimeFormat(INTL_LOCALE[code])).not.toThrow();
        }
        expect(LANGUAGES.map((l) => l.code).sort()).toEqual(['cs', 'en', 'sk', 'uk']);
    });
});

describe('plurals (people count)', () => {
    it('follows each language’s plural rules', () => {
        expect([1, 2, 5].map((n) => peopleKey(n, 'en'))).toEqual(['roles.members_one', 'roles.members', 'roles.members']);
        expect([1, 3, 5].map((n) => peopleKey(n, 'cs'))).toEqual(['roles.members_one', 'roles.members_few', 'roles.members']);
        expect([1, 4, 5].map((n) => peopleKey(n, 'sk'))).toEqual(['roles.members_one', 'roles.members_few', 'roles.members']);
        // Ukrainian: 21 людина, 22 людини, 11 / 25 людей.
        expect([1, 21, 22, 11, 25].map((n) => peopleKey(n, 'uk'))).toEqual([
            'roles.members_one',
            'roles.members_one',
            'roles.members_few',
            'roles.members',
            'roles.members',
        ]);
        expect(translate('uk', peopleKey(21, 'uk')).replace('{n}', '21')).toBe('21 людина');
    });
});
