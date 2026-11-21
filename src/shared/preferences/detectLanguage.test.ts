import { describe, it, expect } from 'vitest';
import { detectLanguage } from './detectLanguage';

describe('detectLanguage (first-visit default)', () => {
    it('Czech and Slovak browsers get Czech', () => {
        expect(detectLanguage(['cs-CZ', 'en'])).toBe('cs');
        expect(detectLanguage(['cs'])).toBe('cs');
        expect(detectLanguage(['sk-SK'])).toBe('cs');
        expect(detectLanguage(['SK'])).toBe('cs');
    });

    it('everyone else gets English', () => {
        expect(detectLanguage(['en-US'])).toBe('en');
        expect(detectLanguage(['de-DE', 'cs'])).toBe('en'); // the first preference wins
        expect(detectLanguage(['uk'])).toBe('en');
    });

    it('falls back to English without any language', () => {
        expect(detectLanguage([])).toBe('en');
        expect(detectLanguage(undefined)).toBe('en');
        expect(detectLanguage(null)).toBe('en');
    });
});
