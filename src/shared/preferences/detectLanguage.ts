import type { Language } from '@shared/i18n/translations';

/**
 * First-visit UI language from the browser: Czech and Slovak speakers get
 * Czech, everyone else English. Only used when no language was saved yet.
 */
export function detectLanguage(languages: readonly string[] | undefined | null): Language {
    for (const tag of languages ?? []) {
        const base = tag.toLowerCase().split(/[-_]/)[0];
        if (base === 'cs' || base === 'sk') return 'cs';
        if (base) return 'en';
    }
    return 'en';
}

/** The browser's preferred languages (empty outside a browser). */
export function browserLanguages(): string[] {
    if (typeof navigator === 'undefined') return [];
    if (navigator.languages?.length) return [...navigator.languages];
    return navigator.language ? [navigator.language] : [];
}
