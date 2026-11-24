import type { useTranslation } from '@shared/preferences/PreferencesContext';
import type { TimeOff } from '@shared/types';

/** Shared bits of the time-off UI (Schedule card + Requests page + balances). */

export type LeaveKind = TimeOff['kind'];

/** Every absence type, in the order the pickers show them. */
export const LEAVE_KINDS: readonly LeaveKind[] = [
    'vacation',
    'sick',
    'ocr',
    'comp_time',
    'doctor',
    'unpaid',
    'sick_day',
    'business_trip',
    'home_office',
    'parental',
    'obstacle',
    'other',
];

/** What an organization offers until it picks its own (mirrors org_leave_settings' default). */
export const DEFAULT_ENABLED_KINDS: readonly LeaveKind[] = ['vacation', 'sick', 'ocr', 'comp_time', 'unpaid', 'doctor', 'other'];

export const KIND_KEYS = {
    vacation: 'timeoff.vacation',
    sick: 'timeoff.sick',
    other: 'timeoff.other',
    ocr: 'timeoff.ocr',
    comp_time: 'timeoff.comp_time',
    unpaid: 'timeoff.unpaid',
    doctor: 'timeoff.doctor',
    sick_day: 'timeoff.sick_day',
    business_trip: 'timeoff.business_trip',
    home_office: 'timeoff.home_office',
    parental: 'timeoff.parental',
    obstacle: 'timeoff.obstacle',
} as const satisfies Record<LeaveKind, string>;

/** Kinds that draw on a balance: vacation hours for the year, the náhradní volno bank. */
export const BALANCE_KINDS = new Set<LeaveKind>(['vacation', 'comp_time']);

export const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "7.5 h" / "8 h" — hours with at most one decimal. */
export const fmtLeaveHours = (h: number | null | undefined, unit = 'h') => {
    const v = Math.round((h ?? 0) * 10) / 10;
    return `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit}`;
};

export type Translate = (key: Parameters<ReturnType<typeof useTranslation>>[0]) => string;

/** Localize service errors (overlap, a type the org doesn't offer, too many hours). */
export const leaveErr = (err: unknown, t: Translate): string => {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'TIMEOFF_OVERLAP') return t('timeoff.overlap');
    if (msg.includes('TIMEOFF_KIND_DISABLED')) return t('timeoff.kindDisabled');
    if (msg.includes('TIMEOFF_HOURS')) return t('timeoff.badHours');
    return msg || t('common.actionFailed');
};
