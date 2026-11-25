import type { HelpArticle, HelpArticleId } from '../types';
import { startArticles } from './start';
import { rotaArticles } from './rota';
import { attendanceArticles } from './attendance';
import { timeOffArticles } from './timeOff';
import { swapArticles } from './swaps';
import { announcementArticles } from './announcements';
import { timesheetArticles } from './timesheets';
import { teamArticles } from './team';
import { notificationArticles } from './notifications';
import { integrationArticles } from './integrations';
import { accountArticles } from './account';
import { billingArticles } from './billing';

/** Every help article, in authored order (topics group them for display). */
export const HELP_ARTICLES: readonly HelpArticle[] = [
    ...startArticles,
    ...rotaArticles,
    ...attendanceArticles,
    ...timeOffArticles,
    ...swapArticles,
    ...announcementArticles,
    ...timesheetArticles,
    ...teamArticles,
    ...notificationArticles,
    ...integrationArticles,
    ...accountArticles,
    ...billingArticles,
];

const BY_ID = new Map(HELP_ARTICLES.map((a) => [a.id, a]));

export function helpArticle(id: HelpArticleId): HelpArticle | undefined {
    return BY_ID.get(id);
}

export function isHelpArticleId(v: string | null | undefined): v is HelpArticleId {
    return !!v && BY_ID.has(v as HelpArticleId);
}
