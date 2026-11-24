import { z } from 'zod';

/**
 * Zod would probe `new Function('')` to decide whether it may JIT-compile
 * object parsers. Under our CSP (script-src 'self', no 'unsafe-eval') the probe
 * is blocked and reported as a CSP violation on every page load. `jitless`
 * skips the probe and the JIT; parsing stays correct and our payloads are
 * small. Imported first thing in main.tsx, before any schema parses.
 */
z.config({ jitless: true });
