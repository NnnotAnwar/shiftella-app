import type { TranslationKey } from '@shared/i18n/translations';

/**
 * --- EMPLOYEE DOCUMENTS: pure rules ---
 * Types, the upload limits (the Storage bucket enforces the same ones) and the
 * expiry state behind the chips. Kept free of React / Supabase for tests.
 */

/** Mirrors member_documents.doc_type (and DOC_TYPE in supabase/functions/_shared/notify.ts). */
export const DOC_TYPES = ['contract', 'agreement', 'health_card', 'food_card', 'safety_training', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const docTypeKey = (type: string): TranslationKey =>
    `docs.type.${(DOC_TYPES as readonly string[]).includes(type) ? type : 'other'}` as TranslationKey;

/** Types that usually expire — the form offers a date for them up front. */
export const EXPIRING_TYPES: readonly DocType[] = ['health_card', 'food_card', 'safety_training', 'agreement'];

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const DOC_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

const EXT_MIME: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};

/** The file's extension, lower-case ('' if none). */
export function fileExt(name: string): string {
    const m = /\.([a-z0-9]{1,5})$/i.exec(name);
    return m ? m[1].toLowerCase() : '';
}

/** The MIME type to store (browsers leave HEIC's type empty). */
export function docMime(file: Pick<File, 'name' | 'type'>): string {
    return file.type || EXT_MIME[fileExt(file.name)] || '';
}

/** null = fine; otherwise the translation key of what's wrong. */
export function validateDocFile(file: Pick<File, 'name' | 'type' | 'size'>): TranslationKey | null {
    if (!(DOC_MIME_TYPES as readonly string[]).includes(docMime(file))) return 'docs.errType';
    if (file.size > MAX_DOC_BYTES) return 'docs.errTooBig';
    if (file.size === 0) return 'docs.errType';
    return null;
}

/** "Zdravotni_prukaz 2026.pdf" → "Zdravotni_prukaz 2026" (the default name). */
export function nameFromFile(name: string): string {
    return name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 120);
}

/** Local "YYYY-MM-DD" of a Date. */
export function isoDay(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from `today` to `day` (both "YYYY-MM-DD"); negative = past. */
export function daysUntil(day: string, today: string): number {
    const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
    const b = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
    return Math.round((b - a) / 86_400_000);
}

export type ExpiryState = 'ok' | 'soon' | 'today' | 'expired';

/** The chip's colour: amber within 30 days, red once expired. null = no date. */
export function expiryState(validUntil: string | null | undefined, today: string): ExpiryState | null {
    if (!validUntil) return null;
    const d = daysUntil(validUntil, today);
    if (d < 0) return 'expired';
    if (d === 0) return 'today';
    if (d <= 30) return 'soon';
    return 'ok';
}
