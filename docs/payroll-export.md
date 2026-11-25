# Payroll export — "Podklady pro mzdy"

Timesheets → the calculator button (list view, a month picked) → **Podklady pro mzdy**.
One file per month for the accountant, three formats:

| Format | For | Import |
| --- | --- | --- |
| **Excel** (`Podklady_mzdy_YYYY-MM.xlsx`) | any accountant / payroll program | read by a person; sheet 1 one row per person, sheet 2 every absence with dates |
| **CSV** (same table as sheet 1) | spreadsheets, scripts | Czech UI: `;` + decimal comma (Czech Excel); English UI: `,` + decimal point; UTF-8 with BOM |
| **Money S3 (XML)** (`…_MoneyS3.xml`) | Money S3 Mzdy | direct import, see below |
| POHODA | — | **no direct import** in the Czech version, see below; use the Excel |

Code: `src/features/timesheets/payroll/` — `payrollAggregate.ts` (the numbers, unit-tested),
`moneyS3Xml.ts`, `payrollExport.ts`, `PayrollExportModal.tsx`.

## What is in it (per person, the month)

- **Odpracováno (h)** — clocked hours net of breaks (the app's rule: 30 min per started 6 h,
  `calculateNetHours`), **days worked** (distinct days a shift started).
- **z toho svátek / So–Ne / noc 22–6** — "of which" parts for the surcharges of §115, §118 and §116
  zákoník práce (night work = 22:00–06:00, §2 písm. b ZP). Each is the clocked overlap scaled by the
  shift's net/gross ratio — the same method the DB uses for the náhradní volno bank
  (`_holiday_hours_worked`). They may overlap (a night shift on a Saturday holiday counts in all three).
- **Přestávky (h)**, **Neukončené směny** (still running — left out of the hours, counted so the
  accountant can ask).
- **Absences by type (h)** — approved `time_off` only, all 12 kinds; hours are the row's `hours`
  (the DB fills them from the rota or weekly hours / 5; see `20261124200000_leave_types_and_balances.sql`).
  An absence that crosses the month edge is clipped to the month, its hours split by working days
  (Mon–Fri, not a public holiday) on each side, or by calendar days when it has none.
- **Hodinová sazba + měna** — only when the viewer holds `wages.edit` and the plan has wages; RLS on
  `member_wages` still decides which rates come back.

Rules: a shift belongs to the month it **started** in (as on the signed timesheet). Times are the
device's local time (Czech teams: Europe/Prague). Public holidays come from `public_holidays`.

Permissions: the page needs `timesheets.view`. Time off is read through RLS (`requests` or `rota`
read) — a custom role without either gets no absence columns.

## Osobní číslo (personal number)

Payroll programs pair people by their personal number. It is stored on the member, in
`member_payroll` (migration `20261125120000_member_personal_number.sql`), not in `profiles`
(profiles are readable by the whole organization):

- **Where to enter it:** Team → edit employee → *Osobní číslo*, or straight in the payroll dialog
  (saved when the field loses focus). Max 10 characters (the Money S3 limit), unique per organization
  (`PERSONAL_NUMBER_TAKEN`).
- **Who:** read — the member, Timesheets VIEW or Team VIEW in the org; write — only
  `set_member_personal_number()`: Team CHANGE (`members.write`) over people below you, a Head Admin
  also for themself, Superadmin always. Others see the number read-only in the dialog.
- Every change writes `personal_number_changed` to the Activity Log (old → new).
- It appears in the Excel/CSV and is required for the Money S3 XML. People without one are left out
  of the XML and named in a toast.

## Money S3 — direct import

**Source:** Solitea's XML schema archive, linked from <https://money.cz/navod/s3xmlde/> →
`schemas.zip` (`https://money.cz/wp-content/uploads/2026/11/schemas.zip`, files dated 2024-09-30),
file **`Schemas/Dochazka/Dochazka.xsd`** — "Schéma popisuje strukturu XML dokumentu určeného pro
import dat z docházkového systému do programu Money." Our output validates against it
(`xmllint --schema Dochazka.xsd`).

What we fill:

