import { describe, expect, it } from 'vitest';
import {
    buildRows,
    decodeCsv,
    detectDelimiter,
    detectMapping,
    limitFit,
    normalizeHeader,
    parseCsv,
    splitFullName,
    templateCsv,
    type RoleOption,
} from './importLogic';

const ROLES: RoleOption[] = [
    { id: 'r-emp', name: 'Zaměstnanec', base_role: 'Employee' },
    { id: 'r-bar', name: 'Barista', base_role: 'Employee' },
    { id: 'r-man', name: 'Vedoucí směny', base_role: 'Manager' },
];

describe('header detection', () => {
    it('normalizes diacritics, case and punctuation', () => {
        expect(normalizeHeader(' E-mailová adresa ')).toBe('emailovaadresa');
        expect(normalizeHeader('Příjmení')).toBe('prijmeni');
    });

    it('finds Czech headers', () => {
        const { mapping, hasHeader } = detectMapping([['Příjmení', 'Jméno', 'E-mail', 'Pozice']]);
        expect(hasHeader).toBe(true);
        expect(mapping).toEqual({ email: 2, firstName: 1, lastName: 0, fullName: -1, role: 3 });
    });

    it('finds English headers and a full-name column', () => {
        const { mapping } = detectMapping([['Name', 'Email address', 'Role']]);
        expect(mapping).toMatchObject({ email: 1, fullName: 0, firstName: -1, lastName: -1, role: 2 });
    });

    it('treats a file without a header as data and guesses the email column', () => {
        const rows = [
            ['Jana', 'jana@example.com'],
            ['Petr', 'petr@example.com'],
        ];
        const { mapping, hasHeader } = detectMapping(rows);
        expect(hasHeader).toBe(false);
        expect(mapping.email).toBe(1);
    });
});

describe('CSV parsing', () => {
    it('detects the delimiter', () => {
        expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
        expect(detectDelimiter('a,b,c')).toBe(',');
        expect(detectDelimiter('a\tb')).toBe('\t');
        expect(detectDelimiter('single')).toBe(',');
    });

    it('handles BOM, quotes, doubled quotes, CRLF and blank lines', () => {
        const text = '\uFEFFE-mail;Jméno\r\n"a@x.cz";"Nováková; Jana"\r\n\r\n"b@x.cz";"Řekl ""ahoj"""\n';
        expect(parseCsv(text)).toEqual([
            ['E-mail', 'Jméno'],
            ['a@x.cz', 'Nováková; Jana'],
            ['b@x.cz', 'Řekl "ahoj"'],
        ]);
    });

    it('decodes UTF-8, and Windows-1250 from Czech Excel', () => {
        expect(decodeCsv(new TextEncoder().encode('Příjmení'))).toBe('Příjmení');
        // "Příjmení" in Windows-1250: P=50 ř=F8 í=ED j=6A m=6D e=65 n=6E í=ED
        expect(decodeCsv(new Uint8Array([0x50, 0xf8, 0xed, 0x6a, 0x6d, 0x65, 0x6e, 0xed]))).toBe('Příjmení');
    });

    it('the template round-trips through the parser + detector', () => {
        for (const lang of ['cs', 'en'] as const) {
            const rows = parseCsv(templateCsv(lang));
            const { mapping, hasHeader } = detectMapping(rows);
            expect(hasHeader).toBe(true);
            expect(mapping).toMatchObject({ email: 0, firstName: 1, lastName: 2, role: 3 });
            expect(rows).toHaveLength(3);
        }
    });
});

describe('row validation', () => {
    const sheet = [
        ['E-mail', 'Jméno', 'Příjmení', 'Role'],
        ['Jana@Example.com ', 'Jana', 'Nováková', 'barista'],
        ['not-an-email', 'X', '', ''],
        ['jana@example.com', 'Jana', 'N.', ''],
        ['boss@example.com', 'Šéf', '', ''],
        ['petr@example.com', 'Petr', 'Svoboda', 'Ředitel'],
        ['', '', '', ''],
        ['eva@example.com', '', '', 'employee'],
    ];
    const { mapping, hasHeader } = detectMapping(sheet);
    const rows = buildRows(sheet, mapping, hasHeader, new Set(['boss@example.com']), ROLES);

    it('skips the header and blank rows, keeps file line numbers', () => {
        expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 8]);
    });

    it('lowercases emails and flags bad email, duplicates and existing members', () => {
        expect(rows[0]).toMatchObject({ email: 'jana@example.com', issue: null });
        expect(rows[1].issue).toBe('invalidEmail');
        expect(rows[2].issue).toBe('duplicate');
        expect(rows[3].issue).toBe('member');
    });

    it('matches roles by name or base level, ignoring case and diacritics', () => {
        expect(rows[0]).toMatchObject({ roleId: 'r-bar', roleNotFound: false });
        expect(rows[4]).toMatchObject({ roleId: null, roleNotFound: true, roleText: 'Ředitel', issue: null });
        expect(rows[5]).toMatchObject({ roleId: 'r-emp', roleNotFound: false });
        expect(rows[2]).toMatchObject({ roleId: null, roleNotFound: false });
    });

    it('splits a full-name column, or a lone "Jméno" column holding both names', () => {
        expect(splitFullName('Nováková, Jana')).toEqual(['Jana', 'Nováková']);
        expect(splitFullName('  Jan   van  Dijk ')).toEqual(['Jan', 'van Dijk']);
        const full = [['Name', 'Email'], ['Jana Nováková', 'j@x.cz']];
        const m1 = detectMapping(full);
        expect(buildRows(full, m1.mapping, m1.hasHeader, new Set(), ROLES)[0]).toMatchObject({ firstName: 'Jana', lastName: 'Nováková' });
        const lone = [['Jméno', 'E-mail'], ['Petr Svoboda', 'p@x.cz']];
        const m2 = detectMapping(lone);
        expect(buildRows(lone, m2.mapping, m2.hasHeader, new Set(), ROLES)[0]).toMatchObject({ firstName: 'Petr', lastName: 'Svoboda' });
    });
});

describe('plan limit math', () => {
    it('unlimited plans fit everything', () => {
        expect(limitFit(null, 40, 12)).toEqual({ fits: 12, total: 12, limited: false });
    });
    it('counts the room left', () => {
        expect(limitFit(5, 2, 10)).toEqual({ fits: 3, total: 10, limited: true });
        expect(limitFit(15, 2, 10)).toEqual({ fits: 10, total: 10, limited: false });
        expect(limitFit(15, 5, 10)).toEqual({ fits: 10, total: 10, limited: false });
    });
    it('never goes negative when already over the limit', () => {
        expect(limitFit(5, 8, 3)).toEqual({ fits: 0, total: 3, limited: true });
        expect(limitFit(5, 5, 0)).toEqual({ fits: 0, total: 0, limited: false });
    });
});
