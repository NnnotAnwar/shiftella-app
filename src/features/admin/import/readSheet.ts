import { decodeCsv, parseCsv } from './importLogic';

/** Largest file we read (a member list is a few KB; this stops accidental huge uploads). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** More rows than any team needs — keeps the preview and the invite loop sane. */
export const MAX_IMPORT_ROWS = 500;

/**
 * Reads an uploaded .csv / .xlsx / .xls into a grid of strings (first sheet).
 * CSV is parsed here (handles `;` + Windows-1250 from Czech Excel); Excel goes
 * through SheetJS, loaded only now so it stays out of the main bundle.
 */
export async function readSheet(file: File): Promise<string[][]> {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
    const buffer = await file.arrayBuffer();
    const isCsv = /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv';
    let rows: string[][];
    if (isCsv) {
        rows = parseCsv(decodeCsv(buffer));
    } else {
        const XLSX = await import('xlsx');
        const book = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false });
        const sheet = book.Sheets[book.SheetNames[0]];
        if (!sheet) throw new Error('FILE_UNREADABLE');
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
        rows = grid.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
    }
    if (rows.length === 0) throw new Error('FILE_EMPTY');
    return rows.slice(0, MAX_IMPORT_ROWS + 1); // + header
}
