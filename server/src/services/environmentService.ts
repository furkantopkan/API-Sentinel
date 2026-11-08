import {
  environmentSchema,
  type Environment,
  type EnvironmentInput,
  type VariableLookup,
} from '@api-sentinel/shared';
import { AppError } from '../errors/AppError';
import type {
  EnvironmentRepository,
  StoredEnvironment,
  StoredVariable,
} from '../repositories/environmentRepository';
import type { ServiceClock } from './collectionService';

const systemClock: ServiceClock = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};

export const MAX_ENVIRONMENTS = 100;

/** The API view: secret values are blanked here, the single exit point. */
function toPublic(environment: StoredEnvironment): Environment {
  return environmentSchema.parse({
    ...environment,
    variables: environment.variables.map(({ value, ...variable }) => ({
      ...variable,
      value: variable.isSecret ? '' : value,
      hasValue: value !== '',
    })),
  });
}

/**
 * Works out what to store for each submitted variable. Secrets are write-only:
 * - no new value → keep the stored one (the UI never had it);
 * - a secret that is un-marked without a new value is emptied, otherwise
 *   ticking off "secret" would reveal it.
 */
export function mergeVariables(
  input: EnvironmentInput['variables'],
  existing: readonly StoredVariable[],
  newId: () => string,
): StoredVariable[] {
  const byId = new Map(existing.map((variable) => [variable.id, variable]));
  return input.map((variable) => {
    const previous = variable.id === undefined ? undefined : byId.get(variable.id);
    const keptValue = previous?.isSecret && variable.isSecret ? previous.value : '';
    return {
      id: previous?.id ?? newId(),
      key: variable.key,
      value: variable.value ?? keptValue,
      isSecret: variable.isSecret,
      enabled: variable.enabled,
    };
  });
}

export function createEnvironmentService(
  repo: EnvironmentRepository,
  clock: ServiceClock = systemClock,
) {
  function requireStored(id: string): StoredEnvironment {
    const environment = repo.get(id);
    if (!environment) throw new AppError('NOT_FOUND', 'Environment not found.', 404);
    return environment;
  }

  return {
    list: (): Environment[] => repo.list().map(toPublic),

    create(input: EnvironmentInput): Environment {
      if (repo.list().length >= MAX_ENVIRONMENTS) {
        throw new AppError('VALIDATION_ERROR', `At most ${MAX_ENVIRONMENTS} environments.`, 400);
      }
      const id = clock.newId();
      repo.insert(
        id,
        input.name,
        mergeVariables(input.variables, [], () => clock.newId()),
        clock.now(),
      );
      return toPublic(requireStored(id));
    },

    update(id: string, input: EnvironmentInput): Environment {
      const existing = requireStored(id);
      const variables = mergeVariables(input.variables, existing.variables, () => clock.newId());
      repo.update(id, input.name, variables, clock.now());
      return toPublic(requireStored(id));
    },

    remove(id: string): void {
      if (!repo.remove(id)) throw new AppError('NOT_FOUND', 'Environment not found.', 404);
    },

    /** Real values for sending a request. Stays on the server. */
    resolver(id: string): { lookup: VariableLookup; secrets: string[] } {
      const enabled = requireStored(id).variables.filter((variable) => variable.enabled);
      const values = new Map(enabled.map((variable) => [variable.key, variable.value]));
      return {
        lookup: (name) => values.get(name),
        secrets: enabled.filter((v) => v.isSecret && v.value !== '').map((v) => v.value),
      };
    },
  };
}

export type EnvironmentService = ReturnType<typeof createEnvironmentService>;
