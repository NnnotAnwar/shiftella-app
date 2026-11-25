import { useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadSimpleIcon, FileImageIcon, FilePdfIcon, FolderOpenIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { useAuthContext } from '@features/auth/AuthContext';
import { can, outranks } from '@shared/auth/permissions';
import { Button } from '@shared/components/Button';
import { Input } from '@shared/components/Input';
import { Select } from '@shared/components/Select';
import { DatePicker } from '@shared/components/DatePicker';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import { formatDayNumeric } from '@shared/utils/date';
import type { Profile } from '@shared/types';
import { documentsService, type MemberDocument } from './documentsService';
import {
    DOC_ACCEPT,
    DOC_TYPES,
    EXPIRING_TYPES,
    docTypeKey,
    expiryState,
    isoDay,
    nameFromFile,
    validateDocFile,
    type DocType,
    type ExpiryState,
} from './documentTypes';

type Member = Pick<Profile, 'id' | 'organization_id' | 'role' | 'org_role'>;

const CHIP: Record<ExpiryState, string> = {
    ok: 'bg-ink/5 text-ink-soft dark:bg-white/10 dark:text-slate-300',
    soon: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    today: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/** "platí do 3. 2. 2027" — amber within 30 days, red when expired. */
export function ExpiryChip({ validUntil, today }: { validUntil: string | null | undefined; today: string }) {
    const t = useTranslation();
    const state = expiryState(validUntil, today);
    if (!state || !validUntil) return null;
    const date = formatDayNumeric(validUntil);
    const text =
        state === 'expired' ? t('docs.chip.expired', { date }) : state === 'today' ? t('docs.chip.today') : t('docs.chip.valid', { date });
    return (
        <span data-state={state} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-caption font-medium tabular-nums ${CHIP[state]}`}>
            {text}
        </span>
    );
}

function fmtSize(bytes?: number | null): string {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Documents deleted but still inside their Undo window. They stay hidden even
 * if the list refetches meanwhile (window focus, remount, another open view),
 * and the file is removed for real only when the toast expires.
 */
const pendingDeletes = new Set<string>();
const pendingListeners = new Set<() => void>();
let pendingVersion = 0;
const setPending = (id: string, on: boolean) => {
    if (on) pendingDeletes.add(id);
    else pendingDeletes.delete(id);
    pendingVersion++;
    pendingListeners.forEach((l) => l());
};
const subscribePending = (l: () => void) => {
    pendingListeners.add(l);
    return () => pendingListeners.delete(l);
};

/**
 * --- DOCUMENTS ---
 * A member's contracts, health certificates and trainings. The member sees and
 * adds their own (and may delete what they added); people who manage the team
 * see the members below them, add with Team "change" and delete with Team
 * "delete". Deleting is one tap with Undo — the file goes only once the toast
 * has gone. Renders nothing for people who may not see the documents.
 */
export function MemberDocuments({ member, className = '' }: { member: Member; className?: string }) {
    const t = useTranslation();
    const { user } = useAuthContext();
    const qc = useQueryClient();
    const fileRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<{ file: File; type: DocType; name: string; validUntil: string } | null>(null);

    const isSelf = !!user && user.id === member.id;
    const manages = !!user && !isSelf && outranks(user, member);
    const canView = isSelf || (manages && can(user, 'members.view'));
    const canUpload = isSelf || (manages && can(user, 'members.manage'));
    const canDelete = (d: MemberDocument) => (isSelf ? d.uploaded_by === user?.id : manages && can(user, 'members.delete'));
    const key = ['member-documents', member.id] as const;

    const docs = useQuery({ queryKey: key, queryFn: () => documentsService.list(member.id), enabled: canView });
    useSyncExternalStore(subscribePending, () => pendingVersion);

    const upload = useMutation({
        mutationFn: (d: NonNullable<typeof draft>) =>
            documentsService.upload({
                userId: member.id,
                organizationId: member.organization_id!,
                file: d.file,
                docType: d.type,
                name: d.name,
                validUntil: d.validUntil || null,
            }),
        onSuccess: (doc) => {
            qc.setQueryData<MemberDocument[]>(key, (old) => [doc, ...(old ?? [])]);
            setDraft(null);
            toast(t('docs.uploaded'), 'success');
        },
        onError: () => toast(t('docs.error'), 'error'),
    });

    if (!user || !canView || !member.organization_id) return null;

    const today = isoDay(new Date());
    const list = (docs.data ?? []).filter((d) => !pendingDeletes.has(d.id));

    const pick = (file: File | undefined) => {
        if (fileRef.current) fileRef.current.value = '';
        if (!file) return;
        const problem = validateDocFile(file);
        if (problem) {
            toast(t(problem), 'error');
            return;
        }
        setDraft({ file, type: 'contract', name: nameFromFile(file.name), validUntil: '' });
    };

    const remove = (doc: MemberDocument) => {
        // Hide now; delete for real once the Undo window has passed.
        setPending(doc.id, true);
        toast(t('docs.deleted'), 'success', {
            action: { label: t('common.undo'), onClick: () => setPending(doc.id, false) },
            onExpire: () => {
                documentsService
                    .remove(doc)
                    .then(() => qc.setQueryData<MemberDocument[]>(key, (old) => (old ?? []).filter((d) => d.id !== doc.id)))
                    .catch(() => toast(t('docs.error'), 'error'))
                    .finally(() => {
                        setPending(doc.id, false);
                        void qc.invalidateQueries({ queryKey: key });
                    });
            },
        });
    };

    const download = async (doc: MemberDocument) => {
        // Open the tab inside the tap (pop-up blockers), point it at the file once signed.
        const win = window.open('', '_blank');
        try {
            const url = await documentsService.signedUrl(doc.file_path);
            if (win) {
                win.opener = null;
                win.location.href = url;
            } else {
                window.location.assign(url);
            }
        } catch {
            win?.close();
            toast(t('docs.error'), 'error');
        }
    };

    return (
        <section className={`glass rounded-2xl overflow-hidden ${className}`} aria-label={t('docs.title')}>
            <div className="flex items-center gap-2 px-3.5 py-2.5">
                <FolderOpenIcon weight="bold" className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-meta font-semibold text-ink dark:text-white flex-1 min-w-0">
                    {t('docs.title')}
                    {list.length > 0 && <span className="ml-1.5 text-caption font-normal text-ink-soft dark:text-slate-400">{list.length}</span>}
                </h3>
                {canUpload && !draft && (
                    <Button size="sm" variant="tonal" icon={PlusIcon} onClick={() => fileRef.current?.click()}>
                        {t('docs.add')}
                    </Button>
                )}
                <input
                    ref={fileRef}
                    type="file"
                    accept={DOC_ACCEPT}
                    className="hidden"
                    data-testid="doc-file"
                    onChange={(e) => pick(e.target.files?.[0])}
                />
            </div>

            {draft && (
                <form
                    className="border-t border-ink/5 dark:border-white/5 px-3.5 py-3 space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        upload.mutate(draft);
                    }}
                >
                    <p className="text-caption text-ink-soft dark:text-slate-400 truncate">
                        {draft.file.name} · {fmtSize(draft.file.size)}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Select
                            size="sm"
                            fullWidth
                            aria-label={t('docs.type')}
                            value={draft.type}
                            onChange={(e) => setDraft({ ...draft, type: e.target.value as DocType })}
                        >
                            {DOC_TYPES.map((d) => (
                                <option key={d} value={d}>
                                    {t(docTypeKey(d))}
                                </option>
                            ))}
                        </Select>
                        <Input
                            aria-label={t('docs.name')}
                            placeholder={t('docs.name')}
                            value={draft.name}
                            maxLength={120}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-caption text-ink-soft dark:text-slate-400">
                            {t('docs.validUntil')}
                            {!EXPIRING_TYPES.includes(draft.type) && ` (${t('docs.optional')})`}
                        </span>
                        <DatePicker
                            aria-label={t('docs.validUntil')}
                            value={draft.validUntil}
                            onChange={(v) => setDraft({ ...draft, validUntil: v })}
                        />
                        {draft.validUntil && (
                            <Button size="sm" variant="ghost" icon={XIcon} aria-label={t('docs.noExpiry')} onClick={() => setDraft({ ...draft, validUntil: '' })} />
                        )}
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={upload.isPending}>
                            {t('common.cancel')}
                        </Button>
                        <Button size="sm" type="submit" loading={upload.isPending} disabled={!draft.name.trim()}>
                            {t('docs.upload')}
                        </Button>
                    </div>
                </form>
            )}

            {docs.isLoading ? (
                <p className="px-3.5 pb-3 text-caption text-ink-soft dark:text-slate-400">{t('common.loading')}</p>
            ) : list.length === 0 ? (
                !draft && <p className="px-3.5 pb-3 text-caption text-ink-soft dark:text-slate-400">{t(canUpload ? 'docs.emptyHint' : 'docs.empty')}</p>
            ) : (
                <ul className="divide-y divide-ink/5 dark:divide-white/5 border-t border-ink/5 dark:border-white/5">
                    {list.map((doc) => {
                        const isPdf = (doc.mime_type ?? '').includes('pdf');
                        const DocIcon = isPdf ? FilePdfIcon : FileImageIcon;
                        return (
                            <li key={doc.id} className="flex items-center gap-2.5 px-3.5 py-2">
                                <DocIcon weight="duotone" className="size-5 text-ink-soft dark:text-slate-400 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-meta font-medium text-ink dark:text-white truncate">{doc.name}</p>
                                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                        {/* The type, unless the name already says it. */}
                                        {t(docTypeKey(doc.doc_type)).toLowerCase() !== doc.name.trim().toLowerCase() && (
                                            <span className="text-caption text-ink-soft dark:text-slate-400">{t(docTypeKey(doc.doc_type))}</span>
                                        )}
                                        <ExpiryChip validUntil={doc.valid_until} today={today} />
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" icon={DownloadSimpleIcon} aria-label={t('docs.download')} title={t('docs.download')} onClick={() => download(doc)} />
                                {canDelete(doc) && (
                                    <Button size="sm" variant="ghost" icon={TrashIcon} aria-label={t('common.delete')} title={t('common.delete')} onClick={() => remove(doc)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
