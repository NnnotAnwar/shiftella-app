import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
    ArrowRightIcon,
    ArrowsLeftRightIcon,
    BellRingingIcon,
    CaretDownIcon,
    CheckIcon,
    ClockIcon,
    DevicesIcon,
    FileTextIcon,
    GridFourIcon,
    ScalesIcon,
    ShieldCheckIcon,
    XIcon,
    type Icon,
} from '@phosphor-icons/react';
import { usePreferences } from '@shared/preferences/PreferencesContext';
import { buttonClass } from '@shared/components/buttonStyles';
import { BrandGlyph } from '@shared/components/BrandGlyph';
import { APP_NAME, SUPPORT_EMAIL } from '@shared/brand';
import { TRIAL_DAYS } from '@features/billing/plans';
import { LanguageToggle, ThemeToggle } from '@features/auth/AuthShell';
import { LANDING, fill, type FeatureIcon, type LandingCopy } from './landingContent';
import { PricingSection } from './PricingSection';
import { SectionHead } from './SectionHead';
import { useReveal } from './useReveal';

/**
 * --- LANDING PAGE ---
 * The public face of shiftella.app for signed-out web visitors (signed-in users
 * get the app at "/", the native apps go to sign-in — see `guestHome()`).
 * Sells the product to Czech small-business owners: hero → problem/solution →
 * features → how it works → pricing (from plans.ts) → FAQ → footer.
 * Lazy-loaded as its own chunk; CSS-only motion, no extra libraries.
 */

const FOCUS = 'rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
const CONTAINER = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

const FEATURE_ICONS: Record<FeatureIcon, Icon> = {
    clock: ClockIcon,
    grid: GridFourIcon,
    swap: ArrowsLeftRightIcon,
    sheet: FileTextIcon,
    law: ScalesIcon,
    roles: ShieldCheckIcon,
    bell: BellRingingIcon,
    devices: DevicesIcon,
};

/** Per-language <title> + meta description while the landing is on screen. */
function useDocumentMeta({ title, description }: LandingCopy['meta']) {
    useEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        const prev = { title: document.title, description: meta?.content };
        document.title = title;
        if (meta) meta.content = description;
        return () => {
            document.title = prev.title;
            if (meta && prev.description !== undefined) meta.content = prev.description;
        };
    }, [title, description]);
}

function Brand() {
    return (
        <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/30">
                <BrandGlyph className="size-full text-white" />
            </span>
            <span className="font-display text-base font-bold tracking-tight text-ink dark:text-white">{APP_NAME}</span>
        </span>
    );
}

