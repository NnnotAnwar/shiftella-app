import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '@shared/types';
import type { Plan } from './plans';
import { endedPrompt, endedSeen, shouldShowEnded } from './endedPrompt';

const owner: User = {
    id: 'me', username: 'boss', first_name: 'Boss', last_name: null, email: 'b@x.io', organization_id: 'org1',
    role: { name: 'Head Admin', is_admin: true, rank: 40 },
};

type Ent = { trialExpired: boolean; planEnded: boolean; endedSubscriptionId: string | null; plan: Plan; bypass: boolean; isLoading: boolean };
const trialEnt: Ent = { trialExpired: true, planEnded: false, endedSubscriptionId: null, plan: 'free', bypass: false, isLoading: false };
const subEnt = (id = 'sub_1'): Ent => ({ ...trialEnt, trialExpired: false, planEnded: true, endedSubscriptionId: id });
const state = { user: owner as User, native: false, ent: trialEnt };

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

import { PlanEndedDialog } from './PlanEndedDialog';

const rules = { ent: trialEnt, canManage: true, native: false, pathname: '/', seen: false };

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <PlanEndedDialog />
            <Routes>
                <Route path="/billing" element={<p>billing page</p>} />
                <Route path="*" element={<p>somewhere</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('endedPrompt', () => {
    it('trial: remembered per organization', () => {
        expect(endedPrompt(trialEnt, 'org1')).toEqual({ kind: 'trial', seenKey: 'billing-trial-ended-seen:org1' });
    });

    it('subscription: remembered per organization and per ended subscription', () => {
        expect(endedPrompt(subEnt('sub_1'), 'org1')).toEqual({ kind: 'subscription', seenKey: 'billing-plan-ended-seen:org1:sub_1' });
        expect(endedPrompt(subEnt('sub_2'), 'org1')?.seenKey).toBe('billing-plan-ended-seen:org1:sub_2');
    });

    it('nothing ended, or no organization → null', () => {
        expect(endedPrompt({ ...trialEnt, trialExpired: false }, 'org1')).toBeNull();
        expect(endedPrompt(trialEnt, '')).toBeNull();
        expect(endedPrompt({ ...subEnt(), endedSubscriptionId: null }, 'org1')).toBeNull();
    });
});

describe('shouldShowEnded', () => {
    it('owner on the web, trial or paid plan ended, on Free → yes', () => {
        expect(shouldShowEnded(rules)).toBe(true);
        expect(shouldShowEnded({ ...rules, ent: subEnt() })).toBe(true);
    });

    it('never for non-owners, on native, once seen, while loading or for the Superadmin', () => {
        for (const ent of [trialEnt, subEnt()]) {
            const r = { ...rules, ent };
            expect(shouldShowEnded({ ...r, canManage: false })).toBe(false);
            expect(shouldShowEnded({ ...r, native: true })).toBe(false);
            expect(shouldShowEnded({ ...r, seen: true })).toBe(false);
            expect(shouldShowEnded({ ...r, ent: { ...ent, isLoading: true } })).toBe(false);
            expect(shouldShowEnded({ ...r, ent: { ...ent, bypass: true } })).toBe(false);
        }
    });

    it('not on /billing itself, nor while the plan runs or once they paid again', () => {
        expect(shouldShowEnded({ ...rules, pathname: '/billing' })).toBe(false);
        expect(shouldShowEnded({ ...rules, ent: { ...trialEnt, trialExpired: false } })).toBe(false);
        expect(shouldShowEnded({ ...rules, ent: { ...trialEnt, plan: 'team' } })).toBe(false);
        expect(shouldShowEnded({ ...rules, ent: { ...subEnt(), plan: 'business' } })).toBe(false);
    });
});

describe('PlanEndedDialog', () => {
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
        state.ent = { ...trialEnt };
    });
    afterEach(() => vi.unstubAllGlobals());

    it('trial: shows once; "Stay on Free" closes it and it never comes back for this org', () => {
        const first = renderAt('/');
        expect(screen.getByRole('dialog', { name: 'billing.trialEnded.title' })).toBeInTheDocument();
        expect(endedSeen('billing-trial-ended-seen:org1')).toBe(true);
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

    it('subscription ended: its own title, the same keep / lose content and buttons', () => {
        state.ent = subEnt('sub_1');
        renderAt('/');
        expect(screen.getByRole('dialog', { name: 'billing.planEnded.title' })).toBeInTheDocument();
        expect(screen.getByText('billing.trialEnded.keeps')).toBeInTheDocument();
        expect(screen.getByText('billing.trialEnded.loses')).toBeInTheDocument();
        expect(screen.getByText('billing.trialEnded.stay')).toBeInTheDocument();
        expect(screen.getByText('billing.choosePlan')).toBeInTheDocument();
    });

    it('subscription ended: once per ended subscription — a later one that ends asks again', () => {
        state.ent = subEnt('sub_1');
        const first = renderAt('/');
        fireEvent.click(screen.getByText('billing.trialEnded.stay'));
        first.unmount();

        const again = renderAt('/');
        expect(screen.queryByRole('dialog')).toBeNull();
        again.unmount();

        // A dismissed trial doesn't hide it either.
        localStorage.setItem('billing-trial-ended-seen:org1', '1');
        state.ent = subEnt('sub_2');
        const next = renderAt('/');
        expect(screen.getByRole('dialog', { name: 'billing.planEnded.title' })).toBeInTheDocument();
        expect(endedSeen('billing-plan-ended-seen:org1:sub_2')).toBe(true);
        fireEvent.click(screen.getByText('billing.trialEnded.stay'));
        next.unmount();

        renderAt('/');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('a new subscription ending while the app stays open asks again', () => {
        state.ent = subEnt('sub_1');
        const view = renderAt('/');
        fireEvent.click(screen.getByText('billing.trialEnded.stay'));
        expect(screen.queryByRole('dialog')).toBeNull();
        state.ent = subEnt('sub_2');
        view.rerender(
            <MemoryRouter initialEntries={['/']}>
                <PlanEndedDialog />
            </MemoryRouter>,
        );
        expect(screen.getByRole('dialog', { name: 'billing.planEnded.title' })).toBeInTheDocument();
    });

    it('not on /billing (that counts as seen), not for non-owners, not on native', () => {
        for (const ent of [trialEnt, subEnt()]) {
            localStorage.clear();
            state.ent = ent;
            state.user = owner;
            state.native = false;
            const onBilling = renderAt('/billing');
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(endedSeen(endedPrompt(ent, 'org1')!.seenKey)).toBe(true);
            onBilling.unmount();
            localStorage.clear();

            state.user = { ...owner, role: { name: 'Manager', is_admin: true, rank: 30 } };
            const manager = renderAt('/');
            expect(screen.queryByRole('dialog')).toBeNull();
            manager.unmount();

            state.user = owner;
            state.native = true;
            const nativeView = renderAt('/');
            expect(screen.queryByRole('dialog')).toBeNull();
            nativeView.unmount();
        }
    });
});
