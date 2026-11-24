import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'boss', organization_id: 'org1' } }) }));
vi.mock('@shared/preferences/PreferencesContext', () => ({
    useTranslation: () => (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k),
}));
vi.mock('@shared/toast/toastStore', () => ({ toast: vi.fn() }));
vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));

const row = (id: string, name: string, extra: Record<string, number> = {}) => ({
    user_id: id, name, weekly_hours: 40, vacation_entitlement: 160, vacation_custom: false, vacation_adjust: 0, vacation_used: 0,
    vacation_pending: 0, vacation_left: 160, comp_earned: 0, comp_adjust: 0, comp_used: 0, comp_pending: 0, comp_left: 0, ...extra,
});

vi.mock('./leaveService', async (orig) => {
    const real = await orig<typeof import('./leaveService')>();
    return {
        ...real,
        leaveService: {
            getSettings: vi.fn(async () => real.DEFAULT_LEAVE_SETTINGS),
            saveSettings: vi.fn(async () => undefined),
            balances: vi.fn(async () => [
                row('boss', 'Boss'),
                row('eva', 'Eva', { vacation_used: 64, vacation_left: 96, vacation_pending: 16, comp_earned: 8, comp_left: 8 }),
            ]),
            memberLeave: vi.fn(async () => null),
            adjustments: vi.fn(async () => []),
            setMemberLeave: vi.fn(async () => undefined),
            addAdjustment: vi.fn(async () => undefined),
            deleteAdjustment: vi.fn(async () => undefined),
        },
    };
});

import { LeaveBalancesModal } from './LeaveBalancesModal';
import { leaveService } from './leaveService';

function renderModal(canDecide: boolean) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <LeaveBalancesModal selfId="boss" canDecide={canDecide} onClose={() => {}} />
        </QueryClientProvider>,
    );
}

describe('LeaveBalancesModal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists vacation left of the total, waiting hours and the náhradní volno bank; no edit for oneself', async () => {
        renderModal(true);
        expect(await screen.findByText('leave.ofTotal:96 h,160 h')).toBeInTheDocument();
        expect(screen.getByText('leave.pending:16 h')).toBeInTheDocument();
        expect(screen.getByText('8 h')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'leave.edit: Eva' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'leave.edit: Boss' })).toBeNull();
    });

    it('viewers without the decide right see no edit buttons and no settings', async () => {
        renderModal(false);
        await screen.findByText('leave.ofTotal:96 h,160 h');
        expect(screen.queryByRole('button', { name: /leave\.edit/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'leave.tabSettings' })).toBeNull();
    });

    it('a decider adds hours to someone\'s vacation', async () => {
        renderModal(true);
        await userEvent.click(await screen.findByRole('button', { name: 'leave.edit: Eva' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'leave.adjustHours' }), '16');
        await userEvent.type(screen.getByPlaceholderText('leave.adjustNote'), 'carry-over');
        await userEvent.click(screen.getByRole('button', { name: 'leave.adjustAdd' }));
        expect(leaveService.addAdjustment).toHaveBeenCalledWith('eva', 'vacation', 16, 'carry-over', new Date().getFullYear());
    });

    it('settings: switching a kind on and saving', async () => {
        renderModal(true);
        await userEvent.click(await screen.findByRole('button', { name: 'leave.tabSettings' }));
        await userEvent.click(await screen.findByRole('checkbox', { name: 'timeoff.home_office' }));
        await userEvent.click(screen.getByRole('button', { name: 'common.save' }));
        expect(leaveService.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled_kinds: expect.arrayContaining(['home_office', 'vacation']) }));
    });
});
