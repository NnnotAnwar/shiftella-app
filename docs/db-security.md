# Database function grants

Every function in `public` is reachable as `/rest/v1/rpc/<name>` by any role that
holds `EXECUTE` on it. Supabase's default privileges grant `EXECUTE` to `anon`,
`authenticated` and `PUBLIC` on every new function, so **each migration that
creates a function must set its grants explicitly**.

| Kind of function | Who gets `EXECUTE` | Example |
| --- | --- | --- |
| Trigger function | nobody but `service_role` (`REVOKE ALL … FROM PUBLIC, anon, authenticated`). Postgres checks `EXECUTE` only at `CREATE TRIGGER`, never when the trigger fires. | `audit_clock()` |
| Client RPC (called with `supabase.rpc()` from `src/`) | `authenticated, service_role`. Never `anon` unless the landing page needs it. | `publish_schedule()` |
| Public on purpose | `anon, authenticated, service_role` | `billing_free_beta()` |
| Helper used inside an RLS policy, or by a `SECURITY INVOKER` function / trigger | `authenticated, service_role`. A policy runs as the querying role, so revoking it breaks every query on that table. | `get_my_org_id()`, `has_permission()` |
| Internal helper (only called from `SECURITY DEFINER` functions, cron, or Edge Functions through the service-role client) | `service_role` only | `role_rank()`, `profile_has_permission()`, `org_plan()` |

Every `SECURITY DEFINER` function also needs `SET search_path = public`.

Template:

```sql
REVOKE ALL ON FUNCTION public.my_fn(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_fn(uuid) TO authenticated, service_role;
```

Check before merging: run the Supabase security advisor on preprod. The
"Signed-In Users Can Execute SECURITY DEFINER Function" warnings that remain are
the client RPCs and RLS helpers above. They are expected. Every
"Public Can Execute" warning except `billing_free_beta` is a bug.

## Indexes

Keep an index on every foreign-key column, even if the "Unused Index" advisor flags
it. Without one, deleting a profile, organization or location seq-scans the child
table. Drop an index only if it backs no FK or constraint and no query uses it.
See `20261125150000_db_security_lockdown.sql`.
