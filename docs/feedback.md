# In-app feedback

Users send an idea, bug, question or praise from **Settings → About → Send feedback**, the sidebar footer, the mobile "More" sheet (next to the version) or the ⌘K palette. The app attaches the page path (no query string), the app version, the UI language and the browser user agent. The database adds the sender and their organization. Sending shows a "Thanks, sent" toast and nothing else.

To open the dialog from any other screen (e.g. the help centre):

```tsx
import { SendFeedbackLink } from '@features/feedback/SendFeedbackLink';
<SendFeedbackLink />                       // "Send feedback"
<SendFeedbackLink kind="bug">Report a problem</SendFeedbackLink>

// or imperatively:
import { openFeedback } from '@features/feedback/feedbackSignal';
openFeedback({ kind: 'question' });         // false when no app shell is mounted
```

## Storage and access

The table is `public.app_feedback`, created by migration `20261125190000_app_feedback.sql`.

- A user inserts and reads **their own** rows. `user_id`, `organization_id`, `status` and `created_at` are set by a trigger, never by the client. A user can send at most 20 messages per hour.
- The **platform Superadmin** (`is_superadmin()`) reads every row and changes only `status` (new / seen / done). The inbox is at **/feedback**, under System in the nav, with a badge for new rows. Opening a row marks it seen, and tapping its status pill moves it on.
- Rows are deleted with the user's account (GDPR). They are also part of the personal-data export.
- Smoke test: `supabase/tests/feedback_smoke.sql` (preprod; it runs in one transaction and rolls back).

## Owner alert

No new secret, webhook or function. A new message writes a `feedback_new` row to `shift_audit_log` for every Superadmin that has an organization. The existing `notify_shift_updates` webhook then calls `send-push`, which delivers:

- a push to the Superadmin's devices,
- a Telegram message from **@shiftella_bot** (prod) or **@shiftelladev_bot** (preprod), if the Superadmin account has linked Telegram in Settings and has not muted it,
- an entry in the in-app bell.

The Activity Log does not show `feedback_new` rows (see `NOTIFICATION_ONLY_ACTIONS`).

**Rate limit:** one alert per sender per hour. Later messages within the hour are stored but don't alert again (`app_feedback.notified_at`).

**For the owner, once:** in the app, signed in as the Superadmin, go to Settings → Telegram → link. If you skip this, you still get push notifications and the bell.

The push and Telegram copy is in `supabase/functions/_shared/notify.ts` (`feedbackCopy`). After changing it, deploy `send-push`:

```bash
supabase functions deploy send-push --project-ref <ref> --no-verify-jwt --use-api
```
