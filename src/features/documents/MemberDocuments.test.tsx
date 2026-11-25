import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type U = { id: string; role: { name: string; rank: number }; organization_id: string; permissions?: Record<string, { read: boolean; write: boolean; delete: boolean }> };
let me: U;
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: me }) }));
vi.mock('@shared/preferences/PreferencesContext', () => ({
    useTranslation: () => (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k),
}));
vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));

const docs = [
    { id: 'd1', organization_id: 'o1', user_id: 'eva', doc_type: 'health_card', name: 'Zdravotní průkaz', file_path: 'o1/eva/d1.pdf', mime_type: 'application/pdf', valid_until: null as string | null, uploaded_by: 'boss', created_at: '2026-11-01T10:00:00Z' },
    { id: 'd2', organization_id: 'o1', user_id: 'eva', doc_type: 'contract', name: 'Smlouva', file_path: 'o1/eva/d2.pdf', mime_type: 'application/pdf', valid_until: null as string | null, uploaded_by: 'eva', created_at: '2026-11-02T10:00:00Z' },
];

vi.mock('./documentsService', () => ({
    documentsService: {
        list: vi.fn(async () => docs),
        upload: vi.fn(async (i: { name: string }) => ({ ...docs[1], id: 'new', name: i.name })),
        remove: vi.fn(async () => undefined),
        signedUrl: vi.fn(async () => 'https://signed'),
    },
}));

import { MemberDocuments } from './MemberDocuments';
import { documentsService } from './documentsService';
import { toastStore } from '@shared/toast/toastStore';
import { isoDay } from './documentTypes';

const eva = { id: 'eva', organization_id: 'o1', role: { name: 'Employee', rank: 0 } } as never;
const admin: U = { id: 'boss', organization_id: 'o1', role: { name: 'Admin', rank: 30 } };
const manager: U = { id: 'mgr', organization_id: 'o1', role: { name: 'Manager', rank: 20 }, permissions: { members: { read: true, write: false, delete: false } } };
const colleague: U = { id: 'jan', organization_id: 'o1', role: { name: 'Employee', rank: 0 } };

let qc: QueryClient;
function renderIt() {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemberDocuments member={eva} />
        </QueryClientProvider>,
    );
}

const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return isoDay(d);
};

describe('MemberDocuments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        docs[0].valid_until = inDays(10);
        docs[1].valid_until = null;
    });
    afterEach(() => toastStore.getSnapshot().forEach((t) => toastStore.dismiss(t.id, true)));

    it('a colleague sees nothing and loads nothing', () => {
        me = colleague;
        const { container } = renderIt();
        expect(container).toBeEmptyDOMElement();
        expect(documentsService.list).not.toHaveBeenCalled();
    });

    it('the admin lists documents with an amber chip inside 30 days, can add and delete', async () => {
        me = admin;
        renderIt();
        const row = (await screen.findByText('Zdravotní průkaz')).closest('li')!;
        const chip = within(row).getByText(/^docs\.chip\.valid:/);
        expect(chip).toHaveAttribute('data-state', 'soon');
        expect(screen.getByRole('button', { name: 'docs.add' })).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'common.delete' })).toHaveLength(2);
    });

    it('a red chip once expired', async () => {
        me = admin;
        docs[0].valid_until = inDays(-1);
        renderIt();
        const row = (await screen.findByText('Zdravotní průkaz')).closest('li')!;
        expect(within(row).getByText(/^docs\.chip\.expired:/)).toHaveAttribute('data-state', 'expired');
    });

    it('a manager (Team view only) reads and downloads, but can\'t add or delete', async () => {
        me = manager;
        renderIt();
        await screen.findByText('Smlouva');
        expect(screen.queryByRole('button', { name: 'docs.add' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'common.delete' })).toBeNull();
        expect(screen.getAllByRole('button', { name: 'docs.download' })).toHaveLength(2);
    });

    it('the member deletes only what they uploaded themselves', async () => {
        me = { id: 'eva', organization_id: 'o1', role: { name: 'Employee', rank: 0 } };
        renderIt();
        await screen.findByText('Smlouva');
        const deletes = screen.getAllByRole('button', { name: 'common.delete' });
        expect(deletes).toHaveLength(1);
        expect(screen.getByText('Smlouva').closest('li')).toContainElement(deletes[0]);
    });

    it('delete is one tap with Undo; the file goes only when the toast expires', async () => {
        me = admin;
        renderIt();
        await screen.findByText('Smlouva');
        await userEvent.click(within(screen.getByText('Smlouva').closest('li')!).getByRole('button', { name: 'common.delete' }));
        expect(screen.queryByText('Smlouva')).toBeNull();
        expect(documentsService.remove).not.toHaveBeenCalled();
        const [t] = toastStore.getSnapshot();
        expect(t.message).toBe('docs.deleted');
        act(() => toastStore.dismiss(t.id));
        expect(documentsService.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' }));
    });

    it('a refetch inside the Undo window does not bring the document back', async () => {
        me = admin;
        renderIt();
        await screen.findByText('Smlouva');
        await userEvent.click(within(screen.getByText('Smlouva').closest('li')!).getByRole('button', { name: 'common.delete' }));
        await act(async () => {
            await qc.refetchQueries();
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(documentsService.list).toHaveBeenCalledTimes(2);
        expect(screen.queryByText('Smlouva')).toBeNull();
        const [t] = toastStore.getSnapshot();
        act(() => toastStore.dismiss(t.id));
    });

    it('Undo keeps the document', async () => {
        me = admin;
        renderIt();
        await screen.findByText('Smlouva');
        await userEvent.click(within(screen.getByText('Smlouva').closest('li')!).getByRole('button', { name: 'common.delete' }));
        const [t] = toastStore.getSnapshot();
        act(() => {
            t.action!.onClick();
            toastStore.dismiss(t.id, true);
        });
        expect(await screen.findByText('Smlouva')).toBeInTheDocument();
        expect(documentsService.remove).not.toHaveBeenCalled();
    });

    it('rejects a Word file; uploads a PDF with its type and date', async () => {
        me = admin;
        renderIt();
        await screen.findByText('Smlouva');
        const input = screen.getByTestId('doc-file') as HTMLInputElement;
        await userEvent.upload(input, new File(['x'], 'cv.docx', { type: 'application/msword' }), { applyAccept: false });
        expect(toastStore.getSnapshot().map((t) => t.message)).toContain('docs.errType');
        expect(screen.queryByRole('button', { name: 'docs.upload' })).toBeNull();

        await userEvent.upload(input, new File(['%PDF'], 'Zdravotni_prukaz.pdf', { type: 'application/pdf' }));
        expect(screen.getByRole('textbox', { name: 'docs.name' })).toHaveValue('Zdravotni prukaz');
        await userEvent.click(screen.getByRole('button', { name: 'docs.upload' }));
        expect(documentsService.upload).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'eva', organizationId: 'o1', docType: 'contract', name: 'Zdravotni prukaz', validUntil: null }),
        );
        expect(await screen.findByText('Zdravotni prukaz')).toBeInTheDocument();
    });
});
