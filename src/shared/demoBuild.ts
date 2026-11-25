/**
 * True only in the public in-browser demo build (shiftella.app/demo/, see
 * tools/screenshots/vite.config.ts — DEMO_BUILD=1). A compile-time constant, so
 * demo-only UI is dropped from the real app bundle.
 */
export const IS_DEMO_BUILD = import.meta.env.VITE_DEMO_BUILD === '1';
