/**
 * True only in the public in-browser demo build (shiftella.app/demo/, see
 * tools/screenshots/vite.config.ts — DEMO_BUILD=1). A compile-time constant, so
 * demo-only UI is dropped from the real app bundle.
 */
/**
 * Where the demo lives. The file itself, not the folder: the server's SPA
 * fallback answers /demo/ with the real app (which then redirects here).
 */
export const DEMO_PATH = '/demo/index.html';

export const IS_DEMO_BUILD = import.meta.env.VITE_DEMO_BUILD === '1';
