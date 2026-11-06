import { z } from 'zod';

/** Response body of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
  version: z.string(),
});

// The TypeScript type is derived from the schema, so the two can never drift apart.
export type HealthResponse = z.infer<typeof healthResponseSchema>;
