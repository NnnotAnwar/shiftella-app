import { useState } from 'react';
import { FileXlsIcon, FileCsvIcon, FileCodeIcon } from '@phosphor-icons/react';

import { Modal } from '@features/admin/components/Modal';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { useAuthContext } from '@features/auth/AuthContext';
import { can } from '@shared/auth/permissions';
import { useEntitlements } from '@features/billing/useBilling';
import { usePreferences, useTranslation } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import { saveOrShareFile } from '@shared/utils/shareExport';
import type { Profile } from '@shared/types';
import { timesheetService } from '../timesheetService';
import { scheduleService } from '@features/schedule/scheduleService';
import { holidayService } from '@features/schedule/holidays/holidayService';
import { wageService } from '@features/wages/wageService';
import { buildPayrollReport, monthRange, type PayrollWage } from './payrollAggregate';
import { buildPayrollFile, type PayrollFormat } from './payrollExport';

/**
 * --- PAYROLL EXPORT ("Podklady pro mzdy") ---
 * One dialog, three one-tap downloads for the month: Excel (any accountant),
 * CSV, and the Money S3 attendance XML. Money pairs people by osobní číslo,
 * which Shiftella doesn't store yet — the admin types them once here and they
 * stay on this device (localStorage, per organization).
 *
 * Permissions: the page is timesheets.view; time off comes through RLS
 * (requests/rota read); hourly rates only for wages.edit holders on a plan
 * with wages — RLS still decides which rates come back.
 */

const idsKey = (orgId: string) => `payroll-personal-numbers:${orgId}`;

function readIds(orgId: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(idsKey(orgId)) ?? '{}') as Record<string, string>;
    } catch {
        return {};
    }
}

function memberName(m: Profile): string {
    return [m.first_name, m.last_name].filter(Boolean).join(' ') || m.username;
}

export function PayrollExportModal({ month, members, onClose }: { month: string; members: Profile[]; onClose: () => void }) {
    const { user } = useAuthContext();
    const t = useTranslation();
    const { language } = usePreferences();
    const ent = useEntitlements();
    const orgId = user?.organization_id ?? 'none';
    const [ids, setIds] = useState<Record<string, string>>(() => readIds(orgId));
    const [busy, setBusy] = useState<PayrollFormat | null>(null);
    const showWages = !!user && can(user, 'wages.edit') && ent.can('wages');

    const setId = (userId: string, value: string) => {
        const next = { ...ids, [userId]: value.slice(0, 10) };
        if (!next[userId].trim()) delete next[userId];
        setIds(next);
        localStorage.setItem(idsKey(orgId), JSON.stringify(next));
    };

    const run = async (format: PayrollFormat) => {
        setBusy(format);
        try {
            const { first, last } = monthRange(month);
            const [shifts, timeOff, wages] = await Promise.all([
                timesheetService.getMonthShifts(month),
                scheduleService.getTimeOff(first, last),
                showWages && user ? wageService.getForOrg(user.organization_id) : Promise.resolve([]),
            ]);
            // Holidays over every absence's whole range (cross-month leave is split by working days).
            const from = timeOff.reduce((a, x) => (x.starts_on < a ? x.starts_on : a), first);
            const to = timeOff.reduce((a, x) => (x.ends_on > a ? x.ends_on : a), last);
            const holidays = await holidayService.getHolidays(from, to);

            const report = buildPayrollReport({
                month,
                people: members.map((m) => ({ id: m.id, name: memberName(m), personalNumber: ids[m.id] ?? null })),
                shifts,
                timeOff,
                holidays: new Set(holidays.map((h) => h.holiday_date)),
                wages: showWages
                    ? new Map<string, PayrollWage>(wages.map((w) => [w.user_id, { rate: w.hourly_rate, currency: w.currency }]))
                    : null,
            });
            if (report.rows.length === 0) {
                toast(t('payroll.empty', { month }), 'info');
                return;
            }
            // cs / sk / uk Excel all expect ';' + decimal comma; only English gets ',' + '.'.
            const { file, missing } = await buildPayrollFile(format, report, t, { showWages, czech: language !== 'en' });
            if (format === 'money' && missing.length === report.rows.length) {
                toast(t('payroll.missingNumbers', { names: missing.join(', ') }), 'error');
                return;
            }
            await saveOrShareFile(file, `${t('payroll.title')} — ${month}`);
            if (missing.length > 0) toast(t('payroll.missingNumbers', { names: missing.join(', ') }), 'info');
            else toast(t('payroll.done'), 'success');
        } catch (e) {
            toast(e instanceof Error ? e.message : t('common.actionFailed'), 'error');
        } finally {
            setBusy(null);
        }
    };

    const sorted = [...members].sort((a, b) => memberName(a).localeCompare(memberName(b), 'cs'));

    return (
        <Modal title={t('payroll.title')} subtitle={t('payroll.subtitle', { month })} onClose={onClose}>
            <div className="space-y-3">
                <div className="grid gap-2">
                    <Button variant="primary" size="md" icon={FileXlsIcon} loading={busy === 'excel'} disabled={!!busy} onClick={() => run('excel')}>
                        {t('payroll.excel')}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="md" icon={FileCsvIcon} loading={busy === 'csv'} disabled={!!busy} onClick={() => run('csv')}>
                            {t('payroll.csv')}
                        </Button>
                        <Button variant="secondary" size="md" icon={FileCodeIcon} loading={busy === 'money'} disabled={!!busy} onClick={() => run('money')}>
                            {t('payroll.money')}
                        </Button>
                    </div>
                </div>
                <p className="text-caption text-ink-soft dark:text-slate-400">{t('payroll.pohodaHint')}</p>

                <section className="space-y-2 pt-1">
                    <div>
                        <h3 className="text-small-strong text-ink dark:text-white">{t('payroll.personalNumbers')}</h3>
                        <p className="text-caption text-ink-soft dark:text-slate-400">{t('payroll.moneyHint')}</p>
                    </div>
                    <ul className="max-h-64 overflow-y-auto divide-y divide-ink/5 dark:divide-white/6 -mx-1 px-1">
                        {sorted.map((m) => (
                            <li key={m.id} className="flex items-center gap-3 py-1.5">
                                <label htmlFor={`pn-${m.id}`} className="flex-1 min-w-0 truncate text-small text-ink dark:text-slate-200">
                                    {memberName(m)}
                                </label>
                                <Input
                                    id={`pn-${m.id}`}
                                    className="w-28! h-9 text-right tabular-nums"
                                    maxLength={10}
                                    inputMode="text"
                                    autoComplete="off"
                                    value={ids[m.id] ?? ''}
                                    onChange={(e) => setId(m.id, e.target.value)}
                                    placeholder="—"
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </Modal>
    );
}
