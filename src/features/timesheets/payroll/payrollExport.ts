import type { TranslationKey } from '@shared/i18n/translations';
import { KIND_KEYS } from '@features/schedule/timeOffShared';
import type { PayrollReport } from './payrollAggregate';
import { buildMoneyS3Xml } from './moneyS3Xml';

/**
 * --- PAYROLL EXPORT FILES ---
 * "Podklady pro mzdy" for the accountant:
 *   • excel — sheet 1: one row per person; sheet 2: every absence with dates
 *   • csv   — the per-person table (Czech: `;` separated, decimal comma, as
 *             Czech Excel opens it; English: `,` and a decimal point)
 *   • money — Money S3 attendance XML (see moneyS3Xml.ts)
 * Builders return the file contents; the page downloads or shares them.
 */

export type PayrollFormat = 'excel' | 'csv' | 'money';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type Cell = string | number;

export interface PayrollFile {
    fileName: string;
    mime: string;
    /** Text formats (CSV, XML). */
    text?: string;
    /** Binary formats (XLSX), base64. */
    base64?: string;
}

/** Header + body rows of the per-person table, numbers left as numbers. */
export function summaryTable(report: PayrollReport, t: Translate, showWages: boolean): { header: string[]; rows: Cell[][]; total: Cell[] } {
    const h = (key: TranslationKey) => `${t(key)} (h)`;
    const header = [
        t('payroll.colPersonalNumber'),
        t('payroll.colEmployee'),
        t('payroll.colDays'),
        h('payroll.colWorked'),
        h('payroll.colHoliday'),
        h('payroll.colWeekend'),
        h('payroll.colNight'),
        h('payroll.colBreaks'),
        ...report.kinds.map((k) => `${t(KIND_KEYS[k])} (h)`),
        h('payroll.colAbsenceTotal'),
        t('payroll.colOpenShifts'),
        ...(showWages ? [t('payroll.colRate'), t('payroll.colCurrency')] : []),
    ];
    const rows = report.rows.map((r) => [
        r.personalNumber ?? '',
        r.name,
        r.daysWorked,
        r.workedHours,
        r.holidayHours,
        r.weekendHours,
        r.nightHours,
        r.breakHours,
        ...report.kinds.map((k) => r.absenceHours[k] ?? 0),
        r.absenceTotalHours,
        r.openShifts,
        ...(showWages ? [r.rate ?? '', r.currency ?? ''] : []),
    ]);
    const sum = (f: (r: PayrollReport['rows'][number]) => number) =>
        Math.round(report.rows.reduce((a, r) => a + f(r), 0) * 100) / 100;
    const total = [
        '',
        t('overview.total'),
        sum((r) => r.daysWorked),
        sum((r) => r.workedHours),
        sum((r) => r.holidayHours),
        sum((r) => r.weekendHours),
        sum((r) => r.nightHours),
        sum((r) => r.breakHours),
        ...report.kinds.map((k) => sum((r) => r.absenceHours[k] ?? 0)),
        sum((r) => r.absenceTotalHours),
        sum((r) => r.openShifts),
        ...(showWages ? ['', ''] : []),
    ];
    return { header, rows, total };
}

/** One row per absence (dates as recorded + the part in the month). */
export function absenceTable(report: PayrollReport, t: Translate): { header: string[]; rows: Cell[][] } {
    const header = [
        t('payroll.colPersonalNumber'),
        t('payroll.colEmployee'),
        t('payroll.colKind'),
        t('payroll.colFrom'),
        t('payroll.colTo'),
        t('payroll.colInMonthFrom'),
        t('payroll.colInMonthTo'),
        t('payroll.colCalendarDays'),
        t('payroll.colWorkDays'),
        `${t('payroll.colHours')} (h)`,
    ];
    const rows = report.rows.flatMap((r) =>
        r.absences.map((a) => [
            r.personalNumber ?? '',
            r.name,
            t(KIND_KEYS[a.kind]),
            a.startsOn,
            a.endsOn,
            a.from,
            a.to,
            a.calendarDays,
            a.workDays,
            a.hours,
        ]),
    );
    return { header, rows };
}

/** CSV text. `czech` picks `;` + decimal comma (what Czech Excel expects). */
export function payrollCsv(report: PayrollReport, t: Translate, showWages: boolean, czech: boolean): string {
    const sep = czech ? ';' : ',';
    const cell = (v: Cell) => {
        const s = typeof v === 'number' ? (czech ? String(v).replace('.', ',') : String(v)) : v;
        return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const { header, rows, total } = summaryTable(report, t, showWages);
    const lines = [header, ...rows, total].map((r) => r.map(cell).join(sep));
    // UTF-8 BOM so Excel reads Czech names correctly.
    return '﻿' + lines.join('\r\n') + '\r\n';
}

function stem(t: Translate, month: string): string {
    return `${t('payroll.fileStem')}_${month}`.replace(/[^\w-]+/g, '_');
}

async function payrollXlsx(report: PayrollReport, t: Translate, showWages: boolean): Promise<string> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const s = summaryTable(report, t, showWages);
    const title = `${t('payroll.title')} — ${report.month}`;
    const ws1 = XLSX.utils.aoa_to_sheet([[title], [t('payroll.legend')], [], s.header, ...s.rows, s.total]);
    ws1['!cols'] = s.header.map((_, i) => ({ wch: i === 1 ? 24 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws1, t('payroll.sheetSummary').slice(0, 31));

    const a = absenceTable(report, t);
    const ws2 = XLSX.utils.aoa_to_sheet([a.header, ...a.rows]);
    ws2['!cols'] = a.header.map((_, i) => ({ wch: i === 1 || i === 2 ? 22 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws2, t('payroll.sheetAbsences').slice(0, 31));

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    let bin = '';
    for (const byte of new Uint8Array(buffer)) bin += String.fromCharCode(byte);
    return btoa(bin);
}

/** Build the file for a format. Money S3 also reports who had no osobní číslo. */
export async function buildPayrollFile(
    format: PayrollFormat,
    report: PayrollReport,
    t: Translate,
    opts: { showWages: boolean; czech: boolean },
): Promise<{ file: PayrollFile; missing: string[] }> {
    const name = stem(t, report.month);
    if (format === 'csv') {
        return {
            file: { fileName: `${name}.csv`, mime: 'text/csv;charset=utf-8', text: payrollCsv(report, t, opts.showWages, opts.czech) },
            missing: [],
        };
    }
    if (format === 'money') {
        const { xml, missing } = buildMoneyS3Xml(report);
        return {
            file: { fileName: `${name}_MoneyS3.xml`, mime: 'application/xml;charset=utf-8', text: xml },
            missing: missing.map((r) => r.name),
        };
    }
    return {
        file: {
            fileName: `${name}.xlsx`,
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            base64: await payrollXlsx(report, t, opts.showWages),
        },
        missing: [],
    };
}
