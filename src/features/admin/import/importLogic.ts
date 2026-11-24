/**
 * --- MEMBER IMPORT: PURE LOGIC ---
 * Everything about an Excel / CSV member import that doesn't touch React or
 * the network: CSV parsing, header auto-detection (Czech + English), row
 * validation and the plan-limit math. The modal just wires these together.
 */

export type ImportField = 'email' | 'firstName' | 'lastName' | 'fullName' | 'role';
export const IMPORT_FIELDS: readonly ImportField[] = ['email', 'firstName', 'lastName', 'fullName', 'role'];

/** Column index per field (-1 = not in the file). */
export type ColumnMapping = Record<ImportField, number>;

export const EMPTY_MAPPING: ColumnMapping = { email: -1, firstName: -1, lastName: -1, fullName: -1, role: -1 };

/** Lowercase, no diacritics, letters/digits only: "E-mailová adresa" → "emailovaadresa". */
export function normalizeHeader(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// Normalized header spellings people actually use (Czech + English exports).
const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
    email: ['email', 'mail', 'emailovaadresa', 'emailadresa', 'emailaddress', 'adresa', 'kontaktniemail', 'pracovniemail', 'workemail'],
    firstName: ['jmeno', 'krestnijmeno', 'firstname', 'first', 'givenname', 'forename', 'kjmeno'],
    lastName: ['prijmeni', 'lastname', 'last', 'surname', 'familyname'],
    fullName: ['jmenoaprijmeni', 'celejmeno', 'fullname', 'name', 'nazev', 'zamestnanec', 'employee', 'osoba', 'clen', 'member'],
    role: ['role', 'pozice', 'funkce', 'position', 'jobtitle', 'title', 'pracovnipozice', 'uroven', 'level'],
};

export const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Finds the columns in the first row. Without a recognizable header (the
 * file starts straight with data) the email column is guessed from content
 * and `hasHeader` is false, so the first row is imported too.
 */
