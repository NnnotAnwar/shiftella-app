/** Centered section heading for the landing page: eyebrow, title, optional subline. */
export function SectionHead({ id, eyebrow, title, sub }: { id: string; eyebrow: string; title: string; sub?: string }) {
    return (
        <div data-reveal className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-emerald-700 dark:text-emerald-300">{eyebrow}</p>
            <h2 id={id} className="mt-2.5 font-display text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl dark:text-white">
                {title}
            </h2>
            {sub && <p className="mt-2.5 text-body text-pretty text-ink-soft dark:text-slate-400">{sub}</p>}
        </div>
    );
}
