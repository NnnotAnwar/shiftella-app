import { describe, expect, it } from 'vitest';
import { en, cs } from '@shared/i18n/translations';
import { DOC_TYPES, daysUntil, docMime, docTypeKey, expiryState, nameFromFile, validateDocFile, MAX_DOC_BYTES } from './documentTypes';

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('document rules', () => {
    it('accepts PDFs and photos up to 10 MB, nothing else', () => {
        expect(validateDocFile(file('smlouva.pdf', 'application/pdf'))).toBeNull();
        expect(validateDocFile(file('prukaz.jpg', 'image/jpeg'))).toBeNull();
        // iPhone photos often come without a type.
        expect(validateDocFile(file('IMG_0001.HEIC', ''))).toBeNull();
        expect(docMime(file('IMG_0001.HEIC', ''))).toBe('image/heic');
        expect(validateDocFile(file('macro.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('docs.errType');
        expect(validateDocFile(file('virus.exe', ''))).toBe('docs.errType');
        expect(validateDocFile(file('big.pdf', 'application/pdf', MAX_DOC_BYTES + 1))).toBe('docs.errTooBig');
        expect(validateDocFile(file('empty.pdf', 'application/pdf', 0))).toBe('docs.errType');
    });

    it('names a document after its file', () => {
        expect(nameFromFile('Zdravotni_prukaz_2026.pdf')).toBe('Zdravotni prukaz 2026');
        expect(nameFromFile('scan')).toBe('scan');
    });

    it('expiry chip state: amber within 30 days, red once expired', () => {
        const today = '2026-11-25';
        expect(expiryState(null, today)).toBeNull();
        expect(expiryState('2027-02-03', today)).toBe('ok');
        expect(expiryState('2026-12-25', today)).toBe('soon'); // 30 days
        expect(expiryState('2026-12-26', today)).toBe('ok'); // 31 days
        expect(expiryState('2026-11-25', today)).toBe('today');
        expect(expiryState('2026-11-24', today)).toBe('expired');
        // Across the spring time change: still whole days.
        expect(daysUntil('2027-03-29', '2027-03-27')).toBe(2);
    });

    it('every type is translated in both languages', () => {
        for (const d of DOC_TYPES) {
            expect(en).toHaveProperty([docTypeKey(d)]);
            expect(cs).toHaveProperty([docTypeKey(d)]);
        }
        expect(docTypeKey('nonsense')).toBe('docs.type.other');
    });
});
