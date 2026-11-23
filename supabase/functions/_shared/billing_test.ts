// Deno tests for the pure billing-change-plan helpers. Run from a copy outside
// the repo (the root package.json confuses Deno's npm resolution):
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test _shared/billing_test.ts
import { deepStrictEqual, strictEqual } from 'node:assert';
import { cancelFlagTarget, changeRefusal, endsAtOf, parseChangeRequest } from './billing.ts';

const NOW = Date.parse('2026-12-10T10:00:00Z');
const live = {
    manual_plan: null,
    manual_until: null,
    source: 'stripe' as const,
    status: 'active' as const,
    stripe_subscription_id: 'sub_1',
};

Deno.test('parseChangeRequest: switch, free (cancel), resume, junk', () => {
    deepStrictEqual(parseChangeRequest({ plan: 'team', interval: 'year' }), { kind: 'switch', plan: 'team', interval: 'year' });
    deepStrictEqual(parseChangeRequest({ plan: 'free' }), { kind: 'cancel' });
    deepStrictEqual(parseChangeRequest({ plan: 'free', interval: 'month' }), { kind: 'cancel' });
    deepStrictEqual(parseChangeRequest({ action: 'resume' }), { kind: 'resume' });
    strictEqual(parseChangeRequest({ action: 'delete' }), null);
    strictEqual(parseChangeRequest({ plan: 'team' }), null);
    strictEqual(parseChangeRequest({ plan: 'gold', interval: 'month' }), null);
    strictEqual(parseChangeRequest(null), null);
});

Deno.test('changeRefusal: gifts, grandfathered, no live subscription', () => {
    strictEqual(changeRefusal(live, NOW), null);
    strictEqual(changeRefusal({ ...live, status: 'trialing' }, NOW), null);
    strictEqual(changeRefusal({ ...live, status: 'past_due' }, NOW), null);
    strictEqual(changeRefusal({ ...live, manual_plan: 'team' }, NOW)?.code, 'GRANTED');
    strictEqual(changeRefusal({ ...live, manual_plan: 'team', manual_until: '2026-12-01T00:00:00Z' }, NOW), null); // expired gift
    strictEqual(changeRefusal({ ...live, source: 'grandfathered' }, NOW)?.code, 'GRANDFATHERED');
    strictEqual(changeRefusal({ ...live, status: 'canceled' }, NOW)?.code, 'NO_SUBSCRIPTION');
    strictEqual(changeRefusal({ ...live, stripe_subscription_id: null }, NOW)?.code, 'NO_SUBSCRIPTION');
    strictEqual(changeRefusal(null, NOW)?.code, 'NO_SUBSCRIPTION');
});

Deno.test('cancelFlagTarget: only the cancel flag moves, unchanged when already so', () => {
    strictEqual(cancelFlagTarget('cancel', false), true);
    strictEqual(cancelFlagTarget('cancel', true), null);
    strictEqual(cancelFlagTarget('resume', true), false);
    strictEqual(cancelFlagTarget('resume', false), null);
});

Deno.test('endsAtOf: cancel_at, else the period end', () => {
    strictEqual(endsAtOf({ cancel_at: 1_800_000_000, current_period_end: 1_700_000_000 }), new Date(1_800_000_000_000).toISOString());
    strictEqual(endsAtOf({ cancel_at: null, current_period_end: 1_700_000_000 }), new Date(1_700_000_000_000).toISOString());
    strictEqual(endsAtOf({}), null);
});
