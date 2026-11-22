import { Capacitor } from '@capacitor/core';
import { supabase } from '@shared/api/supabaseClient';
import { type User, type NameChangeRequest, type PermissionMap, type PermissionArea } from '@shared/types';
import { ProfileSchema, NameChangeRequestSchema } from '@shared/types';
import { EMAIL_NOT_CONFIRMED } from './authFlows';

/**
 * Where auth emails (confirm, reset password) link back to. The native app has
 * no web origin of its own, so it uses the public web URL (VITE_PUBLIC_SITE_URL),
 * falling back to the legacy host until the Shiftella domain is live.
 */
function appOrigin(): string {
  if (!Capacitor.isNativePlatform()) return window.location.origin;
  return import.meta.env.VITE_PUBLIC_SITE_URL || 'https://planuj-smeny.vercel.app';
}

/**
 * --- AUTH SERVICE ---
 * This file handles all DIRECT communication with Supabase for user authentication.
 * Separation of Concerns: Components should NOT talk to Supabase directly; 
 * they should use this service instead.
 */

export const authService = {
  /**
   * Retrieves the current active user session from Supabase.
   */
  async getSession() {
    return await supabase.auth.getSession();
  },

  /**
   * Fetches the user's detailed profile (first name, role, etc.) from the DB.
   * Uses Zod (ProfileSchema) to validate that the DB data is correct.
   */
  async getUserProfile(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, username, first_name, last_name, role(name, is_admin, rank), email, organization_id, username_changed_at, ' +
          'org_role_id, org_role:org_roles!profiles_org_role_id_fkey(id, name, color, base_role, preset_key, sort, permissions:org_role_permissions(area, can_read, can_write, can_delete))',
      )
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) return null;

    // Validate the data from DB before using it in the app.
    const validated = ProfileSchema.parse(data);
    // Effective permissions = the member's own role ∪ the organization's
    // default role (Employee, like Discord's @everyone) → { area: { … } }.
    type Row = { area: PermissionArea; can_read: boolean; can_write: boolean; can_delete: boolean };
    const own = ((data as { org_role?: { permissions?: Row[] } | null }).org_role?.permissions) ?? null;
    let permissions: PermissionMap | undefined;
    if (own) {
      const { data: def } = await supabase
        .from('org_roles')
        .select('permissions:org_role_permissions(area, can_read, can_write, can_delete)')
        .eq('organization_id', validated.organization_id)
        .eq('preset_key', 'employee')
        .maybeSingle();
      permissions = {};
      for (const r of [...own, ...(((def as { permissions?: Row[] } | null)?.permissions) ?? [])]) {
        const cur = permissions[r.area] ?? { read: false, write: false, delete: false };
        permissions[r.area] = { read: cur.read || r.can_read, write: cur.write || r.can_write, delete: cur.delete || r.can_delete };
      }
    }
    return {
      id: validated.id,
      username: validated.username,
      first_name: validated.first_name ?? null,
      role: {
        name: validated.role.name,
        is_admin: validated.role.is_admin,
        rank: validated.role.rank
      },
      email: validated.email,
      last_name: validated.last_name ?? null,
      organization_id: validated.organization_id,
      username_changed_at: validated.username_changed_at ?? null,
      org_role_id: validated.org_role_id ?? null,
      org_role: validated.org_role ?? null,
      permissions,
    };
  },

  /**
   * Sign in with a username. The username -> email resolution AND the sign-in
   * happen inside the `username-login` Edge Function so the username/email map
   * is never exposed to the client (no enumeration / PII leak). On success the
   * returned tokens are adopted as the local session.
   */
  async signInWithUsername(username: string, password: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('username-login', {
      body: { username, password },
    });
    // Any non-2xx (FunctionsHttpError) or missing tokens => generic failure —
    // except "email not confirmed", which the function only reports after the
    // password checked out (so it reveals nothing to someone without it).
    if (error || !data?.access_token || !data?.refresh_token) {
      const body = await readFunctionErrorBody(error);
      throw Object.assign(new Error('Invalid username or password.'), {
        code: body?.code === EMAIL_NOT_CONFIRMED ? EMAIL_NOT_CONFIRMED : undefined,
      });
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) throw sessionError;
  },

  /**
   * Standard email + password sign in.
   */
  /**
   * Self sign-up of an organization OWNER (store release, #125). The DB
   * provisioning trigger creates a new organization from `organization_name`
   * and makes this user its Head Admin — role/org metadata from the client is
   * ignored there by design. The confirmation email brings them to /login.
   */
  async signUpOwner(input: { firstName: string; lastName: string; email: string; password: string; organizationName: string; language?: 'en' | 'cs' }) {
    const origin = appOrigin();
    return await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName,
          last_name: input.lastName,
          organization_name: input.organizationName,
          // The confirmation email is written in the language they signed up in.
          language: input.language ?? 'en',
        },
        emailRedirectTo: `${origin}/login`,
      },
    });
  },

  async signIn(email: string, password: string) {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  },

  /** Sends the sign-up confirmation email again (unconfirmed owners). */
  async resendSignupConfirmation(email: string) {
    return await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${appOrigin()}/login` },
    });
  },

  /**
   * Emails a password-reset link. The "Reset password" template links to
   * `{{ .RedirectTo }}?token_hash=…&type=recovery`, i.e. our /reset-password.
   */
  async requestPasswordReset(email: string) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin()}/reset-password`,
    });
  },

  /** Redeems the one-time recovery token from the reset email → a session. */
  async verifyRecoveryToken(tokenHash: string) {
    return await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  },

  /** Sets a new password for the signed-in (recovering) user. */
  async updatePassword(password: string) {
    return await supabase.auth.updateUser({ password });
  },

  /**
   * Signs out the user and clears the local session.
   */
  async signOut() {
    return await supabase.auth.signOut();
  },

  /**
   * Updates the caller's own profile (username is the login identifier).
   * RLS ("Users can update own profile") restricts this to the user's own row;
   * the unique_username constraint surfaces as a 23505 error if taken.
   */
  async updateProfile(
    userId: string,
    fields: { username?: string; first_name?: string | null; last_name?: string | null }
  ) {
    return await supabase.from('profiles').update(fields).eq('id', userId);
  },

  /**
   * The caller's most recent name-change request (any status), or null.
   * Staff use this to see whether they already have one pending.
   */
  async getMyLatestNameRequest(userId: string): Promise<NameChangeRequest | null> {
    const { data, error } = await supabase
      .from('name_change_requests')
      .select(
        'id, user_id, organization_id, current_first_name, current_last_name, requested_first_name, requested_last_name, note, review_note, status, reviewed_at, created_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? NameChangeRequestSchema.parse(data) : null;
  },

  /** Submit a request to change your first/last name (SECURITY DEFINER RPC). */
  async requestNameChange(firstName: string, lastName: string, note?: string | null) {
    const { error } = await supabase.rpc('request_name_change', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_note: note ?? null,
    });
    if (error) throw new Error(error.message);
  },

  /** Cancel your own pending name-change request. */
  async cancelNameChange(requestId: string) {
    const { error } = await supabase.rpc('cancel_name_change_request', { p_id: requestId });
    if (error) throw new Error(error.message);
  },
};

/** The JSON body of a failed Edge Function call (FunctionsHttpError keeps the Response in `context`). */
async function readFunctionErrorBody(error: unknown): Promise<{ code?: string } | null> {
  const res = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!res || typeof res.json !== 'function') return null;
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? (body as { code?: string }) : null;
  } catch {
    return null;
  }
}
