import { useState, type ReactNode } from 'react';
import { ChartBarIcon, TableIcon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';

export type ChartView = 'chart' | 'table';

/**
 * A glass card for one analytics chart: title + quiet hint, an optional legend,
 * and a Chart / Table switch — every chart has a table view (screen readers,
 * colour-blind readers, exact numbers).
 */
export function ChartCard({
    title,
    hint,
    legend,
    children,
    className = '',
    noTable = false,
}: {
    title: ReactNode;
    hint?: ReactNode;
    legend?: ReactNode;
    /** Render prop: draw the chart or its table. */
    children: (view: ChartView) => ReactNode;
    className?: string;
    /** The card is a table already — no switch. */
    noTable?: boolean;
}) {
    const t = useTranslation();
    const [view, setView] = useState<ChartView>('chart');
    const btn = (v: ChartView, icon: ReactNode, label: string) => (
        <button
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            title={label}
            aria-label={label}
            className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                view === v
                    ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white'
                    : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'
            }`}
        >
            {icon}
        </button>
    );
    return (
        <section className={`glass rounded-2xl p-3.5 sm:p-4 ${className}`}>
            <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-heading text-ink dark:text-white">{title}</h2>
                    {hint && <p className="mt-0.5 text-caption text-ink-soft dark:text-slate-400">{hint}</p>}
                </div>
                <div className="flex items-center gap-3">
                    {view === 'chart' && legend}
                    {!noTable && (
                        <div role="group" aria-label={t('analytics.viewToggle')} className="flex rounded-lg bg-ink/5 p-0.5 dark:bg-white/6">
                            {btn('chart', <ChartBarIcon weight="bold" className="size-3.5" />, t('analytics.showChart'))}
                            {btn('table', <TableIcon weight="bold" className="size-3.5" />, t('analytics.showTable'))}
                        </div>
                    )}
                </div>
            </header>
            {children(noTable ? 'table' : view)}
        </section>
    );
}

/** A legend entry: swatch + label (identity is never colour alone). */
export function LegendItem({ swatch, label }: { swatch: string; label: string }) {
    return (
        <span className="flex items-center gap-1.5 text-caption text-ink-soft dark:text-slate-400">
            <span aria-hidden className={`size-2.5 rounded-sm ${swatch}`} />
            {label}
        </span>
    );
}

/** Compact table used for every chart's table view. */
export function MiniTable({
    head,
    rows,
    align,
    foot,
}: {
    head: ReactNode[];
    rows: ReactNode[][];
    /** Per column; numbers right-aligned by default after the first column. */
    align?: ('left' | 'right')[];
    foot?: ReactNode[];
}) {
    const a = (i: number) => (align?.[i] ?? (i === 0 ? 'left' : 'right')) === 'right' ? 'text-right' : 'text-left';
    return (
        <div className="max-h-80 overflow-auto rounded-xl border border-ink/6 dark:border-white/8">
            <table className="w-full text-small">
                <thead className="sticky top-0 bg-white/90 backdrop-blur dark:bg-slate-900/90">
                    <tr>
                        {head.map((h, i) => (
                            <th key={i} scope="col" className={`px-2.5 py-1.5 text-label text-ink-soft dark:text-slate-400 ${a(i)}`}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 dark:divide-white/6">
                    {rows.map((r, ri) => (
                        <tr key={ri}>
                            {r.map((c, i) => (
                                <td key={i} className={`px-2.5 py-1.5 tabular-nums text-ink dark:text-slate-200 ${a(i)} ${i === 0 ? 'truncate' : ''}`}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {foot && (
                    <tfoot className="border-t border-ink/8 dark:border-white/10">
                        <tr>
                            {foot.map((c, i) => (
                                <td key={i} className={`px-2.5 py-1.5 font-semibold tabular-nums text-ink dark:text-white ${a(i)}`}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
