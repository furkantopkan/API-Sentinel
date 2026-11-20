import { z } from 'zod';

/**
 * Zod speeds object schemas up with generated code. When a schema is CREATED
 * it probes whether the page allows that (`new Function`, caught when
 * refused). Under the app's CSP the probe is refused and the browser still
 * reports it as a violation in the console. "jitless" skips the probe;
 * schemas behave exactly the same.
 *
 * It has to be set before any schema exists, so index.ts imports this module
 * first. Only in a browser: the server has no CSP and keeps the fast path.
 */
export const ZOD_JITLESS_IN_BROWSER = 'document' in globalThis;

if (ZOD_JITLESS_IN_BROWSER) z.config({ jitless: true });
