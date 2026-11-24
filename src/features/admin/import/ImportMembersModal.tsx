import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { DownloadSimpleIcon, FileArrowUpIcon, PaperPlaneTiltIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { useOrgRoles } from '@features/roles/useOrgRoles';
import { billingKeys, useEntitlements, useUpgradeNudge } from '@features/billing/useBilling';
import { isSuperAdmin as isSuper, rankOf } from '@shared/auth/permissions';
import { usePreferences, useTranslation } from '@shared/preferences/PreferencesContext';
import type { TranslationKey } from '@shared/i18n/translations';
import { Button } from '@shared/components/Button';
import { Select } from '@shared/components/Select';
import { FormError } from '@shared/components/FormError';
import { toast } from '@shared/toast/toastStore';
import { shareNative } from '@shared/utils/shareExport';
import { Modal } from '../components/Modal';
import { Field } from '../components/FormControls';
import { useAdminContext } from '../AdminContext';
import { adminService, FunctionError } from '../adminService';
import {
    buildRows,
    detectMapping,
    EMPTY_MAPPING,
    IMPORT_FIELDS,
    isImportable,
    limitFit,
    templateCsv,
    type ColumnMapping,
    type ImportField,
    type ImportRow,
} from './importLogic';
import { MAX_IMPORT_ROWS, readSheet } from './readSheet';

type SendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'overLimit';
interface RowResult {
    status: SendStatus;
    error?: string;
}

const STATUS_STYLE: Record<SendStatus | 'issue' | 'ready', string> = {
    ready: 'text-emerald-700 dark:text-emerald-300',
    pending: 'text-ink-soft dark:text-slate-400',
    sending: 'text-ink-soft dark:text-slate-400',
    sent: 'text-emerald-700 dark:text-emerald-300',
    failed: 'text-rose-600 dark:text-rose-400',
    skipped: 'text-ink-soft dark:text-slate-400',
    overLimit: 'text-amber-700 dark:text-amber-400',
    issue: 'text-rose-600 dark:text-rose-400',
};

const FILE_ERRORS: Record<string, TranslationKey> = {
    FILE_TOO_LARGE: 'import.err.tooLarge',
    FILE_EMPTY: 'import.err.empty',
};

/**
 * --- IMPORT MEMBERS (Excel / CSV) ---
 * Pick a file → check the detected columns and the preview (bad emails,
 * duplicates, people already in the team, unknown roles fall back to a
 * default role, plan limit "X of Y fit") → invites go out one by one through
 * the invite-employee Edge Function, with a per-row result and a retry for
 * the failed ones. No new server endpoint.
 */
export function ImportMembersModal({ onClose }: { onClose: () => void }) {
    const t = useTranslation();
    const { language } = usePreferences();
    const { user } = useAuthContext();
    const { adminData, isSuperAdmin } = useAdminContext();
    const qc = useQueryClient();
    const ent = useEntitlements();
    const nudge = useUpgradeNudge();

    const ownOrgId = user?.organization_id ?? '';
    const [organizationId, setOrganizationId] = useState(adminData?.[0]?.id ?? ownOrgId);
    const targetOrg = isSuperAdmin ? organizationId : ownOrgId;

    // Roles below yours, lowest first (same rule as the single invite form).
    const orgRoles = useOrgRoles(targetOrg);
    const myRank = user ? (isSuper(user) ? 1000 : rankOf(user)) : -1;
    const roleOptions = useMemo(
        () => orgRoles.roles.filter((r) => r.sort < myRank).sort((a, b) => a.sort - b.sort),
        [orgRoles.roles, myRank],
    );
    const [pickedDefaultRole, setPickedDefaultRole] = useState('');
    const defaultRoleId = roleOptions.some((r) => r.id === pickedDefaultRole) ? pickedDefaultRole : (roleOptions[0]?.id ?? '');
    const defaultRole = roleOptions.find((r) => r.id === defaultRoleId);

    const fileInput = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [sheet, setSheet] = useState<string[][] | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
    const [hasHeader, setHasHeader] = useState(true);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [results, setResults] = useState<Record<number, RowResult>>({});
    const [running, setRunning] = useState(false);
    const stopRef = useRef(false);
    const started = Object.keys(results).length > 0;

    const org = adminData?.find((o) => o.id === targetOrg);
    const existingEmails = useMemo(
        () => new Set((org?.profiles ?? []).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean)),
        [org],
    );
    const rows = useMemo(
        () => (sheet ? buildRows(sheet, mapping, hasHeader, existingEmails, roleOptions) : []),
        [sheet, mapping, hasHeader, existingEmails, roleOptions],
    );
    const importable = rows.filter(isImportable);
    // Plan limit: your own org only (a Superadmin isn't limited, and doesn't see other orgs' usage).
    const ownOrg = targetOrg === ownOrgId;
    const limit = ent.bypass || !ownOrg ? null : ent.limits.members;
    const fit = limitFit(limit, ent.usage?.members ?? org?.profiles.length ?? 0, importable.length);
    const sendable = importable.slice(0, fit.fits);

    // Column labels for the mapping selects: the header text, or "Column B".
    const columns = useMemo(() => {
        const width = Math.max(0, ...(sheet ?? []).slice(0, 20).map((r) => r.length));
        return Array.from({ length: width }, (_, i) => {
            const letter = String.fromCharCode(65 + (i % 26));
            const head = hasHeader ? String(sheet?.[0]?.[i] ?? '').trim() : '';
            return { index: i, label: head ? `${letter} · ${head}` : letter };
        });
    }, [sheet, hasHeader]);

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setReading(true);
        setError(null);
        try {
            const grid = await readSheet(file);
            const detected = detectMapping(grid);
            setSheet(grid);
            setMapping(detected.mapping);
            setHasHeader(detected.hasHeader);
            setFileName(file.name);
            setResults({});
        } catch (e) {
            const code = e instanceof Error ? e.message : '';
            setError(t(FILE_ERRORS[code] ?? 'import.err.unreadable'));
        } finally {
            setReading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const downloadTemplate = async () => {
        const csv = templateCsv(language);
        const stem = language === 'cs' ? 'sablona-import-clenu' : 'member-import-template';
        if (Capacitor.isNativePlatform() && (await shareNative('csv', stem, t('import.template'), { text: csv }))) return;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${stem}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const setStatus = (line: number, r: RowResult) => setResults((prev) => ({ ...prev, [line]: r }));

    /** Invites `list` one by one; stops on the plan limit or "Stop". */
    const send = async (list: ImportRow[], overLimit: ImportRow[] = []) => {
        if (list.length === 0 && overLimit.length === 0) return;
        stopRef.current = false;
        setRunning(true);
        setResults((prev) => {
            const next = { ...prev };
            for (const r of list) next[r.line] = { status: 'pending' };
            for (const r of overLimit) next[r.line] = { status: 'overLimit' };
            return next;
        });
        let sent = 0;
        let failed = 0;
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (stopRef.current) {
                for (const rest of list.slice(i)) setStatus(rest.line, { status: 'skipped' });
                break;
            }
            setStatus(row.line, { status: 'sending' });
            const role = roleOptions.find((r) => r.id === row.roleId) ?? defaultRole;
            try {
                await adminService.inviteEmployee({
                    email: row.email,
                    organization_id: targetOrg,
                    role: role?.base_role ?? 'Employee',
                    org_role_id: role?.id,
                    first_name: row.firstName,
                    last_name: row.lastName,
                    language,
                });
                sent++;
                setStatus(row.line, { status: 'sent' });
            } catch (e) {
                if (e instanceof FunctionError && e.code === 'PLAN_LIMIT_MEMBERS') {
                    for (const rest of list.slice(i)) setStatus(rest.line, { status: 'overLimit' });
                    nudge('members');
                    break;
                }
                failed++;
                setStatus(row.line, { status: 'failed', error: e instanceof Error ? e.message : t('admin.inviteSendError') });
            }
        }
        setRunning(false);
        if (overLimit.length > 0 && sent > 0) nudge('members');
        if (sent > 0) toast(t('import.doneToast', { n: sent }), 'success');
        qc.invalidateQueries({ queryKey: ['admin'] });
        qc.invalidateQueries({ queryKey: billingKeys.all });
        adminService.logMembersImported(targetOrg, sent, failed).catch(() => undefined);
    };

    const start = () => {
        if (mapping.email < 0) return setError(t('import.noEmailColumn'));
        setError(null);
        if (sendable.length === 0 && fit.limited) return nudge('members');
        void send(sendable, importable.slice(fit.fits));
    };

    const failedRows = rows.filter((r) => results[r.line]?.status === 'failed');
    const count = (s: SendStatus) => rows.filter((r) => results[r.line]?.status === s).length;
    const processed = rows.filter((r) => ['sent', 'failed', 'skipped', 'overLimit'].includes(results[r.line]?.status ?? '')).length;
    const queued = rows.filter((r) => results[r.line]).length;

    const close = () => {
        stopRef.current = true;
        onClose();
    };

    const showOrgSelect = isSuperAdmin && (adminData?.length ?? 0) > 1 && !started;

    return (
        <Modal title={t('import.title')} subtitle={t('import.subtitle')} onClose={close} wide>
            <div className="space-y-3">
                {showOrgSelect && (
                    <Field label={t('profile.field.organization')}>
                        <Select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} size="sm" fullWidth>
                            {adminData?.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}

                {/* FILE */}
                {!started && (
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            className="hidden"
                            onChange={(e) => onFile(e.target.files?.[0])}
                        />
                        <Button size="sm" variant={sheet ? 'secondary' : 'primary'} icon={FileArrowUpIcon} loading={reading} onClick={() => fileInput.current?.click()}>
                            {reading ? t('import.reading') : t('import.pick')}
                        </Button>
                        <Button size="sm" variant="ghost" icon={DownloadSimpleIcon} onClick={downloadTemplate}>
                            {t('import.template')}
                        </Button>
                        {fileName && (
                            <span className="text-caption text-ink-soft dark:text-slate-400 truncate min-w-0">
                                {fileName} · {t('import.rows', { n: rows.length })}
                            </span>
                        )}
                    </div>
                )}
                {!sheet && <p className="text-caption text-ink-soft dark:text-slate-400">{t('import.pickHint')}</p>}

                {/* COLUMNS + DEFAULT ROLE */}
                {sheet && !started && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {IMPORT_FIELDS.map((field: ImportField) => (
                            <Field key={field} label={`${t(`import.col.${field}` as TranslationKey)}${field === 'email' ? ' *' : ''}`}>
                                <Select
                                    size="sm"
                                    fullWidth
                                    value={String(mapping[field])}
                                    onChange={(e) => setMapping((m) => ({ ...m, [field]: Number(e.target.value) }))}
                                >
                                    <option value="-1">{t('import.col.none')}</option>
                                    {columns.map((c) => (
                                        <option key={c.index} value={String(c.index)}>
                                            {c.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        ))}
                        <Field label={t('import.defaultRole')}>
                            <Select size="sm" fullWidth value={defaultRoleId} onChange={(e) => setPickedDefaultRole(e.target.value)}>
                                {roleOptions.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                )}

                {/* SUMMARY */}
                {sheet && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                        {!started ? (
                            <>
                                <span className={STATUS_STYLE.ready}>{t('import.ready', { n: importable.length })}</span>
                                {rows.length - importable.length > 0 && (
                                    <span className={STATUS_STYLE.issue}>{t('import.skippedCount', { n: rows.length - importable.length })}</span>
                                )}
                                {limit !== null && (
                                    <span className={fit.limited ? STATUS_STYLE.overLimit : 'text-ink-soft dark:text-slate-400'}>
                                        {t('import.fit', { fits: fit.fits, total: fit.total })}
                                    </span>
                                )}
                                {rows.some((r) => r.roleNotFound && !r.issue) && (
                                    <span className="text-ink-soft dark:text-slate-400">{t('import.defaultRoleHint')}</span>
                                )}
                            </>
                        ) : running ? (
                            <span className="text-ink-soft dark:text-slate-400">{t('import.sending', { done: processed, total: queued })}</span>
                        ) : (
                            <span className="text-ink dark:text-white font-semibold">
                                {t('import.summary', { sent: count('sent'), failed: count('failed'), skipped: count('skipped') + count('overLimit') })}
                            </span>
                        )}
                    </div>
                )}
                {running && (
                    <div className="h-1 rounded-full bg-ink/5 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={queued} aria-valuenow={processed}>
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${queued ? (processed / queued) * 100 : 0}%` }} />
                    </div>
                )}

                {/* ROWS */}
                {rows.length > 0 && (
                    <ul className="max-h-72 overflow-y-auto rounded-xl ring-1 ring-ink/5 dark:ring-white/6 divide-y divide-ink/5 dark:divide-white/6">
                        {rows.map((r) => {
                            const res = results[r.line];
                            const roleName = r.roleId ? roleOptions.find((o) => o.id === r.roleId)?.name : null;
                            const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
                            const status = res
                                ? { label: t(`import.status.${res.status === 'sending' ? 'pending' : res.status}` as TranslationKey), cls: STATUS_STYLE[res.status] }
                                : r.issue
                                  ? { label: t(`import.issue.${r.issue}` as TranslationKey), cls: STATUS_STYLE.issue }
                                  : null;
                            return (
                                <li key={r.line} className={`px-3 py-1.5 ${r.issue && !res ? 'opacity-60' : ''}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-caption tabular-nums text-gray-400 w-6 shrink-0">{r.line}</span>
                                        <span className="text-meta text-ink dark:text-white truncate min-w-0 flex-1">{r.email || '—'}</span>
                                        {status && <span className={`text-caption font-semibold shrink-0 ${status.cls}`}>{res?.status === 'sending' ? t('common.working') : status.label}</span>}
                                    </div>
                                    {(name || r.roleText || defaultRole || res?.error) && (
                                        <p className="pl-8 text-caption text-ink-soft dark:text-slate-400 truncate">
                                            {[
                                                name,
                                                roleName ?? (r.roleNotFound ? `${r.roleText}: ${t('import.roleFallback', { role: defaultRole?.name ?? '' })}` : defaultRole?.name),
                                                res?.error,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {sheet && rows.length >= MAX_IMPORT_ROWS && <p className="text-caption text-amber-700 dark:text-amber-400">{t('import.maxRows', { n: MAX_IMPORT_ROWS })}</p>}

                <FormError message={error} />

                {/* ACTIONS */}
                <div className="flex gap-2 pt-1">
                    {running ? (
                        <Button type="button" variant="secondary" fullWidth onClick={() => (stopRef.current = true)}>
                            {t('import.stop')}
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="secondary" fullWidth onClick={close}>
                                {started ? t('common.close') : t('common.cancel')}
                            </Button>
                            {!started ? (
                                <Button type="button" fullWidth icon={PaperPlaneTiltIcon} disabled={!sheet || (sendable.length === 0 && !fit.limited)} onClick={start}>
                                    {t('import.send', { n: sendable.length })}
                                </Button>
                            ) : (
                                failedRows.length > 0 && (
                                    <Button type="button" fullWidth icon={ArrowsClockwiseIcon} onClick={() => send(failedRows)}>
                                        {t('import.retry', { n: failedRows.length })}
                                    </Button>
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
}
