// @vitest-environment jsdom
import '@api-sentinel/shared';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

// The app's CSP forbids eval; Zod would probe for it when a schema is created
// and the browser reports the refused probe in the console (seen in Firefox).
describe('Zod in the browser', () => {
  it('never probes for eval once the shared package is loaded', () => {
    expect(z.config().jitless).toBe(true);
  });
});
