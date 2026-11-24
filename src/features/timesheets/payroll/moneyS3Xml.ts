import type { LeaveKind } from '@features/schedule/timeOffShared';
import type { PayrollReport, PayrollRow } from './payrollAggregate';

/**
 * --- MONEY S3: "Import dat z docházkového systému" ---
 * Builds the XML Money S3 imports into Mzdy, following Solitea's published
 * schema `Schemas/Dochazka/Dochazka.xsd` (from the S3 XML schemas archive,
 * money.cz/navod/s3xmlde/). Structure, element order and enumerations below
 * mirror that XSD — see docs/payroll-export.md for the source and the steps.
 *
 *   MoneyData
 *     Obdobi { Mesic "MM", Rok }                 one period per file
 *     SeznamZamestnancu / Zamestnanec*
 *       OsobniCislo (≤10)                         pairs the employee in Money
 *       SeznamNepritomnosti / Nepritomnost*       absences (Typ codes below)
 *       Odpracovano { OdpracDnu, OdpracHodin }    work done, WITHOUT public holidays on a workday
 *       Svatky { OdpracDnu, OdpracHodin }         public holidays on a workday that were worked
 *       MzdovePriplatky { SvatkyHodin, SobotaNedeleHodin, NocHodin }
 *
 * Absence `Typ` (nepritomnostType enumeration — 0…13; the docs mention 99 but
 * the XSD does not allow it): 0 Dovolená, 1 Paragraf (Nazev e.g. "Lékař"),
 * 2 Neplacené volno, 4 Nemoc, 6 OČR, 11 Překážky na straně zaměstnavatele,
 * 12 Sick days. Kinds with no faithful code (náhradní volno, služební cesta,
 * home office, mateřská/rodičovská, jiné volno) are not sent; they are listed
 * in an XML comment per employee and stay in the Excel/CSV for manual entry.
 */

export const MONEY_ABSENCE_CODE: Partial<Record<LeaveKind, { typ: number; nazev?: string }>> = {
    vacation: { typ: 0 },
    doctor: { typ: 1, nazev: 'Lékař' },
    unpaid: { typ: 2 },
    sick: { typ: 4 },
    ocr: { typ: 6 },
    obstacle: { typ: 11 },
    sick_day: { typ: 12 },
};

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `cisloType`: decimal, ≤2 fraction digits, dot separator. */
const num = (n: number) => String(Math.round((n + Number.EPSILON) * 100) / 100);

/** XML comments may not contain "--". */
const comment = (s: string) => `<!-- ${s.replace(/-{2,}/g, '-')} -->`;

function employeeXml(r: PayrollRow, indent: string): string {
    const i1 = indent + '  ';
    const i2 = i1 + '  ';
    const i3 = i2 + '  ';
    const out: string[] = [];
    out.push(`${indent}<Zamestnanec>`);
    out.push(`${i1}${comment(r.name)}`);
    out.push(`${i1}<OsobniCislo>${esc(r.personalNumber ?? '')}</OsobniCislo>`);

    const mapped = r.absences.filter((a) => MONEY_ABSENCE_CODE[a.kind]);
    const skipped = r.absences.filter((a) => !MONEY_ABSENCE_CODE[a.kind]);
    if (mapped.length > 0) {
        out.push(`${i1}<SeznamNepritomnosti>`);
        for (const a of mapped) {
            const code = MONEY_ABSENCE_CODE[a.kind]!;
            out.push(`${i2}<Nepritomnost>`);
            out.push(`${i3}<Typ>${code.typ}</Typ>`);
            // Zacatek / Konec: the REAL start and end, even in another month (per the XSD).
            out.push(`${i3}<Zacatek><Datum>${a.startsOn}</Datum></Zacatek>`);
            out.push(`${i3}<Konec><Datum>${a.endsOn}</Datum></Konec>`);
            out.push(`${i3}<KalDnu>${a.calendarDays}</KalDnu>`);
            out.push(`${i3}<PracDnu>${a.workDays}</PracDnu>`);
            out.push(`${i3}<PracHodin>${num(a.hours)}</PracHodin>`);
            out.push(`${i3}<SvatkyDnu>${a.holidayWorkDays}</SvatkyDnu>`);
            if (code.nazev) out.push(`${i3}<Nazev>${esc(code.nazev)}</Nazev>`);
            out.push(`${i2}</Nepritomnost>`);
        }
        out.push(`${i1}</SeznamNepritomnosti>`);
    }
    if (skipped.length > 0) {
        const list = skipped.map((a) => `${a.kind} ${a.from}..${a.to} ${num(a.hours)} h`).join('; ');
        out.push(`${i1}${comment(`Shiftella: not imported, enter by hand: ${list}`)}`);
    }

    out.push(`${i1}<Odpracovano>`);
    out.push(`${i2}<OdpracDnu>${r.regularDays}</OdpracDnu>`);
    out.push(`${i2}<OdpracHodin>${num(r.workedHours - r.holidayWorkdayHours)}</OdpracHodin>`);
    out.push(`${i1}</Odpracovano>`);
    if (r.holidayWorkdayDays > 0) {
        out.push(`${i1}<Svatky>`);
        out.push(`${i2}<OdpracDnu>${r.holidayWorkdayDays}</OdpracDnu>`);
        out.push(`${i2}<OdpracHodin>${num(r.holidayWorkdayHours)}</OdpracHodin>`);
        out.push(`${i1}</Svatky>`);
    }
    out.push(`${i1}<MzdovePriplatky>`);
    out.push(`${i2}<SvatkyHodin>${num(r.holidayHours)}</SvatkyHodin>`);
    out.push(`${i2}<SobotaNedeleHodin>${num(r.weekendHours)}</SobotaNedeleHodin>`);
    out.push(`${i2}<NocHodin>${num(r.nightHours)}</NocHodin>`);
    out.push(`${i1}</MzdovePriplatky>`);
    out.push(`${indent}</Zamestnanec>`);
    return out.join('\n');
}

/**
 * The Money S3 attendance XML for a month. People without an osobní číslo
 * can't be paired, so they're left out and returned in `missing`.
 */
export function buildMoneyS3Xml(report: PayrollReport): { xml: string; included: number; missing: PayrollRow[] } {
    const [year, month] = report.month.split('-');
    const withId = report.rows.filter((r) => r.personalNumber);
    const missing = report.rows.filter((r) => !r.personalNumber);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        comment(`Shiftella - podklady pro mzdy ${report.month} (Money S3, Dochazka.xsd)`),
        '<MoneyData>',
        '  <Obdobi>',
        `    <Mesic>${month}</Mesic>`,
        `    <Rok>${year}</Rok>`,
        '  </Obdobi>',
        '  <SeznamZamestnancu>',
        ...withId.map((r) => employeeXml(r, '    ')),
        '  </SeznamZamestnancu>',
        '</MoneyData>',
        '',
    ];
    return { xml: lines.join('\n'), included: withId.length, missing };
}
