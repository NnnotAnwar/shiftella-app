/**
 * --- BUTTON STYLES ---
 * The class recipe behind <Button>, in its own module so a router <Link> can
 * look exactly like a button (the landing page's CTAs) without nesting a
 * <button> inside an <a>.
 */

export type Variant = 'primary' | 'danger' | 'secondary' | 'tonal' | 'ghost';
export type Size = 'sm' | 'md' | 'lg' | 'xl';

export const BASE =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all ' +
    'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none';

export const SIZES: Record<Size, string> = {
    sm: 'text-meta px-3 min-h-9 md:min-h-8 gap-1.5',
    md: 'text-sm px-4 min-h-11 md:min-h-9', // 44px on phones — the touch-target floor
    lg: 'text-sm px-5 min-h-12 md:min-h-10',
    xl: 'text-base px-6 min-h-14 md:min-h-11 gap-2.5 tracking-tight', // hero CTAs (Start/End shift)
};

// Icons scale with the button so a big CTA doesn't get a tiny glyph.
export const ICON_SIZES: Record<Size, string> = {
    sm: 'size-3.5',
    md: 'size-4',
    lg: 'size-4',
    xl: 'size-5',
};

// The lit top edge every filled button shares — reads as a pressable surface.
const LIT = 'shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_6px_16px_-8px_var(--btn-glow)]';

export const VARIANTS: Record<Variant, string> = {
    // One dominant, accent-filled CTA — the happy path. accent-700 so white text
    // clears WCAG AA (>=4.5:1) on every motif, including the emerald brand.
    primary: `bg-linear-to-b from-emerald-600 to-emerald-700 text-white ${LIT} [--btn-glow:var(--color-emerald-600)] hover:brightness-110`,
    // Destructive, filled — reserved for irreversible actions. red-600 (not 500)
    // so white text clears WCAG AA (~4.8:1).
    danger: `bg-linear-to-b from-rose-600 to-rose-700 text-white ${LIT} [--btn-glow:var(--color-rose-600)] hover:brightness-110`,
    // Quiet, outlined — secondary choices that shouldn't compete with primary.
    secondary:
        'bg-white/60 ring-1 ring-ink/10 text-ink hover:bg-white ' +
        'dark:bg-white/5 dark:ring-white/10 dark:text-slate-200 dark:hover:bg-white/10',
    // Soft accent tint — an inviting-but-not-loud action (e.g. Edit, Request).
    tonal:
        'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/15 hover:bg-emerald-500/15 ' +
        'dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/15 dark:hover:bg-emerald-400/15',
    // Lowest emphasis — tertiary / dismissive actions.
    ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white',
};

/** Button classes for a non-<button> element (e.g. a router <Link> CTA). */
export function buttonClass({ variant = 'primary', size = 'md', fullWidth = false }: { variant?: Variant; size?: Size; fullWidth?: boolean } = {}): string {
    return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}${fullWidth ? ' w-full' : ''}`;
}
