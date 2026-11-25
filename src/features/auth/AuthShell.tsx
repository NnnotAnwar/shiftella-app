import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, SunIcon, MoonIcon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useTheme } from '@app/providers/ThemeContext';
import { usePreferences, useTranslation } from '@shared/preferences/PreferencesContext';
import { LANGUAGES } from '@shared/i18n/translations';
import { BrandGlyph } from '@shared/components/BrandGlyph';
import { APP_NAME } from '@shared/brand';

/** One-tap CS/EN/SK/UK switch for the signed-out pages (saved like the Settings choice). */
export function LanguageToggle() {
    const { language, setLanguage, t } = usePreferences();
    // Czech first — the home market.
    const options = [...LANGUAGES.filter((l) => l.code === 'cs'), ...LANGUAGES.filter((l) => l.code !== 'cs')];
    return (
        <div role="group" aria-label={t('auth.language')} className="segmented ring-1 ring-inset ring-gray-200/60 backdrop-blur-md dark:ring-white/10">
            {options.map((l) => {
                const active = l.code === language;
                return (
                    <button
                        key={l.code}
                        type="button"
                        lang={l.code}
                        onClick={() => setLanguage(l.code)}
                        aria-pressed={active}
                        aria-label={l.label}
                        className={`h-6.5 min-w-8 rounded-[9px] px-2 text-caption font-semibold uppercase transition-colors ${active ? 'segment-active text-ink dark:text-white' : 'text-ink-soft hover:text-ink dark:text-slate-400 dark:hover:text-white'}`}
                    >
                        {l.code}
                    </button>
                );
            })}
        </div>
    );
}

/** Light/dark switch for the signed-out pages (auth screens and the landing page). */
export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const t = useTranslation();
    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={t('common.toggleTheme')}
            className="p-2 rounded-xl bg-white/60 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-300 backdrop-blur-md hover:bg-white/80 dark:hover:bg-white/10 active:scale-90 transition-all"
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={resolvedTheme}
                    initial={{ y: -6, opacity: 0, rotate: -30 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: 6, opacity: 0, rotate: 30 }}
                    transition={{ duration: 0.2 }}
                    className="block"
                >
                    {isDark ? <SunIcon weight="bold" className="size-4" /> : <MoonIcon weight="bold" className="size-4" />}
                </motion.span>
            </AnimatePresence>
        </button>
    );
}

function BackHome() {
    const t = useTranslation();
    return (
        <Link
            to="/"
            className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] left-[calc(1rem+env(safe-area-inset-left,0px))] z-10 inline-flex h-8 items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white/60 px-2.5 text-caption font-semibold text-ink-soft backdrop-blur-md transition-colors hover:text-ink dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
        >
            <ArrowLeftIcon weight="bold" className="size-3.5" />
            {t('auth.backHome')}
        </Link>
    );
}

/**
 * --- AUTH SHELL ---
 * The frame shared by the signed-out pages (sign in, create an organization):
 * ambient glow, theme toggle, the glass card with the brand mark + title, and
 * the footer line. Pages pass their form (and anything under the card).
 */
export function AuthShell({ title, eyebrow, children, below }: { title: string; eyebrow: string; children: ReactNode; below?: ReactNode }) {
    return (
        <div className="relative min-h-dvh flex items-center justify-center overflow-hidden px-4 pb-6 pt-[calc(3.25rem+env(safe-area-inset-top,0px))] sm:pb-10 sm:pt-10">
            {/* Ambient brand glow */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-emerald-400/10 blur-3xl" />

            {/* Back to the landing page (web only: in the native app "/" is this sign-in). */}
            {!Capacitor.isNativePlatform() && <BackHome />}

            {/* Language + theme toggles */}
            <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-[calc(1rem+env(safe-area-inset-right,0px))] z-10 flex items-center gap-2">
                <LanguageToggle />
                <ThemeToggle />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="relative w-full max-w-md"
            >
                <div className="glass rounded-2xl p-5 sm:p-8 [--glass-shadow:var(--shadow-glass-lg)]">
                    {/* Brand */}
                    <div className="flex flex-col items-center text-center mb-4 sm:mb-6">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-2xl bg-emerald-500/40 blur-xl" />
                            <div className="relative size-10 sm:size-12 bg-linear-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <BrandGlyph className="size-full text-white" />
                            </div>
                        </div>
                        <h1 className="text-display text-ink dark:text-white mt-3 sm:mt-4">{title}</h1>
                        <p className="text-eyebrow leading-snug text-balance text-emerald-600 dark:text-emerald-300 mt-2">{eyebrow}</p>
                    </div>
                    {children}
                </div>
                {below}
                <p className="hidden sm:block text-center text-micro text-gray-400 mt-5">{APP_NAME} · 2026</p>
            </motion.div>
        </div>
    );
}
