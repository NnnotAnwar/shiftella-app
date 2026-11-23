/**
 * --- TRIAL ENDED (rules) ---
 * When the one-time trial-ended dialog shows, and its per-organization "seen"
 * flag on this device (localStorage, guarded: storage may be blocked).
 */
import type { Entitlements } from './entitlements';

const keyFor = (orgId: string) => `billing-trial-ended-seen:${orgId}`;

/** Whether this organization's owner has already seen the dialog on this device. */
export function trialEndedSeen(orgId: string): boolean {
    try {
        return localStorage.getItem(keyFor(orgId)) === '1';
    } catch {
        return false;
    }
}

export function markTrialEndedSeen(orgId: string) {
    try {
        localStorage.setItem(keyFor(orgId), '1');
    } catch {
        /* storage blocked: it stays closed for this session only */
    }
}

/**
 * Show the one-time "your trial has ended" dialog? Only to the person who can
 * buy (the org owner), on the web (store rules: native apps get no call to buy
 * elsewhere — the trial banner says "manage on the web" there), once the
 * no-card trial has run out and the org sits on Free — never on /billing
 * itself, and never again once closed.
 */
export function shouldShowTrialEnded({
    ent,
    canManage,
    native,
    pathname,
    seen,
}: {
    ent: Pick<Entitlements, 'trialExpired' | 'plan' | 'bypass'> & { isLoading?: boolean };
    canManage: boolean;
    native: boolean;
    pathname: string;
    seen: boolean;
}): boolean {
    if (!canManage || native || seen || ent.isLoading || ent.bypass) return false;
    if (pathname === '/billing') return false;
    return ent.trialExpired && ent.plan === 'free';
}
