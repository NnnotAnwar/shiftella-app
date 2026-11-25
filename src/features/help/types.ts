import type { Capability } from '@shared/auth/permissions';
import type { Language, TranslationKey } from '@shared/i18n/translations';

/**
 * --- HELP CENTRE: CONTENT MODEL ---
 * Articles are typed data in the repo (no CMS). Every article carries all four
 * UI languages — `Record<Language, …>` makes a missing translation a compile
 * error, so help content never falls back the way partial UI strings do.
 *
 * UI labels are never retyped in the prose: write `{{schedule.copyLast}}` and
 * the article shows the real button text from the translation files in the
 * reader's language (see `resolveLabels`). A test checks every token is a real
 * key, so a renamed label can't leave a stale article behind.
 */

export type HelpTopic =
    | 'start'
    | 'rota'
    | 'attendance'
    | 'timeOff'
    | 'swaps'
    | 'announcements'
    | 'timesheets'
    | 'team'
    | 'notifications'
    | 'integrations'
    | 'account'
    | 'billing';

/**
 * Who an article is for. Omitted = everyone. A capability = people who hold it
 * (see permissions.ts); 'owner' = the organization's Head Admin (billing).
 * Readers without it still see the article, flagged "For managers" and sorted
 * after their own.
 */
export type HelpAudience = Capability | 'owner';

export interface HelpText {
    title: string;
    /** One line under the title in the list. */
    summary: string;
    /** A few short steps; `{{key}}` renders that UI label. */
    steps: string[];
    tip?: string;
    /** Extra search words (synonyms people type), space-separated. */
    keywords?: string;
}

export type HelpArticleId =
    | 'first-steps'
    | 'owner-setup'
    | 'rota-plan'
    | 'rota-templates'
    | 'rota-publish'
    | 'rota-warnings'
    | 'my-schedule'
    | 'availability'
    | 'clock-in'
    | 'my-hours'
    | 'request-time-off'
    | 'absence-types'
    | 'decide-time-off'
    | 'leave-balances'
    | 'swap-shift'
    | 'open-shifts'
    | 'read-announcements'
    | 'post-announcement'
    | 'timesheets'
    | 'payroll-export'
    | 'analytics-activity'
    | 'invite-people'
    | 'locations'
    | 'roles-permissions'
    | 'documents'
    | 'other-requests'
    | 'notifications'
    | 'telegram'
    | 'calendar-feed'
    | 'profile-account'
    | 'gdpr'
    | 'billing-beta';

export interface HelpArticle {
    id: HelpArticleId;
    topic: HelpTopic;
    audience?: HelpAudience;
    /** The screen the article is about — offered as "Go to …". */
    route?: string;
    /** Label of that screen (a nav key), for the "Go to …" link. */
    routeLabel?: TranslationKey;
    content: Record<Language, HelpText>;
}
