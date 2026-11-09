import { z } from 'zod';
import { captureSchema } from './collections';
import { aiMetaSchema, suggestedAssertionSchema } from './ai';
import { httpMethodSchema } from './http';

/**
 * AI collection builder: a recording of real browser traffic plus a goal
 * written by the user become a draft collection, which the user reviews.
 */

export const MAX_RECORDED_ENTRIES = 40;
export const MAX_RESPONSE_SAMPLE = 3000;
export const MAX_RECORDED_BODY = 4000;

export const recordedEntrySchema = z.object({
  /** Position in the recording. Every draft step must point back to one of these. */
  index: z.number().int().nonnegative(),
  method: httpMethodSchema,
  url: z.string().max(8192),
  status: z.number().int(),
  requestHeaders: z.array(z.tuple([z.string().max(1024), z.string().max(8192)])).max(50),
  requestBody: z.string().max(MAX_RECORDED_BODY),
  responseContentType: z.string().max(200),
  responseSample: z.string().max(MAX_RESPONSE_SAMPLE),
});

export const buildCollectionRequestSchema = z.object({
  goal: z.string().trim().min(1, 'Describe what you want to test.').max(2000),
  entries: z.array(recordedEntrySchema).min(1).max(MAX_RECORDED_ENTRIES),
});

// What the model must return. Business rules are enforced afterwards by the server.
const modelStep = {
  sourceIndex: z.number().int(),
  name: z.string(),
  url: z.string(),
  headers: z.array(z.object({ key: z.string(), value: z.string() })),
  body: z.string(),
  assertions: z.array(suggestedAssertionSchema),
};

const modelCapture = z.object({ variable: z.string(), path: z.string(), secret: z.boolean() });
const draftVariable = z.object({ key: z.string(), value: z.string(), secret: z.boolean() });

export const collectionDraftOutputSchema = z.object({
  collectionName: z.string(),
  steps: z.array(z.object({ ...modelStep, captures: z.array(modelCapture) })),
  variables: z.array(draftVariable),
  notes: z.array(z.string()),
});

/** A checked draft: every step comes from the recording and can be run. */
export const collectionDraftSchema = z.object({
  collectionName: z.string(),
  steps: z.array(
    z.object({ ...modelStep, method: httpMethodSchema, captures: z.array(captureSchema) }),
  ),
  variables: z.array(draftVariable),
  notes: z.array(z.string()),
});

export const buildCollectionResponseSchema = z.object({
  ok: z.literal(true),
  result: collectionDraftSchema,
  meta: aiMetaSchema,
});

// Live recording: the backend opens a browser and the user performs the flow.
export const startRecordingRequestSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https?$/, error: 'Enter a valid http or https address.' })),
});

export const finishRecordingRequestSchema = z.object({}).strict();

export const recordingStatusSchema = z.object({
  /** False when the backend does not run on the user's own computer. */
  available: z.boolean(),
  active: z.boolean(),
  browserOpen: z.boolean(),
  captured: z.number().int().nonnegative(),
});

export const recordingStatusResponseSchema = z.object({
  ok: z.literal(true),
  status: recordingStatusSchema,
});

export const finishRecordingResponseSchema = z.object({
  ok: z.literal(true),
  entries: z.array(recordedEntrySchema).max(MAX_RECORDED_ENTRIES),
  found: z.number().int().nonnegative(),
});

export type RecordingStatus = z.infer<typeof recordingStatusSchema>;
export type RecordingStatusResponse = z.infer<typeof recordingStatusResponseSchema>;
export type FinishRecordingResponse = z.infer<typeof finishRecordingResponseSchema>;
export type RecordedEntry = z.infer<typeof recordedEntrySchema>;
export type BuildCollectionRequest = z.infer<typeof buildCollectionRequestSchema>;
export type CollectionDraftOutput = z.infer<typeof collectionDraftOutputSchema>;
export type CollectionDraft = z.infer<typeof collectionDraftSchema>;
export type CollectionDraftStep = CollectionDraft['steps'][number];
export type BuildCollectionResponse = z.infer<typeof buildCollectionResponseSchema>;
