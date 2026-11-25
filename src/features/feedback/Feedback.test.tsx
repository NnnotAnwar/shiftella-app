import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FeedbackHost } from './FeedbackDialog';
import { FeedbackInboxPage } from './FeedbackInboxPage';
import { openFeedback } from './feedbackSignal';

// --- supabase: records inserts / updates / filters; serves the inbox rows ----
const calls = {
    inserts: [] as unknown[],
    updates: [] as { patch: unknown; id: unknown }[],
    filters: [] as [string, unknown][],
};
const state = { insertError: null as null | { message: string }, rows: [] as Record<string, unknown>[] };
vi.mock('@shared/api/supabaseClient', () => ({
    supabase: {
        from: () => {
            let patch: unknown = null;
            const q = {
                insert: (row: unknown) => {
                    calls.inserts.push(row);
                    return Promise.resolve({ error: state.insertError });
                },
                update: (p: unknown) => {
                    patch = p;
                    return q;
                },
                select: () => q,
                eq: (col: string, v: unknown) => {
                    if (patch) {
                        calls.updates.push({ patch, id: v });
                        return Promise.resolve({ error: null });
                    }
                    calls.filters.push([col, v]);
                    return q;
                },
                order: () => q,
                limit: () => Promise.resolve({ data: state.rows, error: null }),
            };
            return q;
        },
    },
}));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'sk' }) };
});
const toasts: [string, string][] = [];
vi.mock('@shared/toast/toastStore', () => ({ toast: (m: string, type: string) => void toasts.push([m, type]) }));
const auth = { user: null as null | { id: string; role: { name: string; is_admin: boolean; rank: number } } };
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => auth }));

function wrap(ui: ReactNode, path = '/schedule') {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/" element={<p>home</p>} />
                    <Route path="*" element={ui} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    calls.inserts.length = 0;
    calls.updates.length = 0;
    calls.filters.length = 0;
    toasts.length = 0;
    state.insertError = null;
    state.rows = [];
    auth.user = { id: 'u1', role: { name: 'Employee', is_admin: false, rank: 0 } };
});

describe('Send feedback dialog', () => {
    it('opens from anywhere, sends type + message + context, then thanks and closes', async () => {
        wrap(<FeedbackHost />, '/schedule');
        act(() => void openFeedback({ kind: 'bug' }));
        fireEvent.change(await screen.findByLabelText('feedback.message'), { target: { value: '  Export crashes  ' } });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'feedback.send' }));

        await waitFor(() => expect(toasts).toEqual([['feedback.thanks', 'success']]));
        expect(calls.inserts).toHaveLength(1);
        const row = calls.inserts[0] as Record<string, unknown>;
        expect(row).toMatchObject({ kind: 'bug', message: 'Export crashes', may_contact: true, route: '/schedule', language: 'sk', app_version: __APP_VERSION__ });
        expect(typeof row.user_agent).toBe('string');
        // The server sets who sent it and their organization — never the client.
        expect(row).not.toHaveProperty('user_id');
        expect(row).not.toHaveProperty('organization_id');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('needs a message; picking a type changes it', async () => {
        wrap(<FeedbackHost />);
        act(() => void openFeedback());
        await screen.findByRole('dialog');
        expect(screen.getByRole('radio', { name: 'feedback.kind.idea' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('radio', { name: 'feedback.kind.praise' }));
        expect(screen.getByRole('radio', { name: 'feedback.kind.praise' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'feedback.send' }));
        expect(await screen.findByText('feedback.empty')).toBeInTheDocument();
        expect(calls.inserts).toHaveLength(0);
    });

    it('shows the rate-limit message from the database and stays open', async () => {
        state.insertError = { message: 'feedback_rate_limited' };
        wrap(<FeedbackHost />);
        act(() => void openFeedback());
        fireEvent.change(await screen.findByLabelText('feedback.message'), { target: { value: 'Again' } });
        fireEvent.click(screen.getByRole('button', { name: 'feedback.send' }));
        expect(await screen.findByText('feedback.rateLimited')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(toasts).toEqual([]);
    });
});

const row = (over: Record<string, unknown> = {}) => ({
    id: 'f1',
    user_id: 'u9',
    organization_id: 'o1',
    kind: 'bug',
    message: 'Export crashes on Safari',
    may_contact: true,
    route: '/timesheets',
    app_version: '1.13.0',
    language: 'cs',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15',
    status: 'new',
    created_at: '2026-11-25T10:00:00Z',
    author: { first_name: 'Jana', last_name: 'Nová', username: 'jana', email: 'jana@example.com' },
    organization: { name: 'Café U Mostu' },
    ...over,
});

describe('Feedback inbox', () => {
    it('is for the platform Superadmin only', async () => {
        wrap(<FeedbackInboxPage />, '/feedback');
        expect(await screen.findByText('home')).toBeInTheDocument();
    });

    it('lists feedback, filters by type and status, opens a row (marks it seen) and moves status on with one tap', async () => {
        auth.user = { id: 'sa', role: { name: 'Superadmin', is_admin: true, rank: 100 } };
        state.rows = [row(), row({ id: 'f2', kind: 'idea', status: 'done', message: 'Dark mode', may_contact: false })];
        wrap(<FeedbackInboxPage />, '/feedback');

        expect(await screen.findByText('Export crashes on Safari')).toBeInTheDocument();
        expect(screen.getByText('Dark mode')).toBeInTheDocument();
        // E-mail only when they agreed to be contacted.
        expect(screen.getAllByText('jana@example.com')).toHaveLength(1);

        // Opening a new message marks it seen.
        fireEvent.click(screen.getByText('Export crashes on Safari'));
        await waitFor(() => expect(calls.updates).toEqual([{ patch: { status: 'seen' }, id: 'f1' }]));
        expect(screen.getByText('· Safari 18 · macOS')).toBeInTheDocument();

        // The pill cycles done → new.
        fireEvent.click(screen.getByRole('button', { name: 'feedback.statusNext:feedback.status.done,feedback.status.new' }));
        await waitFor(() => expect(calls.updates.at(-1)).toEqual({ patch: { status: 'new' }, id: 'f2' }));

        // Filters go to the query.
        fireEvent.click(screen.getByRole('button', { name: 'feedback.col.type' }));
        fireEvent.click(await screen.findByRole('option', { name: 'feedback.kind.bug' }));
        await waitFor(() => expect(calls.filters).toContainEqual(['kind', 'bug']));
    });
});
