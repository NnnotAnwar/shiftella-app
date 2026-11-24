import type { ReactNode } from 'react';

/**
 * Horizontal bars for one measure across categories (absence types, weekdays,
 * locations). Single series → one colour (emerald, same validated steps as the
 * hours chart), the value written beside every bar, so nothing rests on colour.
 */
export interface BarRow {
    key: string;
    label: ReactNode;
    value: number;
    /** What is written at the end of the bar. */
    display: ReactNode;
    /** Optional quieter second line under the label. */
    sub?: ReactNode;
}

export function BarList({ rows, ariaLabel, highlightMax = false }: { rows: BarRow[]; ariaLabel: string; highlightMax?: boolean }) {
    const max = Math.max(0, ...rows.map((r) => r.value));
    return (
        <ul aria-label={ariaLabel} className="space-y-1.5">
            {rows.map((r) => {
                const pct = max > 0 ? (r.value / max) * 100 : 0;
                const top = highlightMax && r.value === max && max > 0;
                return (
                    <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2.5">
                        <span className="min-w-0">
                            <span className="block truncate text-small text-ink dark:text-slate-200">{r.label}</span>
                            {r.sub && <span className="block truncate text-caption text-ink-soft dark:text-slate-400">{r.sub}</span>}
                        </span>
                        <span className="h-2.5 rounded-full bg-ink/5 dark:bg-white/6">
                            <span
                                className={`block h-full rounded-full ${top ? 'bg-emerald-700 dark:bg-emerald-500' : 'bg-emerald-700/75 dark:bg-emerald-600'}`}
                                style={{ width: `${Math.max(pct, r.value > 0 ? 2 : 0)}%` }}
                            />
                        </span>
                        <span className="text-small-strong tabular-nums text-ink dark:text-white">{r.display}</span>
                    </li>
                );
            })}
        </ul>
    );
}
