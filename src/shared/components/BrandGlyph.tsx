/**
 * --- BRAND GLYPH ---
 * The Shiftella "S" — the same path as `public/favicon.svg`, drawn in
 * `currentColor` on the same 1024 grid, so it sits inside any accent tile at the
 * favicon's proportions. Size it with the tile (`size-full`).
 */
export function BrandGlyph({ className = 'size-full' }: { className?: string }) {
    return (
        <svg viewBox="0 0 1024 1024" fill="none" aria-hidden="true" className={className}>
            <path
                d="M615 345A126 106 0 1 0 512 512A126 106 0 1 1 409 679"
                stroke="currentColor"
                strokeWidth={108}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
