/// <reference types="vite/client" />

/** App version, injected from package.json at build time (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** '1' in the public demo build only (tools/screenshots/vite.config.ts). */
  readonly VITE_DEMO_BUILD?: string;
}
