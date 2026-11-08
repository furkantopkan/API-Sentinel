import { z } from 'zod';
import { VARIABLE_NAME } from '../variables/resolveVariables';

/**
 * Environments (Phase 6.2): named sets of `{{variables}}`.
 *
 * Secret values are write-only: the API accepts them but never returns them.
 * The browser only learns that a value exists (`hasValue`), and placeholders
 * are resolved on the server when a request is sent.
 */

const id = z.uuid();
const name = z.string().trim().min(1, 'Name is required.').max(200);

export const MAX_VARIABLES = 200;

const variableKey = z
  .string()
  .trim()
  .max(200)
  .regex(VARIABLE_NAME, 'Use letters, digits, "_", "-" or "."; start with a letter or "_".');

export const variableInputSchema = z.object({
  /** Existing variable: a secret sent without `value` keeps its stored value. */
  id: id.optional(),
  key: variableKey,
  value: z.string().max(8192).optional(),
  isSecret: z.boolean(),
  enabled: z.boolean(),
});

export const environmentInputSchema = z.object({
  name,
  variables: z
    .array(variableInputSchema)
    .max(MAX_VARIABLES)
    .superRefine((variables, ctx) => {
      const seen = new Set<string>();
      variables.forEach((variable, index) => {
        if (seen.has(variable.key)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate variable "${variable.key}".`,
            path: [index, 'key'],
          });
        }
        seen.add(variable.key);
      });
    }),
});

export const environmentVariableSchema = z.object({
  id,
  key: z.string(),
  /** Always "" for secrets: the stored value never leaves the server. */
  value: z.string(),
  isSecret: z.boolean(),
  enabled: z.boolean(),
  hasValue: z.boolean(),
});

export const environmentSchema = z.object({
  id,
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  variables: z.array(environmentVariableSchema),
});

export const environmentListResponseSchema = z.object({
  ok: z.literal(true),
  environments: z.array(environmentSchema),
});
export const environmentResponseSchema = z.object({
  ok: z.literal(true),
  environment: environmentSchema,
});

export type VariableInput = z.infer<typeof variableInputSchema>;
export type EnvironmentInput = z.infer<typeof environmentInputSchema>;
export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type EnvironmentListResponse = z.infer<typeof environmentListResponseSchema>;
export type EnvironmentResponse = z.infer<typeof environmentResponseSchema>;
