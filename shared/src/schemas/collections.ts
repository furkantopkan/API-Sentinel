import { z } from 'zod';
import { assertionListSchema } from '../assertions/schema';
import { executeRequestSchema } from './execute';
import { httpMethodSchema } from './http';

/**
 * Collections (Phase 6.1): named groups of saved requests.
 * A saved request stores everything needed to reproduce it: the request
 * itself (same shape as POST /api/requests/execute) and its assertions.
 */

const name = z.string().trim().min(1, 'Name is required.').max(200);
const id = z.uuid();

export const collectionInputSchema = z.object({ name });

export const savedRequestInputSchema = z.object({
  collectionId: id,
  name,
  request: executeRequestSchema,
  assertions: assertionListSchema,
});

/** Response shapes. Dates are ISO strings. */
export const savedRequestSummarySchema = z.object({
  id,
  name: z.string(),
  method: httpMethodSchema,
  url: z.string(),
});

export const collectionSchema = z.object({
  id,
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  requests: z.array(savedRequestSummarySchema),
});

export const savedRequestSchema = savedRequestInputSchema.extend({
  id,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const collectionListResponseSchema = z.object({
  ok: z.literal(true),
  collections: z.array(collectionSchema),
});
export const collectionResponseSchema = z.object({
  ok: z.literal(true),
  collection: collectionSchema,
});
export const savedRequestResponseSchema = z.object({
  ok: z.literal(true),
  savedRequest: savedRequestSchema,
});
export const deletedResponseSchema = z.object({ ok: z.literal(true), deleted: z.literal(true) });

export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type SavedRequestInput = z.infer<typeof savedRequestInputSchema>;
export type SavedRequestSummary = z.infer<typeof savedRequestSummarySchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type SavedRequest = z.infer<typeof savedRequestSchema>;
export type CollectionListResponse = z.infer<typeof collectionListResponseSchema>;
export type CollectionResponse = z.infer<typeof collectionResponseSchema>;
export type SavedRequestResponse = z.infer<typeof savedRequestResponseSchema>;
export type DeletedResponse = z.infer<typeof deletedResponseSchema>;
