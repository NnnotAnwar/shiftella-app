import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuthContext } from '@features/auth/AuthContext';
import { isSuperAdmin, rankOf, RANK } from '@shared/auth/permissions';
import { useTranslation } from '@shared/preferences/PreferencesContext';
import { toast } from '@shared/toast/toastStore';
import { APP_NAME } from '@shared/brand';
import type { Profile, User } from '@shared/types';
import type { TranslationKey } from '@shared/i18n/translations';
import { billingService } from './billingService';
import { buildEntitlements, type Entitlements, type LimitKind } from './entitlements';
import { requiredPlan, type Feature } from './plans';

export const billingKeys = {
    all: ['billing'] as const,
    subscription: (orgId: string) => ['billing', 'subscription', orgId] as const,
    usage: (orgId: string) => ['billing', 'usage', orgId] as const,
    allOrgs: ['billing', 'all-orgs'] as const,
};

/**
 * Who manages the organization's subscription: its Head Admin (and the
 * Superadmin). Mirrors the Edge Functions' has_permission('billing', 'write').
 */
export function canManageBilling(user: Pick<User, 'role' | 'org_role'> | null | undefined): boolean {
    if (!user) return false;
    return isSuperAdmin(user) || rankOf(user as Pick<Profile, 'role' | 'org_role'>) >= RANK.OWNER;
}

/** Native apps (App Store / Play rules): no prices, no purchase buttons, no links out. */
export const isNativeApp = () => Capacitor.isNativePlatform();

/** The caller's organization subscription row. */
export function useSubscription(opts: { poll?: boolean } = {}) {
    const { user } = useAuthContext();
    const orgId = user?.organization_id ?? '';
    return useQuery({
        queryKey: billingKeys.subscription(orgId),
        queryFn: () => billingService.getSubscription(orgId),
        enabled: !!orgId,
        staleTime: 60_000,
        // `poll`: just back from Checkout — refetch until the webhook has written the Stripe row.
        refetchInterval: (q) => {
            const d = q.state.data;
            return opts.poll && !(d?.source === 'stripe' && d.status !== 'incomplete') ? 2500 : false;
        },
    });
}

/** Superadmin: every organization's billing row, keyed by organization. */
export function useAllOrgPlans() {
    const { user } = useAuthContext();
    const enabled = !!user && isSuperAdmin(user);
    const q = useQuery({ queryKey: billingKeys.allOrgs, queryFn: () => billingService.listAll(), enabled, staleTime: 60_000 });
    const rows = useMemo(() => new Map((q.data ?? []).map((r) => [r.organization_id, r])), [q.data]);
    return { rows, isLoading: enabled && q.isLoading };
}

/** Members + active locations of the caller's organization. */
export function useOrgUsage() {
    const { user } = useAuthContext();
    const orgId = user?.organization_id ?? '';
    return useQuery({
        queryKey: billingKeys.usage(orgId),
        queryFn: () => billingService.getUsage(orgId),
        enabled: !!orgId,
        staleTime: 30_000,
    });
}

/**
 * What the caller's organization may use: `{ plan, isTrial, trialDaysLeft,
 * can(feature), canAdd('members' | 'locations'), limits, … }`. While loading,
 * `isLoading` is true and feature checks pass (pages show their own loader via
 * <UpgradeGate>; the server enforces the hard limits anyway).
 */
export function useEntitlements(): Entitlements & { isLoading: boolean } {
    const { user } = useAuthContext();
    const subQ = useSubscription();
    const usageQ = useOrgUsage();
    const superadmin = !!user && isSuperAdmin(user);
    const isLoading = !!user && subQ.isLoading;
    return useMemo(() => {
        const e = buildEntitlements({ subscription: subQ.data, usage: usageQ.data ?? null, superadmin });
        if (!isLoading) return { ...e, isLoading };
        return { ...e, isLoading, can: () => true, canAdd: () => true, overLimit: () => false };
    }, [subQ.data, usageQ.data, superadmin, isLoading]);
}

/**
 * A one-tap nudge for a gated action: an info toast saying which plan unlocks
 * it, with "See plans" for the people who can upgrade (web only — native apps
 * may not point to outside purchases). No popups.
 */
export function useUpgradeNudge() {
    const { user } = useAuthContext();
    const navigate = useNavigate();
    const t = useTranslation();
    return useCallback(
        (what: Feature | LimitKind) => {
            const message =
                what === 'members' || what === 'locations'
                    ? t(`billing.limitReached.${what}` as TranslationKey)
                    : t('billing.partOf', { plan: t(`billing.plan.${requiredPlan(what)}` as TranslationKey) });
            const owner = canManageBilling(user);
            const native = isNativeApp();
            const action = owner && !native ? { label: t('billing.seePlans'), onClick: () => navigate('/billing') } : undefined;
            const hint = !owner ? ` ${t('billing.askOwner')}` : native ? ` ${t('billing.manageOnWeb', { app: APP_NAME })}` : '';
            toast(`${message}${hint}`, 'info', { action });
        },
        [user, navigate, t],
    );
}