```
MoneyData
  Obdobi / Mesic "MM", Rok              — one period per file
  SeznamZamestnancu / Zamestnanec
    OsobniCislo                          — pairs the employee (max 10)
    SeznamNepritomnosti / Nepritomnost   — Typ, Zacatek/Datum + Konec/Datum (the REAL dates, may be
                                           another month — the XSD asks for that), KalDnu, PracDnu,
                                           PracHodin, SvatkyDnu (all for the processed month), Nazev
    Odpracovano / OdpracDnu, OdpracHodin — work WITHOUT public holidays falling on a workday (XSD wording)
    Svatky / OdpracDnu, OdpracHodin      — public holidays on a workday that were worked
    MzdovePriplatky / SvatkyHodin, SobotaNedeleHodin, NocHodin
```

Absence `Typ` mapping (the XSD's `nepritomnostType` enumeration is 0–13; its documentation also
mentions 99 "Jiná nepřítomnost" but the enumeration rejects it, so we never send 99):

| Shiftella | Money S3 `Typ` |
| --- | --- |
| Dovolená (`vacation`) | 0 Dovolená |
| Lékař (`doctor`) | 1 Paragraf, `Nazev` "Lékař" (the XSD's own example) |
| Neplacené volno (`unpaid`) | 2 Neplacené volno |
| Nemoc (`sick`) | 4 Nemoc (včetně úrazu) |
| OČR (`ocr`) | 6 OČR |
| Překážka na straně zaměstnavatele (`obstacle`) | 11 Překážky na straně zaměstnavatele |
| Sick day (`sick_day`) | 12 Sick days |
| Náhradní volno, Služební cesta, Home office, Mateřská/rodičovská, Jiné volno | **not sent** — listed in an XML comment per employee; enter by hand from the Excel |

Not sent: `PracovniFond` (Shiftella has no contractual fund), `PrescasHodin` (overtime needs the
contract's fund — the accountant decides), `PracPomer_ID` (one employment per person assumed; Money
then pairs by `OsobniCislo`).

**Steps in Money S3** (from Solitea's pages and attendance vendors' guides; menu wording differs
between versions — check in your version):

1. In Personalistika, each employee's osobní číslo must match the number typed in Shiftella.
2. Mzdy (Money S3 with the payroll module) → the attendance import ("Import z docházkového systému" /
   XML import of Mzdy) → choose the `…_MoneyS3.xml` file. Money's base package imports its native XML;
   the **XMLDE** module is only needed for custom XSLT transformations
   (<https://money.cz/navod/money-s3-prevody-dat/>).
3. Check the imported attendance in each employee's wage for the month, add the kinds listed in the
   XML comments by hand.

## POHODA — no direct import (Czech version)

- Stormware's Czech XML import list (<https://www.stormware.cz/pohoda/xml/dokladyimport/>) has **no
  payroll ("Mzdové agendy") section**.
- The Slovak list (<https://www.stormware.sk/pohoda/xml/dokladyimport/>) has "Mzdové agendy":
  `absence.xsd` (Pracovné pomery → Neprítomnosť), `wageElements.xsd` (Mzdy → príplatky as the
  company's own wage elements) and `workLoad.xsd` (individual daily schedule). The shared
  `type.xsd` marks the Pracovní poměry agenda **"(pouze SK verze)"**
  (<https://www.stormware.sk/xml/schema/version_2/type.xsd>). Stormware's attendance-system import
  for Czech customers is documented for **PAMICA** (a separate payroll product), not POHODA.
- So for a Czech POHODA we **do not generate an XML** (a "Pohoda" file that Czech POHODA can't read
  would be fake). The accountant uses the Excel: per person, type Odpracováno (dny/hodiny), the
  svátek / So–Ne / noc hours into the wage's příplatky and the absences into Mzdy for the month.
- If a Slovak-POHODA customer appears: `absence.xsd` + `wageElements.xsd` are the documented path
  (Windows-1250 samples under `https://www.stormware.sk/xml/samples/version_2/import/`); wage-element
  names must match the company's own setup.

## Checked

- Unit tests: `payrollAggregate.test.ts` (night / weekend / holiday splits incl. a night shift into a
  holiday and a holiday on Saturday, month attribution, open shifts, cross-month and weekend-only
  absences, pending ignored, Money S3 codes and Odpracováno/Svátky split, CSV separators).
- Money S3 output validated with `xmllint` against `Dochazka.xsd`.
- Demo app (screenshot harness, fake Supabase): all three files download.

Sources read 2026-11-24.
