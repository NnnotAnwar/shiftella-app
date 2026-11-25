import { describe, it, expect } from 'vitest';
import { LANDING, withFreeBeta } from './landingContent';

describe('withFreeBeta', () => {
    it('swaps the trial wording for the beta one, meta description included', () => {
        for (const c of Object.values(LANDING)) {
            const b = withFreeBeta(c, true);
            expect(b.meta.description).toBe(c.beta.metaDescription);
            expect(b.meta.description).not.toMatch(/30/);
            expect(b.hero.cta).toBe(c.beta.cta);
        }
    });

    it('leaves the copy alone when the beta is off', () => {
        expect(withFreeBeta(LANDING.cs, false)).toBe(LANDING.cs);
    });
});
