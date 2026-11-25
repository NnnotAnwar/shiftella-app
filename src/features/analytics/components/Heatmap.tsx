import { useState } from 'react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { weekdayShortLabels } from '@shared/utils/date';
import { heatBin, type HeatGrid } from '../analyticsLogic';
import { binClass, fmtPeople } from './chartStyles';

/**
 * Weekday × hour heatmap of average people on the clock. Sequential, one hue
 * (emerald), light → dark on the light surface and dark → light on the dark
 * one, in five bins scaled to the busiest cell; empty cells recede to the
 * surface. A legend explains the ramp; hover shows the value; the card's table
 * view lists every non-empty cell.
 */

export function HeatLegend() {
    const t = useTranslation();
    return (
        <span className="flex items-center gap-1 text-caption text-ink-soft dark:text-slate-400">
            {t('analytics.fewer')}
            {[1, 2, 3, 4, 5].map((b) => (
                <span key={b} aria-hidden className={`size-2.5 rounded-sm ${binClass(b)}`} />
            ))}
            {t('analytics.more')}
        </span>
    );
}

export function Heatmap({ grid, lang }: { grid: HeatGrid; lang: string }) {
    const t = useTranslation();
    const days = weekdayShortLabels();
    const hours = Array.from({ length: grid.toHour - grid.fromHour + 1 }, (_, i) => grid.fromHour + i);
    const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
    const hv = hover ? grid.values[hover.d][hover.h] : 0;

    return (
        <div className="relative" onPointerLeave={() => setHover(null)}>
            <div
                role="img"
                aria-label={t('analytics.busyHours')}
                className="grid gap-0.5"
                style={{ gridTemplateColumns: `1.75rem repeat(${hours.length}, minmax(0, 1fr))` }}
            >
                {days.map((name, d) => (
                    <div key={d} className="contents">
                        <span className="flex items-center text-caption text-ink-soft dark:text-slate-400">{name}</span>
                        {hours.map((h) => {
                            const v = grid.values[d][h];
                            const active = hover?.d === d && hover?.h === h;
                            return (
                                <span
                                    key={h}
                                    onPointerEnter={() => setHover({ d, h })}
                                    onPointerDown={() => setHover({ d, h })}
                                    className={`h-5 rounded-[3px] ${binClass(heatBin(v, grid.max))} ${active ? 'ring-2 ring-ink/60 dark:ring-white/70' : ''}`}
                                />
                            );
                        })}
                    </div>
                ))}
                <span />
                {hours.map((h) => (
                    <span key={h} className="pt-0.5 text-center text-micro font-medium normal-case tracking-normal tabular-nums text-ink-soft dark:text-slate-500">
                        {h % 3 === 0 ? h : ''}
                    </span>
                ))}
            </div>
            {hover && (
                <div className="glass glass-menu pointer-events-none absolute right-0 -top-1 z-10 rounded-xl px-2.5 py-1.5 text-caption text-ink dark:text-white">
                    <span className="font-semibold">{days[hover.d]} {String(hover.h).padStart(2, '0')}:00</span>
                    <span className="ml-2 tabular-nums text-ink-soft dark:text-slate-300">
                        {fmtPeople(hv, lang)} {t('analytics.colPeople').toLowerCase()}
                    </span>
                </div>
            )}
        </div>
    );
}
