// Pure helpers for the invite-employee Edge Function (tested by invite_test.ts).
// Every refusal carries a machine-readable `code` the client translates
// (src/features/admin/inviteErrors.ts); `error` is the English fallback.

export type InviteErrorCode =
    | 'NOT_ALLOWED'
    | 'EMAIL_INVALID'
    | 'ORG_REQUIRED'
    | 'UNKNOWN_ROLE'
    | 'UNKNOWN_ORG'
    | 'ROLE_TOO_HIGH'
    | 'PLAN_LIMIT_MEMBERS'
    | 'INVITE_FAILED';

export interface InviteRefusal {
    error: string;
    code: InviteErrorCode;
    limit?: number;
}

/**
 * The plan's member limit (Free 5, Team 15; null = unlimited). A Superadmin
 * may invite past it — their invite is recorded with `bypass_limits`, which the
 * database's member-limit trigger honours.
 */
export function memberLimitRefusal(isSuperadmin: boolean, limit: number | null | undefined, count: number | null | undefined): InviteRefusal | null {
    if (isSuperadmin || limit == null) return null;
    if (Number(count ?? 0) < Number(limit)) return null;
    return { error: `Your plan allows up to ${limit} members. Upgrade in Billing to add more.`, code: 'PLAN_LIMIT_MEMBERS', limit: Number(limit) };
}

/**
 * The pending_invites record the provisioning trigger trusts. `bypass_limits`
 * only for a Superadmin's invite (clients can't write this table at all).
 */
export function pendingInviteRow(p: {
    email: string;
    organizationId: string;
    role: string;
    orgRoleId: string | null;
    createdBy: string;
    isSuperadmin: boolean;
}) {
    return {
        email: p.email,
        organization_id: p.organizationId,
        role: p.role,
        org_role_id: p.orgRoleId || null,
        created_by: p.createdBy,
        bypass_limits: p.isSuperadmin,
    };
}
