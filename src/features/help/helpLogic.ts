import { can, isSuperAdmin, rankOf, RANK } from '@shared/auth/permissions';
import type { Language, TranslationKey } from '@shared/i18n/translations';
import type { Profile, User } from '@shared/types';
import { HELP_TOPICS } from './topics';
import type { HelpArticle, HelpAudience, HelpText, HelpTopic } from './types';

/**
 * --- HELP CENTRE: PURE LOGIC ---
 * Label tokens, diacritics-insensitive search and the role-aware order. No
 * React here, so all of it is unit-tested directly.
 */

type T = (key: TranslationKey) => string;

/** `{{schedule.copyLast}}` — a UI label inside article prose. */
export const LABEL_TOKEN = /\{\{([\w.\- ]+?)\}\}/g;

/**
 * A UI string as a label: placeholders dropped ("Publish ({count})" → "Publish",
 * "Join {org}" → "Join"), the trailing ellipsis of placeholders kept off.
 */
export function asLabel(s: string): string {
    return s
        .replace(/\s*\(\{\w+\}\)/g, '')
        .replace(/\s*\{\w+\}/g, '')
        .replace(/[…:]+$/u, '')
        .trim();
}

/** Every `{{key}}` in a text, in order. */
export function labelKeys(text: string): string[] {
    return [...text.matchAll(LABEL_TOKEN)].map((m) => m[1]);
}

/** Split a text into plain parts and label parts (for rendering labels in bold). */
export function splitLabels(text: string, t: T): { text: string; label: boolean }[] {
    const parts: { text: string; label: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(LABEL_TOKEN)) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index), label: false });
        parts.push({ text: asLabel(t(m[1] as TranslationKey)), label: true });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), label: false });
    return parts;
}

/** A text with its labels resolved to plain strings. */
export function resolveLabels(text: string, t: T): string {
    return splitLabels(text, t)
        .map((p) => p.text)
        .join('');
}

/**
 * Lower-case, no diacritics, no punctuation: "Náhradní volno" → "nahradni volno",
 * so a Czech reader typing without háčky still finds it. NFD splits "á" into
 * "a" + a combining mark, which the \p{M} class then drops.
 */
export function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/** Whether `user` is who an article is for. */
export function isFor(user: Pick<User, 'role' | 'permissions' | 'org_role'> | null | undefined, audience: HelpAudience | undefined): boolean {
    if (!audience) return true;
    if (!user) return false;
    if (audience === 'owner') return isSuperAdmin(user) || rankOf(user as Pick<Profile, 'role' | 'org_role'>) >= RANK.OWNER;
    return can(user, audience);
}

export interface ArrangedArticle {
    article: HelpArticle;
    /** The reader holds the article's audience (false = flagged "For managers"). */
    forYou: boolean;
}

export interface ArrangedTopic {
    topic: HelpTopic;
    labelKey: TranslationKey;
    articles: ArrangedArticle[];
}

/**
 * Topics in their fixed order with the reader's own articles first inside each;
 * topics that hold nothing for the reader (an employee's "Billing") go last.
 * Nothing is hidden — a curious employee can still read how approvals work.
 */
export function arrange(articles: readonly HelpArticle[], forYou: (a: HelpArticle) => boolean): ArrangedTopic[] {
    const topics = HELP_TOPICS.map(({ id, labelKey }) => {
        const items = articles.filter((a) => a.topic === id).map((article) => ({ article, forYou: forYou(article) }));
        // Array.prototype.sort is stable: the authored order stays within each group.
        items.sort((a, b) => Number(b.forYou) - Number(a.forYou));
        return { topic: id, labelKey, articles: items };
    }).filter((g) => g.articles.length > 0);
    const mine = topics.filter((g) => g.articles.some((a) => a.forYou));
    const others = topics.filter((g) => !g.articles.some((a) => a.forYou));
    return [...mine, ...others];
}

interface Indexed {
    article: HelpArticle;
    title: string;
    keywords: string;
    body: string;
}

/** The searchable text of one article in one language, labels resolved and folded. */
export function indexArticle(article: HelpArticle, language: Language, t: T): Indexed {
    const c: HelpText = article.content[language];
    const r = (s: string) => fold(resolveLabels(s, t));
    return {
        article,
        title: r(c.title),
        keywords: fold(c.keywords ?? ''),
        body: [c.summary, ...c.steps, c.tip ?? ''].map(r).join(' '),
    };
}

/**
 * Client-side search. Every query word must appear (as a word prefix) in the
 * title, keywords or body; title hits weigh most. The reader's own articles
 * win ties over "For managers" ones. Empty query → [].
 */
export function searchArticles(
    articles: readonly HelpArticle[],
    query: string,
    language: Language,
    t: T,
    forYou: (a: HelpArticle) => boolean,
): ArrangedArticle[] {
    const words = fold(query).split(' ').filter(Boolean);
    if (words.length === 0) return [];
    const hasPrefix = (hay: string, w: string) => (' ' + hay).includes(' ' + w);
    const scored: { item: ArrangedArticle; score: number; order: number }[] = [];
    articles.forEach((article, order) => {
        const ix = indexArticle(article, language, t);
        let score = 0;
        for (const w of words) {
            const s = (hasPrefix(ix.title, w) ? 6 : 0) + (hasPrefix(ix.keywords, w) ? 3 : 0) + (hasPrefix(ix.body, w) ? 1 : 0);
            if (s === 0) return; // every word must match somewhere
            score += s;
        }
        const mine = forYou(article);
        scored.push({ item: { article, forYou: mine }, score: score + (mine ? 0.5 : 0), order });
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.map((s) => s.item);
}
