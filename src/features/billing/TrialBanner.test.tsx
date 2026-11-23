import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@shared/types';
import type { Plan } from './plans';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};
const ended = {
    plan: 'free' as Plan, isTrial: false, trialDaysLeft: null, trialExpired: false, planEnded: true, endedSubscriptionId: 'sub_1',
    bypass: false, isLoading: false,
};
const state = { native: false, ent: { ...ended } };

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: owner }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
vi.mock('./useBilling', async (orig) => ({
    ...(await orig<typeof import('./useBilling')>()),
    isNativeApp: () => state.native,
    useEntitlements: () => state.ent,
}));

import { TrialBanner } from './TrialBanner';

const renderAt = (path = '/') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <TrialBanner />
        </MemoryRouter>,
    );

describe('TrialBanner — paid subscription ended', () => {
    beforeEach(() => {
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        });
        state.native = false;
        state.ent = { ...ended };
    });
    afterEach(() => vi.unstubAllGlobals());

    it('"Your subscription has ended" with a "Choose plan" link; hidden for the day once dismissed', () => {
        const view = renderAt();
        expect(screen.getByText('billing.planEndedBanner')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'billing.choosePlan' })).toHaveAttribute('href', '/billing');
        fireEvent.click(screen.getByRole('button', { name: 'billing.dismiss' }));
        expect(screen.queryByText('billing.planEndedBanner')).toBeNull();
        view.unmount();
        renderAt();
        expect(screen.queryByText('billing.planEndedBanner')).toBeNull();
    });

    it('native: no link out, "manage on the web" instead; never on /billing', () => {
        state.native = true;
        const view = renderAt();
        expect(screen.getByText('billing.planEndedBanner')).toBeInTheDocument();
        expect(screen.queryByRole('link')).toBeNull();
        view.unmount();
        state.native = false;
        renderAt('/billing');
        expect(screen.queryByText('billing.planEndedBanner')).toBeNull();
    });
});
