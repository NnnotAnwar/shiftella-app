import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '@shared/types';
import type { Plan } from './plans';
import { shouldShowTrialEnded, trialEndedSeen } from './trialEnded';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};
const state = { user: owner as User, native: false, ent: { trialExpired: true, plan: 'free' as Plan, bypass: false, isLoading: false } };

vi.mock('@shared/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@features/auth/AuthContext', () => ({ useAuthContext: () => ({ user: state.user }) }));
vi.mock('@shared/preferences/PreferencesContext', () => {
    const t = (k: string, vars?: Record<string, string | number>) => (vars ? `${k}:${Object.values(vars).join(',')}` : k);
    return { useTranslation: () => t, usePreferences: () => ({ t, language: 'en' }) };
});
vi.mock('./useBilling', async (orig) => ({
    ...(await orig<typeof import('./useBilling')>()),
    isNativeApp: () => state.native,
    useEntitlements: () => state.ent,
}));

import { TrialEndedDialog } from './TrialEndedDialog';

const ent = { trialExpired: true, plan: 'free' as Plan, bypass: false, isLoading: false };
const rules = { ent, canManage: true, native: false, pathname: '/', seen: false };

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <TrialEndedDialog />
            <Routes>
                <Route path="/billing" element={<p>billing page</p>} />
                <Route path="*" element={<p>somewhere</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('shouldShowTrialEnded', () => {
    it('owner on the web, trial ended, on Free → yes', () => {
        expect(shouldShowTrialEnded(rules)).toBe(true);
    });

    it('never for non-owners, on native, once seen, while loading or for the Superadmin', () => {
        expect(shouldShowTrialEnded({ ...rules, canManage: false })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, native: true })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, seen: true })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, ent: { ...ent, isLoading: true } })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, ent: { ...ent, bypass: true } })).toBe(false);
    });

    it('not on /billing itself, nor while the trial runs or once they paid', () => {
        expect(shouldShowTrialEnded({ ...rules, pathname: '/billing' })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, ent: { ...ent, trialExpired: false } })).toBe(false);
        expect(shouldShowTrialEnded({ ...rules, ent: { ...ent, plan: 'team' } })).toBe(false);
    });
});

describe('TrialEndedDialog', () => {
    beforeEach(() => {
        // Newer Node ships its own (disabled) global localStorage that shadows
        // jsdom's; give the tests a plain in-memory one either way.
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, String(v)),
            removeItem: (k: string) => void store.delete(k),
            clear: () => store.clear(),
        });
        state.user = owner;
        state.native = false;
        state.ent = { ...ent };
    });
    afterEach(() => vi.unstubAllGlobals());

    it('shows once; "Stay on Free" closes it and it never comes back for this org', () => {
        const first = renderAt('/');
        expect(screen.getByRole('dialog', { name: 'billing.trialEnded.title' })).toBeInTheDocument();
        expect(trialEndedSeen('org1')).toBe(true);
        fireEvent.click(screen.getByText('billing.trialEnded.stay'));
        expect(screen.queryByRole('dialog')).toBeNull();
        first.unmount();

        renderAt('/');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('"Choose plan" goes to /billing', () => {
        renderAt('/');
        fireEvent.click(screen.getByText('billing.choosePlan'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByText('billing page')).toBeInTheDocument();
    });

    it('is per organization', () => {
        localStorage.setItem('billing-trial-ended-seen:other-org', '1');
        renderAt('/');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('not on /billing (that counts as seen), not for non-owners, not on native', () => {
        const onBilling = renderAt('/billing');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(trialEndedSeen('org1')).toBe(true);
        onBilling.unmount();
        localStorage.clear();

        state.user = { ...owner, role: { name: 'Manager', is_admin: true, rank: 30 } };
        const manager = renderAt('/');
        expect(screen.queryByRole('dialog')).toBeNull();
        manager.unmount();

        state.user = owner;
        state.native = true;
        renderAt('/');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
