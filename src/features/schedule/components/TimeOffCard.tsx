import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SunHorizonIcon, CheckIcon, XIcon, PlusIcon, TrashIcon, ScalesIcon } from '@phosphor-icons/react';
import type { Profile, TimeOff } from '@shared/types';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { Button } from '@shared/components/Button';
import { Select } from '@shared/components/Select';
import { DatePicker } from '@shared/components/DatePicker';
import { Input, Textarea } from '@shared/components/Input';
import { Modal } from '@features/admin/components/Modal';
import { FormError } from '@shared/components/FormError';
import { toast } from '@shared/toast/toastStore';
import { formatDateShort } from '@shared/utils/date';
import { scheduleService } from '../scheduleService';
import { BALANCE_KINDS, KIND_KEYS, LEAVE_KINDS, fmtLeaveHours, leaveErr, todayStr, type LeaveKind } from '../timeOffShared';
import { useAuthContext } from '@features/auth/AuthContext';
import { can } from '@shared/auth/permissions';
import { useInvalidateLeave, useLeaveBalances, useLeaveSettings } from '@features/leave/useLeave';
import { LeaveBalancesModal } from '@features/leave/LeaveBalancesModal';
import type { LeaveBalance } from '@features/leave/leaveService';
import { HelpLink } from '@features/help/HelpLink';

/**
 * --- TIME OFF CARD ---
 * Leave management on the schedule page. Managers see pending requests to
 * approve/decline and can enter (pre-approved) leave for their people;
 * members file requests and see their status / withdraw pending ones.
 * Everyone sees their own vacation / náhradní volno balance; people who see
 * requests open everyone's balances (and deciders edit them) from "Balances".
 */

/** "Zbývá dovolené: 96 h z 160 h" / "Náhradní volno k čerpání: 8 h" for a kind that draws on a balance. */
function balanceLine(kind: LeaveKind, b: LeaveBalance | undefined, t: ReturnType<typeof useTranslation>): { text: string; left: number } | null {
    if (!b || !BALANCE_KINDS.has(kind)) return null;
    if (kind === 'vacation') {
        return {
            text: t('timeoff.balanceVacation', { left: fmtLeaveHours(b.vacation_left), total: fmtLeaveHours(b.vacation_entitlement + b.vacation_adjust) }),
            left: b.vacation_left,
        };
    }
    return { text: t('timeoff.balanceComp', { left: fmtLeaveHours(b.comp_left) }), left: b.comp_left };
}

