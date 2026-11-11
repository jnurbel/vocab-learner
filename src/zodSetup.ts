import { config } from 'zod';

/**
 * zod probes for `new Function()` to compile faster validators: the strict CSP (no
 * 'unsafe-eval') refuses it, and the browser reports a violation. Validate without it. Imported
 * first by main.ts, before any schema is built.
 */
config({ jitless: true });