export function detectMapping(rows: string[][]): { mapping: ColumnMapping; hasHeader: boolean } {
    const mapping: ColumnMapping = { ...EMPTY_MAPPING };
    const first = rows[0] ?? [];
    const normalized = first.map((c) => normalizeHeader(String(c ?? '')));
    let matched = 0;
    for (const field of IMPORT_FIELDS) {
        const idx = normalized.findIndex((h, i) => h !== '' && HEADER_ALIASES[field].includes(h) && !Object.values(mapping).includes(i));
        if (idx >= 0) {
            mapping[field] = idx;
            matched++;
        }
    }
    // A full-name column is only useful when there are no separate name columns.
    if (mapping.firstName >= 0 && mapping.lastName >= 0) mapping.fullName = -1;
    const firstRowHasEmail = first.some((c) => looksLikeEmail(String(c ?? '')));
    if (matched > 0 && !firstRowHasEmail) return { mapping, hasHeader: true };

    // Headerless: pick the column that holds the most emails.
    const counts = new Map<number, number>();
    for (const row of rows.slice(0, 50)) {
        row.forEach((c, i) => {
            if (looksLikeEmail(String(c ?? ''))) counts.set(i, (counts.get(i) ?? 0) + 1);
        });
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return { mapping: { ...EMPTY_MAPPING, email: best ? best[0] : -1 }, hasHeader: false };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** The delimiter used in the first line: `;` (Czech Excel), `,` or tab. */
export function detectDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const count = (ch: string) => firstLine.split(ch).length - 1;
    const candidates = [';', ',', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
    return candidates[0][1] > 0 ? candidates[0][0] : ',';
}

/** RFC 4180-ish parser: quoted fields, doubled quotes, CRLF/LF, BOM. Drops blank lines. */
export function parseCsv(input: string, delimiter = detectDelimiter(input.replace(/^\uFEFF/, ''))): string[][] {
    const text = input.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += ch;
        } else if (ch === '"' && field === '') {
            quoted = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Decodes an uploaded CSV: UTF-8 when valid, otherwise Windows-1250 (what
 * Czech Excel writes by default with "CSV (oddělený středníkem)").
 */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1250').decode(bytes);
    }
}

/** Downloadable template (UTF-8 with BOM so Excel shows the diacritics). */
export function templateCsv(language: 'en' | 'cs'): string {
    const lines =
        language === 'cs'
            ? ['E-mail;Jméno;Příjmení;Role', 'jana.novakova@example.com;Jana;Nováková;Zaměstnanec', 'petr.svoboda@example.com;Petr;Svoboda;']
            : ['Email,First name,Last name,Role', 'jane.doe@example.com,Jane,Doe,Employee', 'john.smith@example.com,John,Smith,'];
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Rows + validation
// ---------------------------------------------------------------------------

export interface RoleOption {
    id: string;
    name: string;
    base_role: string;
}

export type RowIssue = 'invalidEmail' | 'duplicate' | 'member' | null;

export interface ImportRow {
    /** 1-based line in the file (as the user sees it in Excel). */
    line: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    /** The role text from the file, as written. */
    roleText: string | null;
    /** Matched organization role; null → the chosen default role is used. */
    roleId: string | null;
    /** Role text given but not found among the roles you may assign. */
    roleNotFound: boolean;
    /** Blocking problem: the row is skipped. */
    issue: RowIssue;
}

const cell = (row: string[], idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');

/** "Jana Nováková" → ["Jana", "Nováková"]; "Nováková, Jana" → ["Jana", "Nováková"]. */
export function splitFullName(full: string): [string | null, string | null] {
    const value = full.trim().replace(/\s+/g, ' ');
    if (!value) return [null, null];
    if (value.includes(',')) {
        const [last, first] = value.split(',').map((s) => s.trim());
        return [first || null, last || null];
    }
    const i = value.indexOf(' ');
    return i < 0 ? [value, null] : [value.slice(0, i), value.slice(i + 1)];
}

/**
 * Turns the sheet into validated rows. `existingEmails` = people already in
 * the organization (lowercase). `roles` = the roles the importer may assign.
 */
export function buildRows(
    rows: string[][],
    mapping: ColumnMapping,
    hasHeader: boolean,
    existingEmails: ReadonlySet<string>,
    roles: readonly RoleOption[],
): ImportRow[] {
    const byName = new Map<string, RoleOption>();
    for (const r of roles) {
        byName.set(normalizeHeader(r.name), r);
        byName.set(normalizeHeader(r.base_role), byName.get(normalizeHeader(r.base_role)) ?? r);
    }
    const seen = new Set<string>();
    const out: ImportRow[] = [];
    rows.forEach((row, i) => {
        if (hasHeader && i === 0) return;
        if (!row.some((c) => String(c ?? '').trim() !== '')) return;
        const email = cell(row, mapping.email).toLowerCase();
        let firstName = cell(row, mapping.firstName) || null;
        let lastName = cell(row, mapping.lastName) || null;
        if (!firstName && !lastName && mapping.fullName >= 0) [firstName, lastName] = splitFullName(cell(row, mapping.fullName));
        // Only a "Jméno" column, holding the whole name → split it.
        else if (firstName && !lastName && mapping.lastName < 0 && firstName.includes(' ')) [firstName, lastName] = splitFullName(firstName);
        const roleText = cell(row, mapping.role) || null;
        const role = roleText ? byName.get(normalizeHeader(roleText)) ?? null : null;

        let issue: RowIssue = null;
        if (!looksLikeEmail(email)) issue = 'invalidEmail';
        else if (seen.has(email)) issue = 'duplicate';
        else if (existingEmails.has(email)) issue = 'member';
        if (looksLikeEmail(email)) seen.add(email);

        out.push({
            line: i + 1,
            email,
            firstName,
            lastName,
            roleText,
            roleId: role?.id ?? null,
            roleNotFound: !!roleText && !role,
            issue,
        });
    });
    return out;
}

/** How many valid rows fit under the plan's member limit (null = unlimited). */
export function limitFit(limit: number | null, currentMembers: number, importable: number): { fits: number; total: number; limited: boolean } {
    if (limit === null) return { fits: importable, total: importable, limited: false };
    const room = Math.max(0, limit - currentMembers);
    return { fits: Math.min(room, importable), total: importable, limited: importable > room };
}

export const isImportable = (row: ImportRow) => row.issue === null;
