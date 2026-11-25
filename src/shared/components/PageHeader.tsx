import type { ReactNode } from 'react';

/**
 * --- PAGE HEADER ---
 * The one title block every page opens with: an accent eyebrow (what kind of
 * page / which period), the page title in the display face, and an optional
 * actions slot on the right (filters, export, month picker…). Keeps titles the
 * same size and rhythm everywhere instead of each page hand-rolling its own.
 */
export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    help,
    className = '',
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    /** One quiet line under the title (scope, who sees what…). */
    description?: ReactNode;
    actions?: ReactNode;
    /** A small contextual help control beside the title (e.g. `<HelpLink article="…" />`). */
    help?: ReactNode;
    className?: string;
}) {
    return (
        <header className={`mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${className}`}>
            <div className="min-w-0">
                {eyebrow && <p className="mb-1.5 text-eyebrow text-emerald-600 dark:text-emerald-300">{eyebrow}</p>}
                {help ? (
                    <div className="flex items-center gap-1.5">
                        <h1 className="text-greeting text-pretty text-ink dark:text-white">{title}</h1>
                        {help}
                    </div>
                ) : (
                    <h1 className="text-greeting text-pretty text-ink dark:text-white">{title}</h1>
                )}
                {description && <p className="mt-1 text-meta text-ink-soft dark:text-slate-400">{description}</p>}
            </div>
            {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}
