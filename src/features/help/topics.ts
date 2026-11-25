import type { TranslationKey } from '@shared/i18n/translations';
import type { HelpTopic } from './types';

/** Render order of the help topics, with their section titles. */
export const HELP_TOPICS: readonly { id: HelpTopic; labelKey: TranslationKey }[] = [
    { id: 'start', labelKey: 'help.topic.start' },
    { id: 'rota', labelKey: 'help.topic.rota' },
    { id: 'attendance', labelKey: 'help.topic.attendance' },
    { id: 'timeOff', labelKey: 'help.topic.timeOff' },
    { id: 'swaps', labelKey: 'help.topic.swaps' },
    { id: 'announcements', labelKey: 'help.topic.announcements' },
    { id: 'timesheets', labelKey: 'help.topic.timesheets' },
    { id: 'team', labelKey: 'help.topic.team' },
    { id: 'notifications', labelKey: 'help.topic.notifications' },
    { id: 'integrations', labelKey: 'help.topic.integrations' },
    { id: 'account', labelKey: 'help.topic.account' },
    { id: 'billing', labelKey: 'help.topic.billing' },
];
