import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { fmtHours } from '@features/shifts/shiftStats';
import { niceCeil, type HoursBucket } from '../analyticsLogic';

/**
 * Worked vs planned hours as paired bars: planned is a neutral grey reference,
 * worked is the user's accent (the app re-points `emerald-*` at the chosen
 * scheme, so no fixed second hue could stay apart from all five accents).
 * Validated with the dataviz palette script against every accent: light
 * gray-400 vs accent-700, dark gray-600 vs accent-500 — CVD ΔE ≥ 15, normal
 * ΔE ≥ 18. Grey sits below 3:1 on the surface, so the legend, the hover
 * tooltip and the card's table view carry the numbers.
 */

const H = 168;
const PAD = { top: 10, right: 6, bottom: 20, left: 34 };

export const WORKED_FILL = 'fill-emerald-700 dark:fill-emerald-500';
export const PLANNED_FILL = 'fill-gray-400 dark:fill-gray-600';
export const WORKED_SWATCH = 'bg-emerald-700 dark:bg-emerald-500';
export const PLANNED_SWATCH = 'bg-gray-400 dark:bg-gray-600';

export function HoursChart({ buckets, label }: { buckets: HoursBucket[]; label: (b: HoursBucket) => string }) {
    const t = useTranslation();
    const wrap = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [hover, setHover] = useState<number | null>(null);

    useEffect(() => {
        const el = wrap.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const n = buckets.length;
    const top = niceCeil(Math.max(1, ...buckets.map((b) => Math.max(b.worked, b.planned))));
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = H - PAD.top - PAD.bottom;
    const slot = n ? plotW / n : 0;
    const gap = Math.min(2, slot * 0.1); // surface gap between the pair
    const barW = Math.max(1, Math.min(14, (slot * 0.78 - gap) / 2));
    const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
    const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 44))));
    const hb = hover !== null ? buckets[hover] : null;

    const bar = (x: number, v: number, cls: string, key: string) => {
        const h = Math.max(0, y(0) - y(v));
        if (h <= 0) return null;
        const r = Math.min(2, barW / 2, h);
        // Rounded data end, square on the baseline.
        return (
            <path
                key={key}
                className={cls}
                d={`M${x},${y(0)}V${y(v) + r}Q${x},${y(v)} ${x + r},${y(v)}H${x + barW - r}Q${x + barW},${y(v)} ${x + barW},${y(v) + r}V${y(0)}Z`}
            />
        );
    };

    return (
        <div ref={wrap} className="relative" onPointerLeave={() => setHover(null)}>
            {width > 0 && (
                <svg width={width} height={H} role="img" aria-label={t('analytics.hoursChart')} className="block select-none">
                    {[0, top / 2, top].map((v) => (
                        <g key={v}>
                            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} className="stroke-ink/8 dark:stroke-white/8" strokeWidth={1} />
                            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-micro font-medium normal-case tracking-normal tabular-nums dark:fill-slate-500">
                                {fmtHours(v)}
                            </text>
                        </g>
                    ))}
                    {buckets.map((b, i) => {
                        const x0 = PAD.left + i * slot + (slot - (barW * 2 + gap)) / 2;
                        return (
                            <g key={b.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                                {bar(x0, b.planned, PLANNED_FILL, 'p')}
                                {bar(x0 + barW + gap, b.worked, WORKED_FILL, 'w')}
                                {i % labelEvery === 0 && (
                                    <text
                                        x={PAD.left + i * slot + slot / 2 > width - 18 ? width - 2 : PAD.left + i * slot + slot / 2}
                                        y={H - 5}
                                        textAnchor={PAD.left + i * slot + slot / 2 > width - 18 ? 'end' : 'middle'}
                                        className="fill-ink-soft text-micro font-medium normal-case tracking-normal tabular-nums dark:fill-slate-500">
                                        {label(b)}
                                    </text>
                                )}
                                {/* Hit target: the whole column, bigger than the bars. */}
                                <rect
                                    x={PAD.left + i * slot}
                                    y={PAD.top}
                                    width={slot}
                                    height={plotH}
                                    fill="transparent"
                                    onPointerEnter={() => setHover(i)}
                                    onPointerDown={() => setHover(i)}
                                />
                            </g>
                        );
                    })}
                </svg>
            )}
            {hb && hover !== null && (
                <div
                    className="glass glass-menu pointer-events-none absolute top-0 z-10 min-w-32 rounded-xl px-2.5 py-2 text-caption"
                    style={{ left: Math.min(Math.max(0, PAD.left + hover * slot + slot / 2 - 64), Math.max(0, width - 136)) }}
                >
                    <p className="mb-1 font-semibold text-ink dark:text-white">{label(hb)}</p>
                    <p className="flex items-center justify-between gap-3 text-ink-soft dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span aria-hidden className={`size-2 rounded-sm ${PLANNED_SWATCH}`} />{t('analytics.planned')}</span>
                        <span className="tabular-nums text-ink dark:text-white">{fmtHours(hb.planned)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3 text-ink-soft dark:text-slate-300">
                        <span className="flex items-center gap-1.5"><span aria-hidden className={`size-2 rounded-sm ${WORKED_SWATCH}`} />{t('analytics.worked')}</span>
                        <span className="tabular-nums text-ink dark:text-white">{fmtHours(hb.worked)}</span>
                    </p>
                </div>
            )}
        </div>
    );
}
