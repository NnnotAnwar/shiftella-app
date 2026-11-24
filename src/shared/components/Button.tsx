import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CircleNotchIcon, type Icon, type IconWeight } from '@phosphor-icons/react';

/**
 * --- BUTTON ---
 * The single source of truth for buttons across the app. Before this, every
 * call site hand-wrote long className strings, so padding, radius and text size
 * drifted (px-6/px-8, py-3/py-3.5, rounded-xl/2xl…). Centralising them here
 * guarantees a consistent visual hierarchy — one obvious `primary` action per
 * view — and bakes in a few UX defaults:
 *
 *  • Touch-friendly on phones — `md`/`lg` are ≥44px tall there (Apple HIG /
 *    Material minimum); from `md:` up, where a pointer is precise, they tighten
 *    to the compact desktop density.
 *  • Built-in loading — pass `loading` to show a spinner and block re-taps,
 *    so every async action has consistent in-flight feedback.
 *  • Accent-aware — `primary` uses the themable emerald token, so it follows
 *    whichever colour motif the user picked.
 */

import { BASE, SIZES, ICON_SIZES, VARIANTS, type Variant, type Size } from './buttonStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Shows a spinner and disables the button while an async action runs. */
    loading?: boolean;
    /** Phosphor icon rendered before the label (hidden while loading). */
    icon?: Icon;
    /** Weight for the leading icon — e.g. 'fill' for media-style Play/Stop. */
    iconWeight?: IconWeight;
    fullWidth?: boolean;
    children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'primary', size = 'md', loading = false, icon: LeadingIcon, iconWeight = 'bold', fullWidth, disabled, className = '', children, ...rest },
    ref,
) {
    const iconClass = ICON_SIZES[size];
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
            {...rest}
        >
            {loading ? (
                <CircleNotchIcon weight="bold" className={`${iconClass} animate-spin`} />
            ) : (
                LeadingIcon && <LeadingIcon weight={iconWeight} className={iconClass} />
            )}
            {children}
        </button>
    );
});