/** The "request / add leave" dialog — also used by the Requests page. */
export function TimeOffRequestModal({
    members,
    selfId,
    orgId,
    managerMode,
    onClose,
}: {
    members: Profile[];
    selfId: string;
    orgId: string;
    managerMode: boolean;
    onClose: () => void;
}) {
    const t = useTranslation();
    const qc = useQueryClient();
    const invalidateLeave = useInvalidateLeave();
    const settings = useLeaveSettings();
    // Deciders may enter any type; everyone else picks from what the organization offers.
    const kinds = useMemo(
        () => (managerMode ? LEAVE_KINDS : LEAVE_KINDS.filter((k) => (settings.data?.enabled_kinds ?? ['vacation', 'sick', 'other']).includes(k))),
        [managerMode, settings.data],
    );
    const [userId, setUserId] = useState(selfId);
    const [chosenKind, setKind] = useState<TimeOff['kind'] | null>(null);
    const kind: LeaveKind = chosenKind && kinds.includes(chosenKind) ? chosenKind : (kinds[0] ?? 'vacation');
    const [from, setFrom] = useState(todayStr());
    const [to, setTo] = useState(todayStr());
    const [partDay, setPartDay] = useState(false);
    const [hours, setHours] = useState('4');
    const [note, setNote] = useState('');
    const balances = useLeaveBalances(Number(from.slice(0, 4)) || new Date().getFullYear(), BALANCE_KINDS.has(kind));
    const balance = balanceLine(kind, balances.data?.find((b) => b.user_id === userId), t);
    const single = from === to;
    const partHours = single && partDay ? Number(hours.replace(',', '.')) : null;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setError(null);
        if (to < from) return setError(t('timeoff.badRange'));
        if (partHours !== null && !(partHours > 0 && partHours <= 24)) return setError(t('timeoff.badHours'));
        setBusy(true);
        try {
            await scheduleService.requestTimeOff({
                user_id: userId,
                organization_id: orgId,
                kind,
                starts_on: from,
                ends_on: to,
                hours: partHours,
                note: note.trim() || null,
                // A manager entering leave for someone approves it directly; their
                // own leave is a request like anyone's (someone else approves).
                approved: managerMode && userId !== selfId,
                reviewed_by: managerMode && userId !== selfId ? selfId : null,
            });
            qc.invalidateQueries({ queryKey: ['time-off'] });
            // Approved leave deletes the member's rota shifts on those days (DB trigger).
            qc.invalidateQueries({ queryKey: ['schedule'] });
            invalidateLeave();
            onClose();
        } catch (err) {
            setError(leaveErr(err, t));
            setBusy(false);
        }
    };

    const name = (m: Profile) => [m.first_name, m.last_name].filter(Boolean).join(' ') || m.username;

    return (
        <Modal title={managerMode ? t('timeoff.add') : t('timeoff.request')} onClose={onClose}>
            <div className="space-y-4">
                {managerMode && (
                    <div className="space-y-1.5">
                        <label className="text-label text-gray-400">{t('schedule.member')}</label>
                        <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                            {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {name(m)}
                                </option>
                            ))}
                        </Select>
                    </div>
                )}
                <div className="space-y-1.5">
                    <label className="text-label text-gray-400">{t('timeoff.kind')}</label>
                    <Select value={kind} onChange={(e) => setKind(e.target.value as TimeOff['kind'])}>
                        {kinds.map((k) => (
                            <option key={k} value={k}>
                                {t(KIND_KEYS[k])}
                            </option>
                        ))}
                    </Select>
                    {balance && (
                        <p className={`text-caption ${balance.left <= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink-soft dark:text-slate-400'}`}>{balance.text}</p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-label text-gray-400">{t('timeoff.from')}</label>
                        <DatePicker value={from} onChange={setFrom} aria-label={t('timeoff.from')} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-label text-gray-400">{t('timeoff.to')}</label>
                        <DatePicker value={to} onChange={setTo} aria-label={t('timeoff.to')} />
                    </div>
                </div>
                {single && (
                    <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-meta text-ink dark:text-slate-200">
                            <input type="checkbox" checked={partDay} onChange={(e) => setPartDay(e.target.checked)} className="size-4 accent-emerald-600" />
                            {t('timeoff.partDay')}
                        </label>
                        {partDay && (
                            <label className="flex items-center gap-1.5 text-meta text-ink-soft dark:text-slate-400">
                                <Input
                                    type="number"
                                    min={0.5}
                                    max={24}
                                    step={0.5}
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value)}
                                    aria-label={t('timeoff.hours')}
                                    className="h-9 w-20"
                                />
                                h
                            </label>
                        )}
                    </div>
                )}
                {balance && partHours !== null && partHours > balance.left && (
                    <p className="text-caption text-amber-600 dark:text-amber-400">{t('timeoff.overBalance', { left: fmtLeaveHours(balance.left) })}</p>
                )}
                <div className="space-y-1.5">
                    <label className="text-label text-gray-400">{t('schedule.note')}</label>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('schedule.notePlaceholder')} />
                </div>
                <FormError message={error} />
                <div className="flex gap-2 pt-1">
                    <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" fullWidth loading={busy} onClick={submit}>
                        {busy ? t('common.saving') : managerMode ? t('common.save') : t('timeoff.send')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

const STATUS_TONE: Record<TimeOff['status'], string> = {
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    declined: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
};

export function TimeOffCard({
    entries,
    members,
    selfId,
    orgId,
    managerMode,
}: {
    /** This month's leave entries (already scoped by RLS). */
    entries: TimeOff[];
    members: Profile[];
    selfId: string;
    orgId: string;
    managerMode: boolean;
}) {
    const t = useTranslation();
    const qc = useQueryClient();
    const { user } = useAuthContext();
    const [open, setOpen] = useState(false);
    const [balancesOpen, setBalancesOpen] = useState(false);
    const invalidateLeave = useInvalidateLeave();
    const seesBalances = can(user, 'requests.view');
    const own = useLeaveBalances(new Date().getFullYear()).data?.find((b) => b.user_id === selfId);

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['time-off'] });
        // Approved leave deletes the member's rota shifts on those days (DB trigger).
        qc.invalidateQueries({ queryKey: ['schedule'] });
        invalidateLeave();
    };
    const reviewM = useMutation({
        mutationFn: ({ id, approve }: { id: string; approve: boolean }) => scheduleService.reviewTimeOff(id, approve, selfId),
        onSuccess: invalidate,
        onError: (err) => toast(leaveErr(err, t), 'error'),
    });
    const deleteM = useMutation({
        mutationFn: (id: string) => scheduleService.deleteTimeOff(id),
        onSuccess: invalidate,
        onError: (err) => toast(err instanceof Error ? err.message : t('common.actionFailed'), 'error'),
    });

    const visible = managerMode ? entries : entries.filter((e) => e.user_id === selfId);
    const pending = visible.filter((e) => e.status === 'pending');
    const decided = visible.filter((e) => e.status !== 'pending');

    const personName = (e: TimeOff) =>
        `${e.profiles?.first_name ?? ''} ${e.profiles?.last_name ?? ''}`.trim() || e.profiles?.username || '—';
    const range = (e: TimeOff) =>
        e.starts_on === e.ends_on
            ? formatDateShort(`${e.starts_on}T00:00`)
            : `${formatDateShort(`${e.starts_on}T00:00`)} – ${formatDateShort(`${e.ends_on}T00:00`)}`;

    return (
        <section className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <SunHorizonIcon weight="fill" className="w-4 h-4" />
                </span>
                <div className="flex flex-1 items-center gap-1 text-body-strong text-gray-900 dark:text-white">
                    <span>
                        {t('timeoff.title')}
                        {pending.length > 0 && <span className="text-amber-500 font-normal"> · {pending.length}</span>}
                    </span>
                    <HelpLink article={seesBalances ? 'leave-balances' : 'request-time-off'} />
                </div>
                {seesBalances && (
                    <Button size="sm" variant="ghost" icon={ScalesIcon} onClick={() => setBalancesOpen(true)}>
                        {t('leave.balances')}
                    </Button>
                )}
                <Button size="sm" variant="tonal" icon={PlusIcon} onClick={() => setOpen(true)}>
                    {managerMode ? t('timeoff.add') : t('timeoff.request')}
                </Button>
            </div>

            {own && (
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-ink-soft tabular-nums dark:text-slate-400" data-testid="own-balance">
                    <span>{t('timeoff.balanceVacation', { left: fmtLeaveHours(own.vacation_left), total: fmtLeaveHours(own.vacation_entitlement + own.vacation_adjust) })}</span>
                    {(own.comp_left !== 0 || own.comp_earned > 0) && <span>{t('timeoff.balanceComp', { left: fmtLeaveHours(own.comp_left) })}</span>}
                </p>
            )}

            {visible.length > 0 && (
                <ul className="space-y-1.5">
                    {[...pending, ...decided].map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-small">
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-micro font-bold normal-case tracking-normal ${STATUS_TONE[e.status]}`}>
                                {t(KIND_KEYS[e.kind])}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                                {managerMode && <span className="font-semibold">{personName(e)} · </span>}
                                {range(e)}
                                {e.hours != null && e.hours > 0 && (BALANCE_KINDS.has(e.kind) || e.hours_auto === false) ? (
                                    <span className="text-gray-400 tabular-nums"> · {fmtLeaveHours(e.hours)}</span>
                                ) : null}
                                {e.note ? <span className="text-gray-400"> · {e.note}</span> : null}
                            </span>
                            {e.status === 'pending' && managerMode && e.user_id !== selfId ? (
                                <span className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => reviewM.mutate({ id: e.id, approve: true })}
                                        aria-label={t('common.approve')}
                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                    >
                                        <CheckIcon weight="bold" className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => reviewM.mutate({ id: e.id, approve: false })}
                                        aria-label={t('common.reject')}
                                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                        <XIcon weight="bold" className="w-4 h-4" />
                                    </button>
                                </span>
                            ) : e.status === 'pending' || managerMode ? (
                                <button
                                    onClick={() => deleteM.mutate(e.id)}
                                    aria-label={t('timeoff.withdraw')}
                                    title={t('timeoff.withdraw')}
                                    className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                    <TrashIcon weight="bold" className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-micro font-bold normal-case tracking-normal ${STATUS_TONE[e.status]}`}>
                                    {t(e.status === 'approved' ? 'timeoff.approved' : 'timeoff.declined')}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {balancesOpen && <LeaveBalancesModal selfId={selfId} canDecide={can(user, 'requests.decide')} onClose={() => setBalancesOpen(false)} />}
            {open && (
                <TimeOffRequestModal
                    members={members}
                    selfId={selfId}
                    orgId={orgId}
                    managerMode={managerMode}
                    onClose={() => setOpen(false)}
                />
            )}
        </section>
    );
}
