// Deno tests for the invite-employee helpers. Run from a copy outside the repo
// (the root package.json confuses Deno's npm resolution):
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn && deno test _shared/invite_test.ts
import { deepStrictEqual, strictEqual } from 'node:assert';
import { memberLimitRefusal, pendingInviteRow } from './invite.ts';

Deno.test('memberLimitRefusal: under / at the limit, unlimited, Superadmin', () => {
    strictEqual(memberLimitRefusal(false, 5, 4), null);
    deepStrictEqual(memberLimitRefusal(false, 5, 5), {
        error: 'Your plan allows up to 5 members. Upgrade in Billing to add more.',
        code: 'PLAN_LIMIT_MEMBERS',
        limit: 5,
    });
    strictEqual(memberLimitRefusal(false, 15, 23)?.code, 'PLAN_LIMIT_MEMBERS');
    strictEqual(memberLimitRefusal(false, null, 400), null);
    strictEqual(memberLimitRefusal(false, 5, null), null);
    strictEqual(memberLimitRefusal(true, 5, 5), null);
    strictEqual(memberLimitRefusal(true, 5, 50), null);
});

Deno.test('pendingInviteRow: bypass_limits only for a Superadmin', () => {
    const base = { email: 'a@b.cz', organizationId: 'org', role: 'Employee', orgRoleId: '', createdBy: 'me' };
    deepStrictEqual(pendingInviteRow({ ...base, isSuperadmin: false }), {
        email: 'a@b.cz',
        organization_id: 'org',
        role: 'Employee',
        org_role_id: null,
        created_by: 'me',
        bypass_limits: false,
    });
    strictEqual(pendingInviteRow({ ...base, orgRoleId: 'r1', isSuperadmin: true }).bypass_limits, true);
    strictEqual(pendingInviteRow({ ...base, orgRoleId: 'r1', isSuperadmin: true }).org_role_id, 'r1');
});
