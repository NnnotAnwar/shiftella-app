import { useLayoutEffect, type RefObject } from 'react';

/**
 * Subtle scroll reveal for the landing page: every `[data-reveal]` below the
 * fold starts slightly faded/lowered and settles in once it scrolls into view
 * (styles in index.css, keyed on `data-reveal="out"`). Content above the fold,
 * reduced-motion users and browsers without IntersectionObserver see
 * everything at once — nothing is ever hidden for them.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
    useLayoutEffect(() => {
        const el = root.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const targets = [...el.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
            (n) => n.getBoundingClientRect().top > window.innerHeight,
        );
        targets.forEach((n) => (n.dataset.reveal = 'out'));

        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    (e.target as HTMLElement).dataset.reveal = 'in';
                    io.unobserve(e.target);
                }
            },
            { rootMargin: '0px 0px -8% 0px' },
        );
        targets.forEach((n) => io.observe(n));
        return () => io.disconnect();
    }, [root]);
}
