import { useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClockIcon, CoinsIcon, TimerIcon, UmbrellaIcon, type Icon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { can } from '@shared/auth/permissions';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { INTL_LOCALE, type Language, type TranslationKey } from '@shared/i18n/translations';
import { PageHeader } from '@shared/components/PageHeader';
import { MonthPicker } from '@shared/components/MonthPicker';
import { Select } from '@shared/components/Select';
import { Skeleton } from '@shared/components/Skeleton';
import { Button } from '@shared/components/Button';
import { DataTable, type Column } from '@shared/components/DataTable';
import { weekdayShortLabels } from '@shared/utils/date';
import { fmtHours } from '@features/shifts/shiftStats';
import { analyticsService } from './analyticsService';
import {
    SPANS,
    bucketDays,
    heatGrid,
    locationShares,
    peakSlots,
    periodRange,
    punctuality,
    topLate,
    topOvertime,
    variance,
    weekdayAverages,
    type HoursBucket,
    type Span,
} from './analyticsLogic';
import type { Analytics, AnalyticsMember } from './types';
import { ChartCard, LegendItem, MiniTable } from './components/ChartCard';
import { HoursChart, PLANNED_SWATCH, WORKED_SWATCH } from './components/HoursChart';
import { Heatmap, HeatLegend } from './components/Heatmap';
import { BarList } from './components/BarList';
import { LatenessBar } from './components/LatenessBar';
import { LATE_BUCKETS, fmtPeople } from './components/chartStyles';

/**
 * --- OWNER ANALYTICS ---
 * Hours worked vs planned, labour cost, absences, lateness, busy hours and
 * overtime for a month or a longer span, per location or all. Everything is
 * computed by the `org_analytics` RPC (own organization, rota + timesheets
 * read; cost only with wages read); this page only shapes and draws it.
 */

const thisMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Today as YYYY-MM-DD in local time. */
const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const localeOf = (lang: string) => INTL_LOCALE[lang as Language] ?? 'en-GB';

function fmtMoney(v: number, currency: string, lang: string): string {
    try {
        return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
    } catch {
        return `${Math.round(v)} ${currency}`;
    }
}

function fmtPct(v: number, lang: string, signed = false): string {
    return new Intl.NumberFormat(localeOf(lang), { style: 'percent', maximumFractionDigits: 0, signDisplay: signed ? 'exceptZero' : 'auto' }).format(v);
}

function fmtDay(day: string, lang: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'numeric' });
}

