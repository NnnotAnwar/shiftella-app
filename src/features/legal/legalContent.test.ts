import { describe, it, expect } from 'vitest';
import { LEGAL, legalContent } from './legalContent';

const LANGS = ['cs', 'en', 'sk', 'uk'] as const;

describe('legal content', () => {
    it('has the privacy policy in every UI language', () => {
        for (const lang of LANGS) expect(LEGAL.privacy[lang]).toBeDefined();
        expect(legalContent('privacy', 'sk').title).toBe('Zásady ochrany osobných údajov');
        expect(legalContent('privacy', 'uk').title).toBe('Політика конфіденційності');
    });

    it('falls back to the base language for terms (sk → cs, uk → en)', () => {
        expect(legalContent('terms', 'sk')).toBe(LEGAL.terms.cs);
        expect(legalContent('terms', 'uk')).toBe(LEGAL.terms.en);
    });

    it('keeps the privacy translations in step with the Czech main version', () => {
        const cs = LEGAL.privacy.cs!;
        for (const lang of LANGS) {
            const doc = LEGAL.privacy[lang]!;
            expect(doc.sections, lang).toHaveLength(cs.sections.length);
            doc.sections.forEach((s, i) => {
                expect(s.items?.length ?? 0, `${lang} §${i + 1}`).toBe(cs.sections[i].items?.length ?? 0);
                expect(!!s.note, `${lang} §${i + 1} note`).toBe(!!cs.sections[i].note);
            });
        }
    });

    it('names the privacy contact, the Czech DPA and the processors in every language', () => {
        for (const lang of LANGS) {
            const text = JSON.stringify(LEGAL.privacy[lang]);
            expect(text, lang).toContain('support@shiftella.app');
            expect(text, lang).toContain('www.uoou.cz');
            for (const name of ['Supabase', 'Hetzner', 'Resend', 'Firebase Cloud Messaging', 'Cloudflare', 'Telegram', 'Stripe']) {
                expect(text, `${lang}: ${name}`).toContain(name);
            }
            // Fonts are self-hosted (src/fonts.css): no font CDN is a recipient any more.
            expect(text, lang).not.toMatch(/Google Fonts|Fontshare/);
        }
    });
});
