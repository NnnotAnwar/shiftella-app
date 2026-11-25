import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ShiftNote } from './types';

const me = {
    id: 'me', username: 'eva', first_name: 'Eva', last_name: null, email: 'e@x.io', organization_id: 'org',
    role: { name: 'Employee', is_admin: false, rank: 0 },
};
const shiftState = {
    activeShift: { id: 's1', user_id: 'me', location_id: 'loc', organization_id: 'org', started_at: new Date().toISOString(), ended_at: null, role: 'Employee' } as Record<string, unknown> | null,
    userShifts: [] as Record<string, unknown>[],
    locations: [{ id: 'loc', name: 'Malá Strana' }],
};
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: me }) }));
vi.mock('@features/shifts/ShiftContext', () => ({ useShiftContext: () => shiftState }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
type ToastOpts = { action?: { label: string; onClick: () => void }; onExpire?: () => void };
const toasts: { message: string; opts?: ToastOpts }[] = [];
vi.mock('@shared/toast/toastStore', () => ({
    toast: (message: string, _type: string, opts?: ToastOpts) => void toasts.push({ message, opts }),
}));

const mk = (over: Partial<ShiftNote>): ShiftNote => ({
    id: 'n1', shift_id: 'old', organization_id: 'org', location_id: 'loc', author_id: 'u2', body: 'Milk came',
    handover: true, created_at: new Date(Date.now() - 3600_000).toISOString(), updated_at: null,
    author: { first_name: 'Tomáš', last_name: 'Král', username: 'tomas' }, ...over,
});
const svc = vi.hoisted(() => ({
    handover: vi.fn(),
    readIds: vi.fn(),
    markRead: vi.fn(),
    unmarkRead: vi.fn(),
    forShifts: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
}));
vi.mock('./shiftNoteService', () => ({ shiftNoteService: svc }));

import { HandoverCard } from './HandoverCard';
import { ShiftNoteCard } from './ShiftNoteCard';

function renderWith(node: ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
    for (const f of Object.values(svc)) f.mockReset();
    svc.handover.mockResolvedValue([mk({ id: 'n1' }), mk({ id: 'n2', body: 'Cups ordered' })]);
    svc.readIds.mockResolvedValue([]);
    svc.markRead.mockResolvedValue(undefined);
    svc.unmarkRead.mockResolvedValue(undefined);
    svc.forShifts.mockResolvedValue([]);
    svc.remove.mockResolvedValue(undefined);
    toasts.length = 0;
    shiftState.activeShift = { id: 's1', user_id: 'me', location_id: 'loc', organization_id: 'org', started_at: new Date().toISOString(), ended_at: null, role: 'Employee' };
    shiftState.userShifts = [];
});

describe('HandoverCard', () => {
    it('shows unread handovers at my location with who wrote them', async () => {
        renderWith(<HandoverCard />);
        expect(await screen.findByText('Milk came')).toBeInTheDocument();
        expect(screen.getByText('Cups ordered')).toBeInTheDocument();
        expect(screen.getAllByText(/Tomáš Král/)).toHaveLength(2);
        expect(svc.handover).toHaveBeenCalledWith('loc', 'me');
    });

    it('hides notes I already read', async () => {
        svc.readIds.mockResolvedValue(['n1']);
        renderWith(<HandoverCard />);
        expect(await screen.findByText('Cups ordered')).toBeInTheDocument();
        expect(screen.queryByText('Milk came')).toBeNull();
    });

    it('one tap "Read" marks all, hides the card; Undo brings it back', async () => {
        renderWith(<HandoverCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'notes.read' }));
        await waitFor(() => expect(screen.queryByText('Milk came')).toBeNull());
        expect(svc.markRead).toHaveBeenCalledWith(me, ['n1', 'n2']);
        await waitFor(() => expect(toasts.some((t) => t.message === 'notes.markedRead')).toBe(true));
        const undo = toasts.find((t) => t.message === 'notes.markedRead')?.opts?.action;
        expect(undo?.label).toBe('common.undo');
        act(() => undo?.onClick());
        expect(await screen.findByText('Milk came')).toBeInTheDocument();
        expect(svc.unmarkRead).toHaveBeenCalledWith('me', ['n1', 'n2']);
    });

    it('nothing when not on shift', async () => {
        shiftState.activeShift = null;
        const { container } = renderWith(<HandoverCard />);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
        expect(svc.handover).not.toHaveBeenCalled();
    });
});

describe('ShiftNoteCard', () => {
    it('adds a handover note to the running shift inline (no modal)', async () => {
        svc.create.mockResolvedValue(mk({ id: 'new', shift_id: 's1', author_id: 'me' }));
        renderWith(<ShiftNoteCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'notes.add' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'notes.title' }), { target: { value: '  Coffee machine descaled ' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'notes.forNextShift' }));
        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        await waitFor(() => expect(svc.create).toHaveBeenCalledWith(me, 's1', { body: 'Coffee machine descaled', handover: true }));
        await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    });

    it('Save is off for an empty note', async () => {
        renderWith(<ShiftNoteCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'notes.add' }));
        expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
    });

    it('after clock-out it offers the shift that just ended', async () => {
        shiftState.activeShift = null;
        const ended = new Date(Date.now() - 20 * 60_000).toISOString();
        shiftState.userShifts = [{ id: 's0', ended_at: ended }];
        renderWith(<ShiftNoteCard />);
        expect(await screen.findByText(/notes.lastShiftTitle/)).toBeInTheDocument();
    });

    it('delete is one tap: hidden at once, removed on the server when Undo expires', async () => {
        svc.forShifts.mockResolvedValue([mk({ id: 'mine', shift_id: 's1', author_id: 'me', body: 'Typo note', created_at: new Date().toISOString() })]);
        renderWith(<ShiftNoteCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'common.delete' }));
        await waitFor(() => expect(screen.queryByText('Typo note')).toBeNull());
        expect(svc.remove).not.toHaveBeenCalled();
        const t = toasts.find((x) => x.message === 'notes.deleted');
        await act(async () => t?.opts?.onExpire?.());
        expect(svc.remove).toHaveBeenCalledWith('mine');
    });
});