export function AnalyticsPage() {
    const { user } = useAuthContext();
    const { t, language } = usePreferences();
    const [month, setMonth] = useState(thisMonth);
    const [span, setSpan] = useState<Span>(1);
    const [locationId, setLocationId] = useState('');
    const allowed = can(user, 'analytics.view');
    const { from, to } = periodRange(month, span);

    const locationsQ = useQuery({
        queryKey: ['analytics', 'locations', user?.organization_id],
        queryFn: () => analyticsService.locations(user!.organization_id),
        enabled: !!user && allowed,
    });
    const q = useQuery({
        queryKey: ['analytics', user?.organization_id, from, to, locationId],
        queryFn: () => analyticsService.get(from, to, locationId || null),
        enabled: !!user && allowed,
        placeholderData: keepPreviousData,
    });

    if (!user) return null;
    if (!allowed) return <Navigate to="/" replace />;

    const locations = locationsQ.data ?? [];
    const rangeLabel = `${fmtDay(from, language)} – ${fmtDay(to, language)}${to.slice(0, 4) !== String(new Date().getFullYear()) ? ` ${to.slice(0, 4)}` : ''}`;

    return (
        <div className="space-y-3 px-1 pb-10">
            <PageHeader
                eyebrow={t('analytics.eyebrow')}
                title={t('analytics.title')}
                description={`${t('analytics.description')} · ${rangeLabel}`}
                actions={
                    <>
                        <MonthPicker value={month} onChange={(v) => setMonth(v ?? thisMonth())} />
                        <Select size="sm" fullWidth={false} value={String(span)} onChange={(e) => setSpan(Number(e.target.value) as Span)} aria-label={t('analytics.spanLabel')}>
                            {SPANS.map((s) => (
                                <option key={s} value={String(s)}>
                                    {t(`analytics.span${s}` as TranslationKey)}
                                </option>
                            ))}
                        </Select>
                        {locations.length > 1 && (
                            <Select size="sm" fullWidth={false} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label={t('analytics.locationLabel')}>
                                <option value="">{t('analytics.allLocations')}</option>
                                {locations.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.name}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </>
                }
            />

            {q.isError ? (
                <div className="glass flex items-center justify-between gap-3 rounded-2xl p-3.5">
                    <p className="text-small text-ink dark:text-slate-200">{t('analytics.error')}</p>
                    <Button size="sm" variant="secondary" onClick={() => q.refetch()}>
                        {t('common.retry')}
                    </Button>
                </div>
            ) : !q.data ? (
                <LoadingState />
            ) : (
                <div className={`space-y-3 transition-opacity ${q.isFetching && q.isPlaceholderData ? 'opacity-60' : ''}`}>
                    <AnalyticsBody data={q.data} lang={language} />
                </div>
            )}
        </div>
    );
}

function LoadingState() {
    return (
        <div className="space-y-3" aria-busy>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
            </div>
            <Skeleton className="h-56 rounded-2xl" />
            <div className="grid gap-3 lg:grid-cols-2">
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-48 rounded-2xl" />
            </div>
        </div>
    );
}

function StatTile({ icon: I, label, value, sub }: { icon: Icon; label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="glass rounded-2xl p-3">
            <p className="flex items-center gap-1.5 text-label text-ink-soft dark:text-slate-400">
                <I weight="bold" className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                {label}
            </p>
            <p className="mt-1.5 text-metric text-ink dark:text-white">{value}</p>
            {sub && <p className="mt-0.5 truncate text-caption text-ink-soft dark:text-slate-400">{sub}</p>}
        </div>
    );
}

function AnalyticsBody({ data, lang }: { data: Analytics; lang: string }) {
    const { t } = usePreferences();
    const { totals } = data;
    const money = (v: number) => fmtMoney(v, data.currency, lang);
    const dayNames = weekdayShortLabels();

    const hours = useMemo(() => bucketDays(data.days), [data.days]);
    const weekdays = useMemo(() => weekdayAverages(data.days, localToday()), [data.days]);
    const grid = useMemo(() => heatGrid(data.heatmap), [data.heatmap]);
    const peaks = useMemo(() => peakSlots(data.heatmap), [data.heatmap]);
    const overtime = useMemo(() => topOvertime(data.members), [data.members]);
    const late = useMemo(() => topLate(data.members), [data.members]);
    const shares = useMemo(() => locationShares(data.locations, data.can_cost), [data.locations, data.can_cost]);
    const punct = punctuality(data.lateness);
    // A running period compares against the plan up to today, not the whole month.
    const today = localToday();
    const running = data.to >= today;
    const plannedToDate = running ? data.days.filter((d) => d.day <= today).reduce((sum, d) => sum + d.planned, 0) : totals.planned;
    const varPct = variance(totals.worked, plannedToDate);
    const bucketLabel = (b: HoursBucket) => fmtDay(b.key, lang);
    const locName = (name: string | null) => name ?? t('analytics.noLocation');

    const empty = totals.worked === 0 && totals.planned === 0 && data.absences.length === 0;
    if (empty) {
        return <p className="glass rounded-2xl p-4 text-small text-ink-soft dark:text-slate-400">{t('analytics.empty')}</p>;
    }

    const memberCols: Column<AnalyticsMember>[] = [
        { key: 'name', header: t('analytics.colPerson'), render: (m) => <span className="block truncate font-medium">{m.name}</span> },
        { key: 'worked', header: t('analytics.colWorked'), align: 'right', width: 'w-20 sm:w-24', render: (m) => <span className="tabular-nums">{fmtHours(m.worked)}</span>, footer: <span className="tabular-nums">{fmtHours(totals.worked)}</span> },
        { key: 'planned', header: t('analytics.planned'), align: 'right', width: 'w-24', hideOnMobile: true, render: (m) => <span className="tabular-nums">{fmtHours(m.planned)}</span>, footer: <span className="tabular-nums">{fmtHours(totals.planned)}</span> },
        { key: 'absence', header: t('analytics.colAbsence'), align: 'right', width: 'w-24', hideOnMobile: 'lg', render: (m) => <span className="tabular-nums">{m.absence_hours ? fmtHours(m.absence_hours) : '—'}</span> },
        { key: 'late', header: t('analytics.colLate'), align: 'right', width: 'w-24', hideOnMobile: 'lg', render: (m) => <span className="tabular-nums">{m.late_15 + m.late_60 || '—'}</span> },
        ...(data.can_cost
            ? [{ key: 'cost', header: t('analytics.colCost'), align: 'right' as const, width: 'w-32 sm:w-36', render: (m: AnalyticsMember) => <span className="tabular-nums">{m.cost === null ? '—' : money(m.cost)}</span>, footer: totals.cost === null ? undefined : <span className="tabular-nums">{money(totals.cost)}</span> }]
            : []),
    ];

    return (
        <>
            {/* Headline numbers */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    icon={ClockIcon}
                    label={t('analytics.worked')}
                    value={fmtHours(totals.worked)}
                    sub={
                        totals.planned > 0
                            ? `${t(running ? 'analytics.ofPlanToDate' : 'analytics.ofPlan', { planned: fmtHours(plannedToDate) })}${varPct !== null ? ` · ${fmtPct(varPct, lang, true)}` : ''}`
                            : t('analytics.noPlan')
                    }
                />
                <StatTile
                    icon={CoinsIcon}
                    label={t('analytics.labourCost')}
                    value={data.can_cost && totals.cost !== null ? money(totals.cost) : '—'}
                    sub={
                        !data.can_cost
                            ? t('analytics.costHidden')
                            : totals.uncosted_hours
                              ? t('analytics.uncosted', { hours: fmtHours(totals.uncosted_hours) })
                              : t('analytics.plannedCost', { amount: money(totals.planned_cost ?? 0) })
                    }
                />
                <StatTile
                    icon={UmbrellaIcon}
                    label={t('analytics.absenceHours')}
                    value={fmtHours(totals.absence_hours)}
                    sub={t('analytics.absenceSub', { n: data.absences.length })}
                />
                <StatTile
                    icon={TimerIcon}
                    label={t('analytics.punctuality')}
                    value={punct.onTimeShare === null ? '—' : t('analytics.onTimeShare', { pct: fmtPct(punct.onTimeShare, lang) })}
                    sub={punct.checked ? t('analytics.shiftsChecked', { n: punct.checked }) : t('analytics.noTimedShifts')}
                />
            </div>

            {/* Worked vs planned over time */}
            <ChartCard
                title={t('analytics.hoursChart')}
                hint={hours.unit === 'day' ? t('analytics.perDay') : t('analytics.perWeek')}
                legend={
                    <span className="flex items-center gap-3">
                        <LegendItem swatch={PLANNED_SWATCH} label={t('analytics.planned')} />
                        <LegendItem swatch={WORKED_SWATCH} label={t('analytics.worked')} />
                    </span>
                }
            >
                {(view) =>
                    view === 'chart' ? (
                        <HoursChart buckets={hours.buckets} label={bucketLabel} />
                    ) : (
                        <MiniTable
                            head={[hours.unit === 'day' ? t('analytics.colDay') : t('analytics.colWeek'), t('analytics.planned'), t('analytics.worked'), t('analytics.colDiff')]}
                            rows={hours.buckets.map((b) => [bucketLabel(b), fmtHours(b.planned), fmtHours(b.worked), fmtHours(b.worked - b.planned)])}
                            foot={['Σ', fmtHours(totals.planned), fmtHours(totals.worked), fmtHours(totals.worked - totals.planned)]}
                        />
                    )
                }
            </ChartCard>

            <div className="grid gap-3 lg:grid-cols-2">
                {/* Busy hours */}
                <ChartCard
                    title={t('analytics.busyHours')}
                    hint={
                        peaks.length
                            ? t('analytics.peak', { slots: peaks.map((p) => `${dayNames[p.dow - 1]} ${p.hour}:00`).join(', ') })
                            : t('analytics.busyHint')
                    }
                    legend={<HeatLegend />}
                >
                    {(view) =>
                        view === 'chart' ? (
                            <Heatmap grid={grid} lang={lang} />
                        ) : (
                            <MiniTable
                                head={[t('analytics.colWeekday'), t('analytics.colHour'), t('analytics.colPeople')]}
                                rows={data.heatmap.map((c) => [dayNames[c.dow - 1], `${String(c.hour).padStart(2, '0')}:00`, fmtPeople(c.people, lang)])}
                            />
                        )
                    }
                </ChartCard>

                {/* Busy weekdays */}
                <ChartCard title={t('analytics.busyDays')} hint={t('analytics.busyDaysHint')}>
                    {(view) =>
                        view === 'chart' ? (
                            <BarList
                                ariaLabel={t('analytics.busyDays')}
                                highlightMax
                                rows={weekdays.map((w) => ({ key: String(w.dow), label: dayNames[w.dow - 1], value: w.worked, display: fmtHours(w.worked) }))}
                            />
                        ) : (
                            <MiniTable
                                head={[t('analytics.colWeekday'), t('analytics.planned'), t('analytics.worked')]}
                                rows={weekdays.map((w) => [dayNames[w.dow - 1], fmtHours(w.planned), fmtHours(w.worked)])}
                            />
                        )
                    }
                </ChartCard>

                {/* Absences */}
                <ChartCard title={t('analytics.absenceByType')} hint={t('analytics.absenceHint')} noTable={data.absences.length === 0}>
                    {(view) =>
                        data.absences.length === 0 ? (
                            <p className="text-small text-ink-soft dark:text-slate-400">{t('analytics.noAbsences')}</p>
                        ) : view === 'chart' ? (
                            <BarList
                                ariaLabel={t('analytics.absenceByType')}
                                rows={data.absences.map((a) => ({
                                    key: a.kind,
                                    label: t(`timeoff.${a.kind}` as TranslationKey),
                                    sub: `${a.days} ${t('analytics.colDays').toLowerCase()}`,
                                    value: a.hours,
                                    display: fmtHours(a.hours),
                                }))}
                            />
                        ) : (
                            <MiniTable
                                head={[t('analytics.colType'), t('analytics.colPeople'), t('analytics.colDays'), t('analytics.colHours')]}
                                rows={data.absences.map((a) => [t(`timeoff.${a.kind}` as TranslationKey), a.people, a.days, fmtHours(a.hours)])}
                                foot={['Σ', '', data.absences.reduce((s, a) => s + a.days, 0), fmtHours(totals.absence_hours)]}
                            />
                        )
                    }
                </ChartCard>

                {/* Lateness */}
                <ChartCard
                    title={t('analytics.lateness')}
                    hint={data.lateness.avg_late_min !== null ? t('analytics.avgLate', { n: data.lateness.avg_late_min }) : t('analytics.lateHint')}
                    noTable={punct.checked === 0}
                >
                    {(view) =>
                        punct.checked === 0 ? (
                            <p className="text-small text-ink-soft dark:text-slate-400">{t('analytics.noTimedShifts')}</p>
                        ) : view === 'chart' ? (
                            <div className="space-y-3">
                                <LatenessBar lateness={data.lateness} />
                                {late.length > 0 ? (
                                    <div>
                                        <p className="mb-1 text-label text-ink-soft dark:text-slate-400">{t('analytics.mostLate')}</p>
                                        <ul className="divide-y divide-ink/5 dark:divide-white/6">
                                            {late.map((m) => (
                                                <li key={m.user_id} className="flex items-center gap-2 py-1.5 text-small">
                                                    <span className="min-w-0 flex-1 truncate text-ink dark:text-slate-200">{m.name}</span>
                                                    <span className="tabular-nums text-ink-soft dark:text-slate-400">
                                                        {[m.late ? `${m.late}× ${t('analytics.colLate').toLowerCase()}` : '', m.noShow ? `${m.noShow}× ${t('analytics.noShow').toLowerCase()}` : '']
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="text-small text-ink-soft dark:text-slate-400">{t('analytics.noLate')}</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <MiniTable
                                    head={[t('analytics.colType'), t('analytics.colShifts')]}
                                    rows={LATE_BUCKETS.map((b) => [t(b.labelKey), data.lateness[b.key]])}
                                />
                                {late.length > 0 && (
                                    <MiniTable
                                        head={[t('analytics.colPerson'), t('analytics.colLate'), t('analytics.noShow'), t('analytics.colAvgLate')]}
                                        rows={late.map((m) => [m.name, m.late, m.noShow, m.avgLateMin ?? '—'])}
                                    />
                                )}
                            </div>
                        )
                    }
                </ChartCard>

                {/* Locations */}
                <ChartCard title={data.can_cost ? t('analytics.costByLocation') : t('analytics.hoursByLocation')}>
                    {(view) =>
                        view === 'chart' ? (
                            <BarList
                                ariaLabel={data.can_cost ? t('analytics.costByLocation') : t('analytics.hoursByLocation')}
                                rows={shares.map((l) => ({
                                    key: l.location_id ?? 'none',
                                    label: locName(l.name),
                                    sub: `${fmtHours(l.worked)} / ${fmtHours(l.planned)}`,
                                    value: data.can_cost ? (l.cost ?? 0) : l.worked,
                                    display: `${fmtPct(l.share, lang)}${data.can_cost ? ` · ${money(l.cost ?? 0)}` : ''}`,
                                }))}
                            />
                        ) : (
                            <MiniTable
                                head={[t('analytics.colLocation'), t('analytics.planned'), t('analytics.worked'), ...(data.can_cost ? [t('analytics.colCost')] : []), t('analytics.colShare')]}
                                rows={shares.map((l) => [
                                    locName(l.name),
                                    fmtHours(l.planned),
                                    fmtHours(l.worked),
                                    ...(data.can_cost ? [money(l.cost ?? 0)] : []),
                                    fmtPct(l.share, lang),
                                ])}
                            />
                        )
                    }
                </ChartCard>

                {/* Overtime */}
                <ChartCard title={t('analytics.overtime')} hint={t('analytics.overtimeHint')} noTable>
                    {() =>
                        overtime.length === 0 ? (
                            <p className="text-small text-ink-soft dark:text-slate-400">{t('analytics.noOvertime')}</p>
                        ) : (
                            <MiniTable
                                head={[t('analytics.colPerson'), t('analytics.planned'), t('analytics.worked'), t('analytics.colOver')]}
                                rows={overtime.map((o) => [o.name, fmtHours(o.planned), fmtHours(o.worked), `+${fmtHours(o.over)}`])}
                            />
                        )
                    }
                </ChartCard>
            </div>

            {/* Everyone */}
            <section>
                <h2 className="mb-2 px-1 text-heading text-ink dark:text-white">{t('analytics.byPerson')}</h2>
                <DataTable columns={memberCols} rows={data.members} rowKey={(m) => m.user_id} />
            </section>
        </>
    );
}
