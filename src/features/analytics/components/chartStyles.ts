import { CheckCircleIcon, ClockIcon, WarningIcon, XCircleIcon, type Icon } from '@phosphor-icons/react';
import { INTL_LOCALE, type Language, type TranslationKey } from '@shared/i18n/translations';

/**
 * Shared chart styling for the analytics cards — colours were run through the
 * dataviz palette validator (light: white glass, dark: slate surface).
 */

/** Heatmap: five sequential emerald bins (+ 0 = nobody), selected per mode. */
const BINS_LIGHT = ['bg-ink/[0.04]', 'bg-emerald-100', 'bg-emerald-200', 'bg-emerald-400', 'bg-emerald-600', 'bg-emerald-800'];
const BINS_DARK = ['dark:bg-white/[0.04]', 'dark:bg-emerald-950', 'dark:bg-emerald-900', 'dark:bg-emerald-700', 'dark:bg-emerald-500', 'dark:bg-emerald-300'];
export const binClass = (b: number) => `${BINS_LIGHT[b]} ${BINS_DARK[b]}`;

export function fmtPeople(v: number, lang: string): string {
    return new Intl.NumberFormat(INTL_LOCALE[lang as Language] ?? 'en-GB', { maximumFractionDigits: 1 }).format(v);
}

/**
 * Punctuality buckets in the reserved status palette (good / warning / serious /
 * critical — the dataviz reference steps, same in both modes), each with an
 * icon + label so status is never colour alone.
 */
export const LATE_BUCKETS: { key: 'on_time' | 'late_15' | 'late_60' | 'no_show'; labelKey: TranslationKey; fill: string; icon: Icon; iconCls: string }[] = [
    { key: 'on_time', labelKey: 'analytics.onTime', fill: 'bg-[#0ca30c]', icon: CheckCircleIcon, iconCls: 'text-green-700 dark:text-green-500' },
    { key: 'late_15', labelKey: 'analytics.late15', fill: 'bg-[#fab219]', icon: ClockIcon, iconCls: 'text-[#c98500] dark:text-[#fab219]' },
    { key: 'late_60', labelKey: 'analytics.late60', fill: 'bg-[#ec835a]', icon: WarningIcon, iconCls: 'text-[#d4683e] dark:text-[#ec835a]' },
    { key: 'no_show', labelKey: 'analytics.noShow', fill: 'bg-[#d03b3b]', icon: XCircleIcon, iconCls: 'text-red-600 dark:text-red-400' },
];

