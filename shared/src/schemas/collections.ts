import { z } from 'zod';
import { assertionListSchema } from '../assertions/schema';
import { executeRequestSchema } from './execute';
import { VARIABLE_NAME } from '../variables/resolveVariables';
import { httpMethodSchema } from './http';

/**
 * Collections (Phase 6.1): named groups of saved requests.
 * A saved request stores everything needed to reproduce it: the request
 * itself (same shape as POST /api/requests/execute) and its assertions.
 */

const name = z.string().trim().min(1, 'Name is required.').max(200);
const id = z.uuid();

/**
 * environmentId: the environment the collection runs with, whatever is
 * selected at the time. null unlinks it; omitted on rename keeps it.
 */
export const collectionInputSchema = z.object({ name, environmentId: id.nullable().optional() });

/**
 * Takes a value from a JSON response and makes it available to later requests
 * of the same run as {{variable}}. `secret` values (tokens) are masked.
 */
export const captureSchema = z.object({
  variable: z.string().regex(VARIABLE_NAME),
  path: z.string().max(2048),
  secret: z.boolean(),
});

const requestFields = {
  name,
  request: executeRequestSchema,
  assertions: assertionListSchema,
  /** Run order. Omitted on save: the stored value is kept. Equal values sort by name. */
  position: z.number().int().min(0).max(100_000).optional(),
  /** Omitted on save: the stored captures are kept (the editor does not change them). */
  captures: z.array(captureSchema).max(20).optional(),
};

export const savedRequestInputSchema = z.object({ collectionId: id, ...requestFields });

/** A whole collection created at once, in run order (e.g. from an AI draft). */
export const collectionImportSchema = z.object({
  name,
  environmentId: id.optional(),
  requests: z.array(z.object(requestFields)).min(1).max(100),
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
  environmentId: id.nullable(),
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

export type Capture = z.infer<typeof captureSchema>;
export type CollectionImport = z.infer<typeof collectionImportSchema>;
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type SavedRequestInput = z.infer<typeof savedRequestInputSchema>;
export type SavedRequestSummary = z.infer<typeof savedRequestSummarySchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type SavedRequest = z.infer<typeof savedRequestSchema>;
export type CollectionListResponse = z.infer<typeof collectionListResponseSchema>;
export type CollectionResponse = z.infer<typeof collectionResponseSchema>;
export type SavedRequestResponse = z.infer<typeof savedRequestResponseSchema>;
export type DeletedResponse = z.infer<typeof deletedResponseSchema>;
