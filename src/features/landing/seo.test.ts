import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRICES } from '@features/billing/plans';

/** Static SEO files must stay in step with the app (index.html can't import plans.ts). */
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('SEO files', () => {
    it('index.html JSON-LD offers match billing/plans.ts', () => {
        const html = read('index.html');
        const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
        expect(json).toBeTruthy();
        const data = JSON.parse(json!);
        expect(data['@type']).toBe('SoftwareApplication');
        const price = (name: string) => Number(data.offers.find((o: { name: string }) => o.name === name).price);
        expect(price('Free')).toBe(0);
        expect(price('Team')).toBe(PRICES.team.month.czk);
        expect(price('Business')).toBe(PRICES.business.month.czk);
    });

    it('index.html has Open Graph + Twitter tags pointing at the OG image', () => {
        const html = read('index.html');
        expect(html).toContain('property="og:image" content="https://shiftella.app/og-image.png"');
        expect(html).toContain('name="twitter:card" content="summary_large_image"');
    });

    it('robots.txt keeps the app out and points at the sitemap', () => {
        const robots = read('public/robots.txt');
        for (const p of ['/overview', '/schedule', '/admin', '/settings', '/billing']) expect(robots).toContain(`Disallow: ${p}`);
        expect(robots).toContain('Sitemap: https://shiftella.app/sitemap.xml');
        const sitemap = read('public/sitemap.xml');
        for (const p of ['/', '/login', '/signup', '/privacy', '/terms']) expect(sitemap).toContain(`<loc>https://shiftella.app${p}</loc>`);
    });
});
