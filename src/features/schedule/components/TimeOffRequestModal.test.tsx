import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const me = { id: 'u1', organization_id: 'org1', role: 'Employee', permissions: {} };
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: me }) }));
vi.mock('@shared/preferences/PreferencesContext', () => ({
    useTranslation: () => (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).join(',')}` : k),
}));
vi.mock('@shared/toast/toastStore', () => ({ toast: vi.fn() }));
vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('../scheduleService', () => ({ scheduleService: { requestTimeOff: vi.fn(async () => undefined) } }));
vi.mock('@features/leave/leaveService', async (orig) => {
    const real = await orig<typeof import('@features/leave/leaveService')>();
    return {
        ...real,
        leaveService: {
            getSettings: vi.fn(async () => ({ enabled_kinds: ['vacation', 'comp_time', 'doctor'], weekly_hours: 40, vacation_weeks: 4, holiday_comp_time: true })),
            balances: vi.fn(async () => [
                {
                    user_id: 'u1', name: 'Me', weekly_hours: 40, vacation_entitlement: 160, vacation_custom: false, vacation_adjust: 0,
                    vacation_used: 64, vacation_pending: 0, vacation_left: 96, comp_earned: 8, comp_adjust: 0, comp_used: 0, comp_pending: 0, comp_left: 8,
                },
            ]),
        },
    };
});

import { TimeOffRequestModal } from './TimeOffCard';
import { scheduleService } from '../scheduleService';

function renderModal() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={qc}>
            <TimeOffRequestModal members={[]} selfId="u1" orgId="org1" managerMode={false} onClose={() => {}} />
        </QueryClientProvider>,
    );
}

describe('TimeOffRequestModal', () => {
    beforeEach(() => vi.mocked(scheduleService.requestTimeOff).mockClear());

    it('offers only the kinds the organization enabled and shows the vacation balance', async () => {
        renderModal();
        expect(await screen.findByText('timeoff.balanceVacation:96 h,160 h')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'timeoff.vacation' }));
        const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
        expect(options).toEqual(['timeoff.vacation', 'timeoff.comp_time', 'timeoff.doctor']);
        await userEvent.click(screen.getByRole('option', { name: 'timeoff.comp_time' }));
        expect(screen.getByText('timeoff.balanceComp:8 h')).toBeInTheDocument();
    });

    it('part of a day sends its hours; a whole day leaves them to the database', async () => {
        renderModal();
        await screen.findByText('timeoff.balanceVacation:96 h,160 h');
        await userEvent.click(screen.getByRole('button', { name: 'timeoff.vacation' }));
        await userEvent.click(screen.getByRole('option', { name: 'timeoff.doctor' }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'timeoff.partDay' }));
        const hours = screen.getByRole('spinbutton', { name: 'timeoff.hours' });
        await userEvent.clear(hours);
        await userEvent.type(hours, '2');
        await userEvent.click(screen.getByRole('button', { name: 'timeoff.send' }));
        expect(scheduleService.requestTimeOff).toHaveBeenCalledWith(expect.objectContaining({ kind: 'doctor', hours: 2, approved: false }));
    });

    it('a whole-day request carries no hours', async () => {
        renderModal();
        await screen.findByText('timeoff.balanceVacation:96 h,160 h');
        await userEvent.click(screen.getByRole('button', { name: 'timeoff.send' }));
        expect(scheduleService.requestTimeOff).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vacation', hours: null }));
    });
});
