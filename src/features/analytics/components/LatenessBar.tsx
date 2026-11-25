import { useTranslation } from '@shared/preferences/PreferencesContext';
import { LATE_BUCKETS } from './chartStyles';
import type { Lateness } from '../types';

/**
 * Punctuality as one segmented bar in the reserved status colours (good /
 * warning / serious / critical), each segment named in the legend with an
 * icon and its count — status is never colour alone. 2px surface gaps between
 * segments.
 */
export function LatenessBar({ lateness }: { lateness: Lateness }) {
    const t = useTranslation();
    const total = LATE_BUCKETS.reduce((s, b) => s + lateness[b.key], 0);
    if (!total) return null;
    return (
        <div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={LATE_BUCKETS.map((b) => `${t(b.labelKey)}: ${lateness[b.key]}`).join(', ')}>
                {LATE_BUCKETS.filter((b) => lateness[b.key] > 0).map((b) => (
                    <span key={b.key} className={`${b.fill} h-full first:rounded-l-full last:rounded-r-full`} style={{ flexGrow: lateness[b.key], flexBasis: 0, minWidth: 4 }} />
                ))}
            </div>
            <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {LATE_BUCKETS.map((b) => {
                    const I = b.icon;
                    return (
                        <li key={b.key} className="flex items-center gap-1.5 text-caption text-ink-soft dark:text-slate-400">
                            <I weight="fill" className={`size-3.5 shrink-0 ${b.iconCls}`} aria-hidden />
                            <span className="truncate">{t(b.labelKey)}</span>
                            <span className="ml-auto font-semibold tabular-nums text-ink dark:text-white">{lateness[b.key]}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
