/**
 * Screenshot harness: the real app, served by Vite, with the Supabase client
 * swapped for an in-memory fake over invented demo data and the clock pinned.
 * Not part of the app build — see tools/screenshots/README.md.
 */
import { defineConfig, type Alias, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import appConfig from '../../vite.config';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

/**
 * E2E build (`corepack yarn e2e`): served under the real, enforced CSP, which
 * forbids inline scripts — so no pinned clock (the demo data is relative to
 * "now" anyway) and its own output folder.
 */
const E2E = process.env.E2E_BUILD === '1';

/**
 * Public demo (`corepack yarn build:demo`): the same in-memory fake, shipped at
 * shiftella.app/demo/ so visitors can try the app with nothing stored anywhere —
 * each tab gets its own copy, gone on close. Hash routing (/demo/#/schedule), so a
 * reload never needs a server-side fallback; no pinned clock (data is relative to now).
 */
const DEMO = process.env.DEMO_BUILD === '1';

/** The moment the app believes it is (override with SCREENSHOT_NOW). */
const NOW = process.env.SCREENSHOT_NOW ?? '2026-12-10T10:30:00+01:00';

/** Pins Date before any app module runs; the clock keeps ticking from NOW. */
function pinnedClock(): Plugin {
    const fixed = Date.parse(NOW);
    if (Number.isNaN(fixed)) throw new Error(`SCREENSHOT_NOW is not a date: ${NOW}`);
    const script = `(() => {
  const RealDate = Date;
  const offset = ${fixed} - RealDate.now();
  class PinnedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  window.Date = PinnedDate;
})();`;
    return {
        name: 'screenshots:pinned-clock',
        transformIndexHtml: () => [{ tag: 'script', children: script, injectTo: 'head-prepend' }],
    };
}

/** Every import of the real Supabase client (any alias or relative path) gets the fake. */
function fakeSupabase(): Plugin {
    const real = path.join(root, 'src/shared/api/supabaseClient.ts');
    const fake = path.join(here, 'fake/supabaseClient.ts');
    return {
        name: 'screenshots:fake-supabase',
        enforce: 'pre',
        async resolveId(source, importer, options) {
            if (!source.includes('supabaseClient') || importer === fake) return null;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            return resolved && path.normalize(resolved.id) === real ? fake : null;
        },
    };
}

/** The demo page is not a landing page: keep it out of search results. */
function demoHtml(): Plugin {
    return {
        name: 'demo:noindex',
        transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }],
    };
}

const appAliases = Object.entries((appConfig.resolve?.alias ?? {}) as Record<string, string>).map(
    ([find, replacement]): Alias => ({ find, replacement }),
);

export default defineConfig({
    root,
    cacheDir: path.join(root, 'node_modules/.vite-screenshots'),
    base: DEMO ? '/demo/' : '/',
    // The demo sits next to the real build: public/ files are already served from the root.
    publicDir: DEMO ? false : undefined,
    define: { ...appConfig.define, 'import.meta.env.VITE_DEMO_BUILD': JSON.stringify(DEMO ? '1' : '') },
    plugins: [fakeSupabase(), ...(appConfig.plugins ?? []), ...(E2E || DEMO ? [] : [pinnedClock()]), ...(DEMO ? [demoHtml()] : [])],
    build: { ...appConfig.build, outDir: DEMO ? 'dist/demo' : 'dist-e2e', emptyOutDir: true },
    resolve: { alias: appAliases },
    server: { port: Number(process.env.SCREENSHOT_PORT ?? 5199), strictPort: true, host: '127.0.0.1' },
    clearScreen: false,
});
