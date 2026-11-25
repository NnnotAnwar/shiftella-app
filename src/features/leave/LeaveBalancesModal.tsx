import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { TranslationKey } from '@shared/i18n/translations';
import { Modal } from '@features/admin/components/Modal';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { Select } from '@shared/components/Select';
import { FormError } from '@shared/components/FormError';
import { Skeleton } from '@shared/components/Skeleton';
import { toast } from '@shared/toast/toastStore';
import { formatDateShort } from '@shared/utils/date';
import { KIND_KEYS, LEAVE_KINDS, fmtLeaveHours, type LeaveKind } from '@features/schedule/timeOffShared';
import { leaveService, type LeaveBalance, type LeaveSettings } from './leaveService';
import { currentYear, leaveKeys, useLeaveBalances, useLeaveSettings, useSaveLeaveSettings } from './useLeave';

/**
 * --- LEAVE BALANCES ---
 * For people who see requests: everyone's vacation left this year and their
 * náhradní volno bank. Deciders also edit a person (hours per week, yearly
 * entitlement, +/− adjustments) and the organization's absence settings.
 * Nobody edits their own balance (the database refuses it too).
 */
export function LeaveBalancesModal({ selfId, canDecide, onClose }: { selfId: string; canDecide: boolean; onClose: () => void }) {
    const t = useTranslation();
    const [tab, setTab] = useState<'balances' | 'settings'>('balances');
    const [year, setYear] = useState(currentYear());
    const [editing, setEditing] = useState<LeaveBalance | null>(null);
    const balances = useLeaveBalances(year);

    return (
        <Modal title={t('leave.title')} onClose={onClose} wide>
            <div className="space-y-3">
                {canDecide && !editing && (
                    <div className="segmented flex w-fit">
                        {(['balances', 'settings'] as const).map((id) => (
                            <button
                                key={id}
                                type="button"
                                aria-pressed={tab === id}
                                onClick={() => setTab(id)}
                                className={`rounded-[9px] px-3 py-1 text-meta font-semibold transition-colors ${
                                    tab === id ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'
                                }`}
                            >
                                {t(id === 'balances' ? 'leave.tabBalances' : 'leave.tabSettings')}
                            </button>
                        ))}
                    </div>
                )}

                {tab === 'settings' && canDecide ? (
                    <LeaveSettingsForm />
                ) : editing ? (
                    <MemberEditor row={editing} year={year} onBack={() => setEditing(null)} />
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-caption text-ink-soft dark:text-slate-400">{t('leave.howCounted')}</p>
                            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('leave.year')} fullWidth={false} className="w-24">
                                {[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        {balances.isLoading ? (
                            <Skeleton className="h-40 rounded-xl" />
                        ) : (balances.data ?? []).length === 0 ? (
                            <p className="py-6 text-center text-meta text-ink-soft dark:text-slate-400">{t('leave.empty')}</p>
                        ) : (
                            <div className="overflow-hidden rounded-xl ring-1 ring-ink/5 dark:ring-white/8">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_2rem] items-center gap-x-3 bg-ink/3 px-3 py-1.5 text-micro font-semibold text-ink-soft uppercase dark:bg-white/4 dark:text-slate-400">
                                    <span>{t('leave.colPerson')}</span>
                                    <span className="text-right">{t('leave.colVacation')}</span>
                                    <span className="text-right">{t('leave.colComp')}</span>
                                    <span />
                                </div>
                                <ul className="max-h-[55vh] divide-y divide-ink/5 overflow-y-auto dark:divide-white/6">
                                    {balances.data!.map((b) => (
                                        <BalanceRow key={b.user_id} b={b} editable={canDecide && b.user_id !== selfId} onEdit={() => setEditing(b)} />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}

function BalanceRow({ b, editable, onEdit }: { b: LeaveBalance; editable: boolean; onEdit: () => void }) {
    const t = useTranslation();
    const total = b.vacation_entitlement + b.vacation_adjust;
    return (
        <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_2rem] items-center gap-x-3 px-3 py-2 text-meta">
            <span className="truncate font-semibold text-ink dark:text-white">{b.name}</span>
            <span className="text-right tabular-nums">
                <span className={b.vacation_left < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink dark:text-white'}>
                    {t('leave.ofTotal', { left: fmtLeaveHours(b.vacation_left), total: fmtLeaveHours(total) })}
                </span>
                {b.vacation_pending > 0 && (
                    <span className="block text-caption text-amber-600 dark:text-amber-400">{t('leave.pending', { n: fmtLeaveHours(b.vacation_pending) })}</span>
                )}
            </span>
            <span className="text-right tabular-nums">
                <span className={b.comp_left < 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink dark:text-white'}>{fmtLeaveHours(b.comp_left)}</span>
                {b.comp_pending > 0 && (
                    <span className="block text-caption text-amber-600 dark:text-amber-400">{t('leave.pending', { n: fmtLeaveHours(b.comp_pending) })}</span>
                )}
            </span>
            {editable ? (
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label={`${t('leave.edit')}: ${b.name}`}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white"
                >
                    <PencilSimpleIcon weight="bold" className="size-4" />
                </button>
            ) : (
                <span className="size-8" aria-hidden />
            )}
        </li>
    );
}

const numOrNull = (v: string): number | null => {
    const n = Number(v.replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

/** One person: hours per week, yearly entitlement, +/− adjustments. */
function MemberEditor({ row, year, onBack }: { row: LeaveBalance; year: number; onBack: () => void }) {
    const t = useTranslation();
    const qc = useQueryClient();
    const settings = useLeaveSettings();
    const member = useQuery({ queryKey: leaveKeys.member(row.user_id), queryFn: () => leaveService.memberLeave(row.user_id) });
    const adjustments = useQuery({ queryKey: leaveKeys.adjustments(row.user_id, year), queryFn: () => leaveService.adjustments(row.user_id, year) });

    // Untouched fields show the saved values; typing overrides them.
    const [weeklyEdit, setWeekly] = useState<string | null>(null);
    const [vacationEdit, setVacation] = useState<string | null>(null);
    const weekly = weeklyEdit ?? (member.data?.weekly_hours != null ? String(member.data.weekly_hours) : '');
    const vacation = vacationEdit ?? (member.data?.vacation_hours != null ? String(member.data.vacation_hours) : '');

    const [bucket, setBucket] = useState<'vacation' | 'comp_time'>('vacation');
    const [hours, setHours] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);

    const refresh = () => void qc.invalidateQueries({ queryKey: leaveKeys.all });
    const saveM = useMutation({
        mutationFn: () => leaveService.setMemberLeave(row.user_id, numOrNull(weekly), numOrNull(vacation)),
        onSuccess: () => {
            refresh();
            toast(t('leave.saved'), 'success');
        },
        onError: () => setError(t('common.actionFailed')),
    });
    const addM = useMutation({
        mutationFn: () => leaveService.addAdjustment(row.user_id, bucket, numOrNull(hours) ?? 0, note.trim() || null, year),
        onSuccess: () => {
            setHours('');
            setNote('');
            refresh();
        },
        onError: () => setError(t('common.actionFailed')),
    });
    const delM = useMutation({ mutationFn: (id: string) => leaveService.deleteAdjustment(id), onSuccess: refresh, onError: () => setError(t('common.actionFailed')) });

    const orgWeekly = settings.data?.weekly_hours ?? 40;
    const defaultVacation = (numOrNull(weekly) ?? orgWeekly) * (settings.data?.vacation_weeks ?? 4);
    const adjHours = numOrNull(hours);
    const bal = row;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={t('common.back')}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5 dark:text-slate-400 dark:hover:bg-white/6"
                >
                    <ArrowLeftIcon weight="bold" className="size-4" />
                </button>
                <p className="text-body-strong text-ink dark:text-white">{row.name}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-meta">
                <div className="rounded-xl bg-ink/3 px-3 py-2 dark:bg-white/4">
                    <dt className="text-caption text-ink-soft dark:text-slate-400">{t('leave.bucket.vacation')} · {year}</dt>
                    <dd className="font-semibold tabular-nums text-ink dark:text-white">
                        {t('leave.ofTotal', { left: fmtLeaveHours(bal.vacation_left), total: fmtLeaveHours(bal.vacation_entitlement + bal.vacation_adjust) })}
                    </dd>
                    <dd className="text-caption text-ink-soft dark:text-slate-400">{t('leave.used', { n: fmtLeaveHours(bal.vacation_used) })}</dd>
                </div>
                <div className="rounded-xl bg-ink/3 px-3 py-2 dark:bg-white/4">
                    <dt className="text-caption text-ink-soft dark:text-slate-400">{t('leave.bucket.comp_time')}</dt>
                    <dd className="font-semibold tabular-nums text-ink dark:text-white">{fmtLeaveHours(bal.comp_left)}</dd>
                    <dd className="text-caption text-ink-soft dark:text-slate-400">
                        {t('leave.earned', { n: fmtLeaveHours(bal.comp_earned) })} · {t('leave.used', { n: fmtLeaveHours(bal.comp_used) })}
                    </dd>
                </div>
            </dl>

            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                    <span className="text-label text-gray-400">{t('leave.weeklyHours')}</span>
                    <Input inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder={String(orgWeekly)} />
                    <span className="block text-caption text-ink-soft dark:text-slate-400">{t('leave.orgDefault', { n: orgWeekly })}</span>
                </label>
                <label className="space-y-1">
                    <span className="text-label text-gray-400">{t('leave.vacationHours')}</span>
                    <Input inputMode="decimal" value={vacation} onChange={(e) => setVacation(e.target.value)} placeholder={String(defaultVacation)} />
                    <span className="block text-caption text-ink-soft dark:text-slate-400">{t('leave.orgDefault', { n: defaultVacation })}</span>
                </label>
            </div>
            <Button size="sm" variant="secondary" loading={saveM.isPending} onClick={() => saveM.mutate()}>
                {t('common.save')}
            </Button>

            <div className="space-y-2 border-t border-ink/5 pt-3 dark:border-white/8">
                <p className="text-meta font-semibold text-ink dark:text-white">{t('leave.adjust')}</p>
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2 sm:grid-cols-[10rem_6rem_minmax(0,1fr)_auto]">
                    <Select value={bucket} onChange={(e) => setBucket(e.target.value as 'vacation' | 'comp_time')} aria-label={t('timeoff.kind')}>
                        <option value="vacation">{t('leave.bucket.vacation')}</option>
                        <option value="comp_time">{t('leave.bucket.comp_time')}</option>
                    </Select>
                    <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="+8" aria-label={t('leave.adjustHours')} />
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('leave.adjustNote')} maxLength={200} className="col-span-2 sm:col-span-1" />
                    <Button
                        size="sm"
                        variant="tonal"
                        icon={PlusIcon}
                        className="col-span-2 sm:col-span-1"
                        disabled={!adjHours}
                        loading={addM.isPending}
                        onClick={() => addM.mutate()}
                    >
                        {t('leave.adjustAdd')}
                    </Button>
                </div>
                <FormError message={error} />
                <p className="text-label text-gray-400">{t('leave.adjustments')}</p>
                {(adjustments.data ?? []).length === 0 ? (
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('leave.noAdjustments')}</p>
                ) : (
                    <ul className="space-y-1">
                        {adjustments.data!.map((a) => (
                            <li key={a.id} className="flex items-center gap-2 text-meta">
                                <span className={`w-16 shrink-0 font-semibold tabular-nums ${a.hours > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {a.hours > 0 ? '+' : '−'}
                                    {fmtLeaveHours(Math.abs(a.hours))}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-ink dark:text-slate-200">
                                    {t(`leave.bucket.${a.bucket}` as TranslationKey)}
                                    {a.note ? <span className="text-ink-soft dark:text-slate-400"> · {a.note}</span> : null}
                                    <span className="text-ink-soft dark:text-slate-500"> · {formatDateShort(a.created_at)}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => delM.mutate(a.id)}
                                    aria-label={t('timeoff.withdraw')}
                                    className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                >
                                    <TrashIcon weight="bold" className="size-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** Which absence types people may request, the standard week, vacation weeks, holiday → náhradní volno. */
function LeaveSettingsForm() {
    const t = useTranslation();
    const settings = useLeaveSettings();
    const save = useSaveLeaveSettings();
    const [edited, setDraft] = useState<LeaveSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const draft = edited ?? settings.data;
    if (!draft) return <Skeleton className="h-64 rounded-xl" />;

    const toggle = (k: LeaveKind) =>
        setDraft({ ...draft, enabled_kinds: draft.enabled_kinds.includes(k) ? draft.enabled_kinds.filter((x) => x !== k) : [...draft.enabled_kinds, k] });

    const submit = () => {
        setError(null);
        if (!(draft.weekly_hours >= 1 && draft.weekly_hours <= 60) || !(draft.vacation_weeks >= 0 && draft.vacation_weeks <= 10)) {
            return setError(t('common.actionFailed'));
        }
        save.mutate(draft, {
            onSuccess: () => toast(t('leave.saved'), 'success'),
            onError: () => setError(t('common.actionFailed')),
        });
    };

    return (
        <div className="space-y-4">
            <fieldset className="space-y-2">
                <legend className="text-meta font-semibold text-ink dark:text-white">{t('leave.kinds')}</legend>
                <p className="text-caption text-ink-soft dark:text-slate-400">{t('leave.kindsHint')}</p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {LEAVE_KINDS.map((k) => (
                        <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-meta text-ink hover:bg-ink/3 dark:text-slate-200 dark:hover:bg-white/4">
                            <input type="checkbox" checked={draft.enabled_kinds.includes(k)} onChange={() => toggle(k)} className="size-4 accent-emerald-600" />
                            {t(KIND_KEYS[k])}
                        </label>
                    ))}
                </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                    <span className="text-label text-gray-400">{t('leave.weeklyDefault')}</span>
                    <Input
                        type="number"
                        min={1}
                        max={60}
                        step={0.5}
                        value={draft.weekly_hours}
                        onChange={(e) => setDraft({ ...draft, weekly_hours: Number(e.target.value) })}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-label text-gray-400">{t('leave.vacationWeeks')}</span>
                    <Input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        value={draft.vacation_weeks}
                        onChange={(e) => setDraft({ ...draft, vacation_weeks: Number(e.target.value) })}
                    />
                </label>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-ink/3 px-3 py-2 dark:bg-white/4">
                <input
                    type="checkbox"
                    checked={draft.holiday_comp_time}
                    onChange={(e) => setDraft({ ...draft, holiday_comp_time: e.target.checked })}
                    className="mt-0.5 size-4 accent-emerald-600"
                />
                <span className="min-w-0">
                    <span className="block text-meta font-semibold text-ink dark:text-white">{t('leave.holidayComp')}</span>
                    <span className="block text-caption text-ink-soft dark:text-slate-400">{t('leave.holidayCompHint')}</span>
                </span>
            </label>
            <FormError message={error} />
            <Button size="sm" variant="primary" loading={save.isPending} onClick={submit}>
                {t('common.save')}
            </Button>
        </div>
    );
}
