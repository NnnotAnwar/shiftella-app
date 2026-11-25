import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, MapPinIcon, PaperPlaneTiltIcon, CalendarPlusIcon, MegaphoneSimpleIcon, FlaskIcon, XIcon, type Icon } from '@phosphor-icons/react';
import { supabase } from '@shared/api/supabaseClient';
import { can, isSuperAdmin } from '@shared/auth/permissions';
import { Button } from '@shared/components/Button';
import { useDemoData } from '@features/demo/useDemoData';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import type { User } from '@shared/types';

/**
 * --- GETTING STARTED (new organization owners) ---
 * After sign-up the owner lands on an empty Home. Four steps get a team
 * going: a location, people, a first planned week, and publishing it (only
 * then do employees see their shifts and get notified). Each ticks itself off
 * from real data and says in one line what to do; the next open step is
 * highlighted. The card disappears once all are done (or when hidden).
 * Demo data (see features/demo) never ticks a step off; until there is some,
 * the owner can fill the org with it in one tap to look around first.
 */

const hiddenKey = (uid: string) => `getting-started:hidden:${uid}`;
const readHidden = (uid: string) => {
    try {
        return localStorage.getItem(hiddenKey(uid)) === '1';
    } catch {
        return false;
    }
};

async function countOf(table: 'profiles' | 'scheduled_shifts', orgId: string, publishedOnly = false) {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('demo_batch', null);
    if (publishedOnly) q = q.eq('published', true);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
}

export function GettingStarted({ user, locationCount }: { user: User; locationCount: number }) {
    const t = useTranslation();
    const [hidden, setHidden] = useState(() => readHidden(user.id));
    const eligible = can(user, 'locations.manage') && !isSuperAdmin(user) && !hidden;
    const demo = useDemoData(user);

    const counts = useQuery({
        queryKey: ['getting-started', user.organization_id],
        enabled: eligible,
        staleTime: 60_000,
        queryFn: async () => {
            const [people, shifts, published] = await Promise.all([
                countOf('profiles', user.organization_id),
                countOf('scheduled_shifts', user.organization_id),
                countOf('scheduled_shifts', user.organization_id, true),
            ]);
            return { people, shifts, published };
        },
    });
    if (!eligible || !counts.data) return null;

    const steps: { done: boolean; icon: Icon; label: string; hint: string; to: string }[] = [
        { done: locationCount > 0, icon: MapPinIcon, label: t('start.location'), hint: t('start.locationHint'), to: '/admin?tab=locations' },
        { done: counts.data.people > 1, icon: PaperPlaneTiltIcon, label: t('start.invite'), hint: t('start.inviteHint'), to: '/admin' },
        { done: counts.data.shifts > 0, icon: CalendarPlusIcon, label: t('start.plan'), hint: t('start.planHint'), to: '/schedule' },
        { done: counts.data.published > 0, icon: MegaphoneSimpleIcon, label: t('start.publish'), hint: t('start.publishHint'), to: '/schedule' },
    ];
    if (steps.every((s) => s.done)) return null;
    const doneCount = steps.filter((s) => s.done).length;
    // The first open step is the one to do now.
    const nextIndex = steps.findIndex((s) => !s.done);

    const hide = () => {
        setHidden(true);
        try {
            localStorage.setItem(hiddenKey(user.id), '1');
        } catch {
            /* storage unavailable — hidden for this session only */
        }
    };

    return (
        <section className="glass mb-4 rounded-2xl p-3 sm:p-4">
            <header className="mb-2 flex items-start justify-between gap-2 px-1">
                <div>
                    <h2 className="text-card-title text-ink dark:text-white">{t('start.title')}</h2>
                    <p className="text-caption text-ink-soft dark:text-slate-400">{t('start.sub', { done: doneCount, total: steps.length })}</p>
                </div>
                <button
                    type="button"
                    onClick={hide}
                    aria-label={t('start.hide')}
                    className="-mr-1 rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink dark:text-slate-400 dark:hover:bg-white/8"
                >
                    <XIcon weight="bold" className="size-4" />
                </button>
            </header>
            <div
                className="mx-1 mb-2.5 h-1 overflow-hidden rounded-full bg-ink/6 dark:bg-white/8"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={steps.length}
                aria-valuenow={doneCount}
                aria-label={t('start.title')}
            >
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map(({ done, icon: StepIcon, label, hint, to }, i) => {
                    const isNext = i === nextIndex;
                    return (
                        <li key={label}>
                            <Link
                                to={to}
                                aria-current={isNext ? 'step' : undefined}
                                className={`flex h-full min-h-11 items-start gap-2.5 rounded-xl px-2.5 py-2 ring-1 transition-colors ${
                                    done
                                        ? 'bg-emerald-500/8 ring-emerald-500/20'
                                        : isNext
                                          ? 'bg-white/80 ring-emerald-500/40 hover:bg-white dark:bg-white/8 dark:ring-emerald-400/40 dark:hover:bg-white/12'
                                          : 'bg-white/55 ring-ink/5 hover:bg-white/80 dark:bg-white/4 dark:ring-white/6 dark:hover:bg-white/8'
                                }`}
                            >
                                <span
                                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                                        done ? 'bg-emerald-600 text-white' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                >
                                    {done ? <CheckIcon weight="bold" className="size-3.5" /> : <StepIcon weight="bold" className="size-3.5" />}
                                </span>
                                <span className="min-w-0">
                                    <span
                                        className={`block text-meta font-semibold ${
                                            done ? 'text-emerald-700 line-through decoration-emerald-600/40 dark:text-emerald-300' : 'text-ink dark:text-white'
                                        }`}
                                    >
                                        {label}
                                    </span>
                                    {!done && <span className="block text-caption text-ink-soft dark:text-slate-400">{hint}</span>}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ol>
            {demo.loaded && !demo.active && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-ink/6 px-1 pt-2.5 dark:border-white/8">
                    <p className="min-w-0 text-caption text-ink-soft dark:text-slate-400">{t('demo.tryHint')}</p>
                    <Button size="sm" variant="tonal" icon={FlaskIcon} loading={demo.seeding} onClick={demo.seed} className="shrink-0">
                        {t('demo.try')}
                    </Button>
                </div>
            )}
        </section>
    );
}
