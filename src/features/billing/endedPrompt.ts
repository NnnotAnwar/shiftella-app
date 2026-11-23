/**
 * --- PLAN ENDED (rules) ---
 * When the one-time "your trial / subscription has ended" dialog shows, and
 * its "seen" flag on this device (localStorage, guarded: storage may be
 * blocked). Two cases, same dialog:
 *   • 'trial'        — our no-card trial ran out (`trialExpired`); remembered
 *                      per organization.
 *   • 'subscription' — a paid Stripe subscription ended (`planEnded`);
 *                      remembered per organization AND per ended subscription,
 *                      so a later subscription that ends asks again.
 */
import type { Entitlements } from './entitlements';

export type EndedKind = 'trial' | 'subscription';

type EndedEnt = Pick<Entitlements, 'trialExpired' | 'planEnded' | 'endedSubscriptionId' | 'plan' | 'bypass'> & { isLoading?: boolean };

/** Which "ended" case applies and the device key that remembers it was seen (null = nothing ended). */
export function endedPrompt(
    ent: Pick<Entitlements, 'trialExpired' | 'planEnded' | 'endedSubscriptionId'>,
    orgId: string,
): { kind: EndedKind; seenKey: string } | null {
    if (!orgId) return null;
    if (ent.trialExpired) return { kind: 'trial', seenKey: `billing-trial-ended-seen:${orgId}` };
    if (ent.planEnded && ent.endedSubscriptionId) {
        return { kind: 'subscription', seenKey: `billing-plan-ended-seen:${orgId}:${ent.endedSubscriptionId}` };
    }
    return null;
}

/** Whether this dialog (by its seen key) was already shown on this device. */
export function endedSeen(seenKey: string): boolean {
    try {
        return localStorage.getItem(seenKey) === '1';
    } catch {
        return false;
    }
}

export function markEndedSeen(seenKey: string) {
    try {
        localStorage.setItem(seenKey, '1');
    } catch {
        /* storage blocked: it stays closed for this session only */
    }
}

/**
 * Show the one-time "ended" dialog? Only to the person who can buy (the org
 * owner), on the web (store rules: native apps get no call to buy elsewhere —
 * the banner says "manage on the web" there), once the no-card trial ran out or
 * a paid subscription ended and the org sits on Free — never on /billing
 * itself, and never again once closed.
 */
export function shouldShowEnded({
    ent,
    canManage,
    native,
    pathname,
    seen,
}: {
    ent: EndedEnt;
    canManage: boolean;
    native: boolean;
    pathname: string;
    seen: boolean;
}): boolean {
    if (!canManage || native || seen || ent.isLoading || ent.bypass) return false;
    if (pathname === '/billing') return false;
    return (ent.trialExpired || (ent.planEnded && !!ent.endedSubscriptionId)) && ent.plan === 'free';
}
