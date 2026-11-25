import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ChatCircleTextIcon, EnvelopeSimpleIcon, LightbulbIcon, BugIcon, QuestionIcon, HeartIcon, type Icon } from '@phosphor-icons/react';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { PageHeader } from '@shared/components/PageHeader';
import { Select } from '@shared/components/Select';
import { DataTable, type Column } from '@shared/components/DataTable';
import { formatDateTime } from '@shared/utils/date';
import { useFeedbackInbox, useIsFeedbackAdmin, useSetFeedbackStatus } from './useFeedback';
import type { FeedbackRow, InboxFilters } from './feedbackService';
import {
    FEEDBACK_KINDS,
    FEEDBACK_STATUSES,
    KIND_LABEL,
    STATUS_LABEL,
    nextStatus,
    shortUserAgent,
    type FeedbackKind,
    type FeedbackStatus,
} from './feedbackLogic';

/**
 * --- FEEDBACK INBOX (platform Superadmin) ---
 * Everything users sent from "Send feedback", newest first, filtered by type
 * and status. Tap a row to read it in full (a new one becomes "seen"); tap the
 * status pill to move it on: new → seen → done. RLS lets only the Superadmin
 * read other people's rows; the page also self-guards.
 */

const KIND_ICON: Record<FeedbackKind, Icon> = { idea: LightbulbIcon, bug: BugIcon, question: QuestionIcon, praise: HeartIcon };
const KIND_TINT: Record<FeedbackKind, string> = {
    idea: 'text-amber-600 dark:text-amber-400',
    bug: 'text-rose-600 dark:text-rose-400',
    question: 'text-sky-600 dark:text-sky-400',
    praise: 'text-emerald-600 dark:text-emerald-300',
};
const STATUS_PILL: Record<FeedbackStatus, string> = {
    new: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
    seen: 'bg-ink/5 text-ink-soft ring-ink/10 dark:bg-white/6 dark:text-slate-300 dark:ring-white/10',
    done: 'bg-transparent text-ink-soft/70 ring-ink/8 line-through dark:text-slate-500 dark:ring-white/8',
};

function authorName(r: FeedbackRow): string {
    const a = r.author;
    const full = [a?.first_name, a?.last_name].filter(Boolean).join(' ');
    return full || a?.username || '—';
}

