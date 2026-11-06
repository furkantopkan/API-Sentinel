import type { AssertionResult } from '@api-sentinel/shared';

export interface ResultSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
}

export function summarizeResults(results: readonly AssertionResult[]): ResultSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.outcome === 'pass').length,
    failed: results.filter((r) => r.outcome === 'fail').length,
    errors: results.filter((r) => r.outcome === 'error').length,
  };
}
