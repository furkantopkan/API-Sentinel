import {
  createSecretMasker,
  evaluateAssertions,
  type Run,
  type RunRequestResult,
  type RunSummary,
  type SavedRequest,
} from '@api-sentinel/shared';
import { AppError } from '../errors/AppError';
import type { RunRepository } from '../repositories/runRepository';
import type { CollectionService, ServiceClock } from './collectionService';
import type { EnvironmentService } from './environmentService';
import { applyCaptures, type FlowState } from './captures';
import { createCookieJar } from './cookieJar';
import { maskResponse, type ExecutionContext, type ExecutionService } from './executionService';

/** History is capped so the database cannot grow without limit. */
export const MAX_RUNS_PER_COLLECTION = 100;
export const RUN_LIST_LIMIT = 200;

interface RunDeps {
  repo: RunRepository;
  collections: CollectionService;
  environments: EnvironmentService;
  execution: ExecutionService;
  clock?: ServiceClock;
}

const systemClock: ServiceClock = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
};

/** One failed request must not stop the run, so failures become results. */
async function runOne(
  saved: SavedRequest,
  baseContext: ExecutionContext,
  flow: FlowState,
  execution: ExecutionService,
  signal: AbortSignal | undefined,
): Promise<RunRequestResult> {
  // Values captured by earlier requests win over environment variables.
  const flowMask = createSecretMasker(flow.secrets);
  const context: ExecutionContext = {
    ...baseContext,
    lookup: (name) => flow.values.get(name) ?? baseContext.lookup(name),
    mask: (text) => baseContext.mask(flowMask(text)),
  };
  const base = {
    savedRequestId: saved.id,
    name: saved.name,
    method: saved.request.method,
    url: saved.request.url, // the {{variable}} form: never contains a secret value
  };
  try {
    let response = await execution.execute(saved.request, context, signal);
    const captures = applyCaptures(saved.captures ?? [], response, flow);
    // A token captured from this response, or a session cookie it set, must not
    // show up in the results (a header assertion on Set-Cookie would show it).
    const hidden = [...captures.newSecrets, ...(baseContext.cookies?.values() ?? [])];
    if (hidden.length > 0) {
      response = maskResponse(response, createSecretMasker(hidden));
    }
    const assertions = [...captures.results, ...evaluateAssertions(saved.assertions, response)];
    return {
      ...base,
      outcome: assertions.every((a) => a.outcome === 'pass') ? 'pass' : 'fail',
      status: response.status,
      statusText: response.statusText,
      durationMs: response.durationMs,
      errorCode: null,
      errorMessage: null,
      assertions,
    };
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled: stop the whole run
    return {
      ...base,
      outcome: 'error',
      status: null,
      statusText: '',
      durationMs: null,
      errorCode: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      errorMessage: error instanceof AppError ? error.message : 'Unexpected error.',
      assertions: [],
    };
  }
}

export function createRunService({
  repo,
  collections,
  environments,
  execution,
  clock = systemClock,
}: RunDeps) {
  return {
    /**
     * Runs the saved requests of a collection one after the other and stores
     * the outcome. A cancelled run throws and is not stored.
     */
    async start(collectionId: string, environmentId?: string, signal?: AbortSignal): Promise<Run> {
      const collection = collections.list().find((c) => c.id === collectionId);
      if (!collection) throw new AppError('NOT_FOUND', 'Collection not found.', 404);
      if (collection.requests.length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This collection has no saved requests to run.',
          400,
        );
      }
      // Like a browser session: a cart or login set by one request is seen by the next.
      const context = { ...execution.context(environmentId), cookies: createCookieJar() };
      const environmentName =
        environmentId === undefined
          ? null
          : (environments.list().find((e) => e.id === environmentId)?.name ?? null);

      const startedAt = clock.now();
      const started = performance.now();
      const results: RunRequestResult[] = [];
      const flow: FlowState = { values: new Map(), secrets: [] };
      for (const summary of collection.requests) {
        const saved = collections.getRequest(summary.id);
        results.push(await runOne(saved, context, flow, execution, signal));
      }

      const count = (outcome: RunRequestResult['outcome']) =>
        results.filter((r) => r.outcome === outcome).length;
      const run: Run = {
        id: clock.newId(),
        collectionId,
        collectionName: collection.name,
        environmentName,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        total: results.length,
        passed: count('pass'),
        failed: count('fail'),
        errors: count('error'),
        results,
      };
      repo.insert(run);
      repo.prune(collectionId, MAX_RUNS_PER_COLLECTION);
      return run;
    },

    list: (): RunSummary[] => repo.list(RUN_LIST_LIMIT),

    get(id: string): Run {
      const run = repo.get(id);
      if (!run) throw new AppError('NOT_FOUND', 'Run not found.', 404);
      return run;
    },

    remove(id: string): void {
      if (!repo.remove(id)) throw new AppError('NOT_FOUND', 'Run not found.', 404);
    },
  };
}

export type RunService = ReturnType<typeof createRunService>;