export function FeedbackInboxPage() {
    const t = useTranslation();
    const allowed = useIsFeedbackAdmin();
    const [filters, setFilters] = useState<InboxFilters>({ kind: 'all', status: 'all' });
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const q = useFeedbackInbox(filters);
    const setStatus = useSetFeedbackStatus();

    if (!allowed) return <Navigate to="/" replace />;

    const rows = q.data ?? [];
    const newCount = rows.filter((r) => r.status === 'new').length;

    const toggle = (r: FeedbackRow) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(r.id)) next.delete(r.id);
            else next.add(r.id);
            return next;
        });
        // Opening a new message marks it as seen — no extra tap.
        if (r.status === 'new') setStatus.mutate({ id: r.id, status: 'seen' });
    };

    const kindBadge = (k: FeedbackKind) => {
        const KindIcon = KIND_ICON[k];
        return (
            <span className={`inline-flex items-center gap-1 text-meta font-semibold ${KIND_TINT[k]}`}>
                <KindIcon weight="bold" className="size-3.5 shrink-0" />
                {t(KIND_LABEL[k])}
            </span>
        );
    };

    const columns: Column<FeedbackRow>[] = [
        {
            key: 'when',
            header: t('feedback.col.when'),
            width: 'w-32',
            hideOnMobile: true,
            render: (r) => <span className="text-caption tabular-nums text-ink-soft dark:text-slate-400">{formatDateTime(r.created_at)}</span>,
        },
        {
            key: 'kind',
            header: t('feedback.col.type'),
            width: 'w-28',
            hideOnMobile: true,
            render: (r) => kindBadge(r.kind),
        },
        {
            key: 'message',
            header: t('feedback.col.message'),
            render: (r) => {
                const open = expanded.has(r.id);
                const meta = [
                    r.organization?.name,
                    r.route,
                    r.app_version && `v${r.app_version}`,
                    r.language,
                    shortUserAgent(r.user_agent),
                ].filter(Boolean);
                return (
                    <div className="min-w-0 space-y-0.5">
                        {/* Phones: type + time stacked here (their columns hide). */}
                        <div className="flex items-center gap-2 sm:hidden">
                            {kindBadge(r.kind)}
                            <span className="text-caption tabular-nums text-ink-soft dark:text-slate-400">{formatDateTime(r.created_at)}</span>
                        </div>
                        <p className={`text-meta text-ink dark:text-white ${open ? 'whitespace-pre-wrap wrap-break-word' : 'truncate'} ${r.status === 'new' ? 'font-semibold' : ''}`}>
                            {r.message}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-ink-soft dark:text-slate-400">
                            <span className="font-semibold">{authorName(r)}</span>
                            {r.may_contact && r.author?.email && (
                                <a
                                    href={`mailto:${r.author.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline dark:text-emerald-300"
                                    title={t('feedback.mayContactYes')}
                                >
                                    <EnvelopeSimpleIcon weight="bold" className="size-3" />
                                    {r.author.email}
                                </a>
                            )}
                            {open
                                ? meta.map((m) => <span key={String(m)}>· {m}</span>)
                                : r.organization?.name && <span>· {r.organization.name}</span>}
                        </p>
                    </div>
                );
            },
        },
        {
            key: 'status',
            header: t('feedback.col.status'),
            // Fits the longest label ("Переглянуто", ~87px) after the cell padding.
            width: 'w-28 sm:w-32',
            align: 'right',
            render: (r) => (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setStatus.mutate({ id: r.id, status: nextStatus(r.status) });
                    }}
                    aria-label={t('feedback.statusNext', { status: t(STATUS_LABEL[r.status]), next: t(STATUS_LABEL[nextStatus(r.status)]) })}
                    title={t('feedback.statusNext', { status: t(STATUS_LABEL[r.status]), next: t(STATUS_LABEL[nextStatus(r.status)]) })}
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold ring-1 transition-colors hover:brightness-95 ${STATUS_PILL[r.status]}`}
                >
                    {t(STATUS_LABEL[r.status])}
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-3 px-1 pb-10">
            <PageHeader
                eyebrow={t('feedback.inboxEyebrow')}
                title={t('feedback.inboxTitle')}
                description={t('feedback.inboxDescription', { n: newCount })}
                actions={
                    <>
                        <Select
                            size="sm"
                            fullWidth={false}
                            value={filters.kind}
                            onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as InboxFilters['kind'] }))}
                            aria-label={t('feedback.col.type')}
                        >
                            <option value="all">{t('feedback.filter.allTypes')}</option>
                            {FEEDBACK_KINDS.map((k) => (
                                <option key={k} value={k}>
                                    {t(KIND_LABEL[k])}
                                </option>
                            ))}
                        </Select>
                        <Select
                            size="sm"
                            fullWidth={false}
                            value={filters.status}
                            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as InboxFilters['status'] }))}
                            aria-label={t('feedback.col.status')}
                        >
                            <option value="all">{t('feedback.filter.allStatuses')}</option>
                            {FEEDBACK_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {t(STATUS_LABEL[s])}
                                </option>
                            ))}
                        </Select>
                    </>
                }
            />

            {q.isError ? (
                <p className="glass rounded-2xl px-4 py-6 text-center text-meta text-rose-600 dark:text-rose-400">{t('feedback.loadFailed')}</p>
            ) : (
                <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.id}
                    isLoading={q.isLoading}
                    onRowClick={toggle}
                    emptyState={
                        <div className="glass flex flex-col items-center gap-1.5 rounded-2xl px-4 py-8 text-center">
                            <ChatCircleTextIcon weight="duotone" className="size-6 text-ink-soft dark:text-slate-400" />
                            <p className="text-meta text-ink-soft dark:text-slate-400">{t('feedback.inboxEmpty')}</p>
                        </div>
                    }
                />
            )}
        </div>
    );
}