function Header({ c }: { c: LandingCopy }) {
    const links = [
        { href: '#features', label: c.nav.features },
        { href: '#pricing', label: c.nav.pricing },
        { href: '#faq', label: c.nav.faq },
    ];
    return (
        <header className="sticky top-0 z-30 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:pt-3">
            <div className={CONTAINER}>
                <div className="glass flex h-13 items-center gap-2 rounded-2xl pr-2 pl-3 [--glass-bg:rgb(255_255_255/0.72)]">
                    <a href="#top" className={FOCUS} aria-label={APP_NAME}>
                        <Brand />
                    </a>
                    <nav aria-label={c.nav.menu} className="ml-4 hidden md:block">
                        <ul className="flex items-center gap-1">
                            {links.map((l) => (
                                <li key={l.href}>
                                    <a href={l.href} className={`${FOCUS} px-2.5 py-1.5 text-meta text-ink-soft transition-colors hover:text-ink dark:text-slate-400 dark:hover:text-white`}>
                                        {l.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    <div className="ml-auto flex items-center gap-1.5">
                        <LanguageToggle />
                        <ThemeToggle />
                        <Link to="/login" className={`${buttonClass({ variant: 'ghost', size: 'sm' })} ${FOCUS} px-2 sm:px-3`}>
                            {c.nav.signIn}
                        </Link>
                        {/* Wrapper carries the breakpoint: the link's own inline-flex would beat `hidden`. */}
                        <div className="hidden sm:block">
                            <Link to="/signup" className={`${buttonClass({ variant: 'primary', size: 'sm' })} ${FOCUS}`}>
                                {fill(c.hero.cta, { days: TRIAL_DAYS })}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

function Hero({ c }: { c: LandingCopy }) {
    const h = c.hero;
    return (
        <section aria-labelledby="hero-title" className={`${CONTAINER} grid items-center gap-10 pt-10 pb-10 sm:pt-14 lg:grid-cols-[1fr_1.15fr] lg:gap-12 lg:pt-16 lg:pb-14`}>
            <div className="landing-rise text-center lg:text-left">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-small-strong text-emerald-700 ring-1 ring-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/15">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {h.eyebrow}
                </p>
                <h1 id="hero-title" className="mt-4 font-display text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl sm:leading-[1.08] dark:text-white">
                    {h.title} <span className="text-emerald-600 dark:text-emerald-400">{h.titleAccent}</span>
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-ink-soft lg:mx-0 dark:text-slate-400">{h.sub}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2.5 lg:justify-start">
                    <Link to="/signup" className={`${buttonClass({ variant: 'primary', size: 'lg' })} ${FOCUS}`}>
                        {fill(h.cta, { days: TRIAL_DAYS })}
                        <ArrowRightIcon weight="bold" aria-hidden="true" className="size-4" />
                    </Link>
                    {/* Phones: sign-in sits in the header, so the hero keeps one clear CTA. */}
                    <div className="hidden sm:block">
                        <Link to="/login" className={`${buttonClass({ variant: 'secondary', size: 'lg' })} ${FOCUS}`}>
                            {h.secondary}
                        </Link>
                    </div>
                </div>
                <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-meta text-ink-soft lg:justify-start dark:text-slate-400">
                    {h.trust.map((item) => (
                        <li key={item} className="flex items-center gap-1.5">
                            <CheckIcon weight="bold" aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            {item}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="landing-rise relative mx-auto w-full max-w-2xl pb-6 [--rise-delay:120ms] lg:max-w-none">
                <div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-emerald-500/15 blur-3xl dark:bg-emerald-500/20" />
                <div className="glass relative rounded-2xl p-1.5 [--glass-shadow:var(--shadow-glass-lg)] sm:p-2">
                    <img
                        src="/landing/dashboard-960.webp"
                        srcSet="/landing/dashboard-960.webp 960w, /landing/dashboard-1600.webp 1600w"
                        sizes="(min-width: 1024px) 640px, 92vw"
                        width={1600}
                        height={1000}
                        alt={h.imgAlt}
                        fetchPriority="high"
                        className="block h-auto w-full rounded-xl dark:brightness-95"
                    />
                </div>
                <div className="absolute -bottom-2 -left-2 w-[29%] max-w-44 rounded-[1.4rem] bg-ink p-1 shadow-2xl shadow-ink/40 ring-1 ring-white/15 sm:-left-5 sm:rounded-[1.8rem] sm:p-1.5">
                    <img
                        src="/landing/mobile-home-480.webp"
                        width={480}
                        height={1039}
                        alt={h.phoneAlt}
                        className="block h-auto w-full rounded-[1.15rem] sm:rounded-[1.4rem] dark:brightness-95"
                    />
                </div>
            </div>
        </section>
    );
}

function Problem({ c }: { c: LandingCopy }) {
    const p = c.problem;
    return (
        <section aria-labelledby="problem-title" className={`${CONTAINER} py-12 sm:py-16`}>
            <SectionHead id="problem-title" eyebrow={p.eyebrow} title={p.title} />
            <div data-reveal className="glass mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl">
                <div className="hidden grid-cols-2 border-b border-ink/5 text-eyebrow sm:grid dark:border-white/10">
                    <p className="px-5 py-3 text-ink-soft dark:text-slate-400">{p.before}</p>
                    <p className="px-5 py-3 text-emerald-700 dark:text-emerald-300">{p.after}</p>
                </div>
                <ul className="divide-y divide-ink/5 dark:divide-white/10">
                    {p.rows.map((r) => (
                        <li key={r.after} className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-2 sm:gap-0 sm:px-0 sm:py-0">
                            <p className="flex items-start gap-2 text-meta text-ink-soft sm:px-5 sm:py-3.5 dark:text-slate-400">
                                <XIcon weight="bold" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-rose-500/80" />
                                <span>
                                    <span className="sr-only">{p.before}: </span>
                                    {r.before}
                                </span>
                            </p>
                            <p className="flex items-start gap-2 text-meta font-semibold text-ink sm:bg-emerald-500/4 sm:px-5 sm:py-3.5 dark:text-white dark:sm:bg-emerald-400/5">
                                <CheckIcon weight="bold" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span>
                                    <span className="sr-only">{p.after}: </span>
                                    {r.after}
                                </span>
                            </p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function Features({ c }: { c: LandingCopy }) {
    const f = c.features;
    return (
        <section id="features" aria-labelledby="features-title" className={`${CONTAINER} scroll-mt-20 py-12 sm:py-16`}>
            <SectionHead id="features-title" eyebrow={f.eyebrow} title={f.title} sub={f.sub} />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {f.items.map((item) => {
                    const FeatureGlyph = FEATURE_ICONS[item.icon];
                    return (
                        <li key={item.title} data-reveal className="glass flex gap-3.5 rounded-2xl p-4 sm:block">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/15">
                                <FeatureGlyph weight="duotone" aria-hidden="true" className="size-5" />
                            </span>
                            <div>
                                <h3 className="text-heading text-ink sm:mt-3 dark:text-white">{item.title}</h3>
                                <p className="mt-1 text-meta text-ink-soft dark:text-slate-400">{item.body}</p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function Steps({ c }: { c: LandingCopy }) {
    const s = c.steps;
    return (
        <section aria-labelledby="steps-title" className={`${CONTAINER} py-12 sm:py-16`}>
            <SectionHead id="steps-title" eyebrow={s.eyebrow} title={s.title} />
            <div className="mt-8 grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
                <ol className="space-y-3">
                    {s.items.map((step, i) => (
                        <li key={step.title} data-reveal className="glass flex gap-3.5 rounded-2xl p-4">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-emerald-500 to-emerald-700 font-display text-sm font-bold text-white shadow-md shadow-emerald-500/30">
                                {i + 1}
                            </span>
                            <div>
                                <h3 className="text-heading text-ink dark:text-white">{step.title}</h3>
                                <p className="mt-1 text-meta text-ink-soft dark:text-slate-400">{step.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
                <div data-reveal className="glass rounded-2xl p-1.5 [--glass-shadow:var(--shadow-glass-lg)] sm:p-2">
                    <img
                        src="/landing/rota-960.webp"
                        srcSet="/landing/rota-960.webp 960w, /landing/rota-1600.webp 1600w"
                        sizes="(min-width: 1024px) 680px, 92vw"
                        width={1600}
                        height={1000}
                        alt={s.imgAlt}
                        loading="lazy"
                        decoding="async"
                        className="block h-auto w-full rounded-xl dark:brightness-95"
                    />
                </div>
            </div>
        </section>
    );
}

function Faq({ c }: { c: LandingCopy }) {
    const f = c.faq;
    return (
        <section id="faq" aria-labelledby="faq-title" className={`${CONTAINER} scroll-mt-20 py-12 sm:py-16`}>
            <SectionHead id="faq-title" eyebrow={f.eyebrow} title={f.title} />
            <div data-reveal className="glass mx-auto mt-8 max-w-3xl divide-y divide-ink/5 rounded-2xl dark:divide-white/10">
                {f.items.map((item) => (
                    <details key={item.q} className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-body-strong text-ink outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset dark:text-white [&::-webkit-details-marker]:hidden">
                            {item.q}
                            <CaretDownIcon weight="bold" aria-hidden="true" className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180 dark:text-slate-400" />
                        </summary>
                        <p className="-mt-1 px-5 pb-4 text-meta text-ink-soft dark:text-slate-400">{fill(item.a, { days: TRIAL_DAYS })}</p>
                    </details>
                ))}
            </div>
        </section>
    );
}

function FinalCta({ c }: { c: LandingCopy }) {
    return (
        <section aria-labelledby="final-title" className={`${CONTAINER} pt-4 pb-12 sm:pb-16`}>
            <div data-reveal className="relative overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 to-emerald-800 px-6 py-10 text-center shadow-xl shadow-emerald-700/25 sm:py-12">
                <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-3xl" />
                <h2 id="final-title" className="relative font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{c.final.title}</h2>
                <p className="relative mt-2 text-body text-white/80">{fill(c.final.sub, { days: TRIAL_DAYS })}</p>
                <Link
                    to="/signup"
                    className="relative mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-emerald-800 shadow-lg shadow-emerald-950/20 transition-all hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] md:min-h-10"
                >
                    {fill(c.final.cta, { days: TRIAL_DAYS })}
                    <ArrowRightIcon weight="bold" aria-hidden="true" className="size-4" />
                </Link>
            </div>
        </section>
    );
}

function Footer({ c }: { c: LandingCopy }) {
    const f = c.footer;
    const link = `${FOCUS} text-meta text-ink-soft transition-colors hover:text-ink dark:text-slate-400 dark:hover:text-white`;
    return (
        <footer className="border-t border-ink/5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] dark:border-white/10">
            <div className={`${CONTAINER} flex flex-col gap-5 pt-8 sm:flex-row sm:items-start sm:justify-between`}>
                <div>
                    <Brand />
                    <p className="mt-2 text-meta text-ink-soft dark:text-slate-400">{f.tagline}</p>
                </div>
                <nav aria-label={APP_NAME}>
                    <ul className="flex flex-wrap gap-x-5 gap-y-2">
                        <li><Link to="/login" className={link}>{f.signIn}</Link></li>
                        <li><Link to="/signup" className={link}>{f.signUp}</Link></li>
                        <li><Link to="/privacy" className={link}>{f.privacy}</Link></li>
                        <li><Link to="/terms" className={link}>{f.terms}</Link></li>
                        <li><a href={`mailto:${SUPPORT_EMAIL}`} className={link}>{f.contact}</a></li>
                    </ul>
                </nav>
            </div>
            <p className={`${CONTAINER} mt-6 text-caption text-ink-soft dark:text-slate-500`}>
                © {new Date().getFullYear()} {APP_NAME}
            </p>
        </footer>
    );
}

export function LandingPage() {
    const { language } = usePreferences();
    const c = LANDING[language];
    const rootRef = useRef<HTMLDivElement>(null);
    useDocumentMeta(c.meta);
    useReveal(rootRef);

    // Belt and braces: the native apps never show marketing or prices.
    if (Capacitor.isNativePlatform()) return <Navigate to="/login" replace />;

    return (
        <div ref={rootRef} id="top" className="relative min-h-dvh overflow-x-clip">
            <a
                href="#main"
                className="sr-only z-50 rounded-xl bg-white px-3 py-2 text-small-strong text-ink shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
                {c.nav.skip}
            </a>
            {/* Ambient brand glow */}
            <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-emerald-500/15 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute top-[28rem] -right-32 size-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />

            <Header c={c} />
            <main id="main" className="relative">
                <Hero c={c} />
                <Problem c={c} />
                <Features c={c} />
                <Steps c={c} />
                <div className={CONTAINER}>
                    <PricingSection />
                </div>
                <Faq c={c} />
                <FinalCta c={c} />
            </main>
            <Footer c={c} />
        </div>
    );
}
