import {
  ASSERTION_KINDS,
  ASSERTION_OPERATORS,
  JSON_TYPE_NAMES,
  MAX_ASSERTIONS,
  OPERATOR_LABELS,
  kindHasTarget,
  operatorNeedsExpected,
  type Assertion,
  type AssertionKind,
  type AssertionOperator,
  type AssertionResult,
} from '@api-sentinel/shared';
import type { AssertionPatch } from '../state/assertionsReducer';
import { OutcomeBadge } from './OutcomeBadge';

const KIND_LABELS: Record<AssertionKind, string> = {
  status: 'Status code',
  responseTime: 'Response time',
  header: 'Header',
  body: 'Body text',
  jsonPath: 'JSON path',
};

const TARGET_PLACEHOLDERS: Partial<Record<AssertionKind, string>> = {
  header: 'content-type',
  jsonPath: 'data.items[0].id',
};

const EXPECTED_PLACEHOLDERS: Record<AssertionKind, string> = {
  status: '200',
  responseTime: '1000 (ms)',
  header: 'application/json',
  body: 'text to find',
  jsonPath: '42, "text", true, null…',
};

const inputClass = 'rounded-md border border-slate-300 px-2 py-1 font-mono text-xs';

interface AssertionEditorProps {
  assertions: readonly Assertion[];
  /** Results of the latest response, or null if there is none yet. */
  results: readonly AssertionResult[] | null;
  onAdd: () => void;
  onUpdate: (id: string, patch: AssertionPatch) => void;
  onChangeKind: (id: string, kind: AssertionKind) => void;
  onRemove: (id: string) => void;
}

export function AssertionEditor({
  assertions,
  results,
  onAdd,
  onUpdate,
  onChangeKind,
  onRemove,
}: AssertionEditorProps) {
  const resultById = new Map(results?.map((result) => [result.assertionId, result]));

  return (
    <div className="space-y-2">
      {assertions.length === 0 ? (
        <p className="text-sm text-slate-400">
          No assertions yet. Add one, or pick a field in the response JSON tree and press “Add
          assertion”.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {assertions.map((assertion, index) => {
            const n = index + 1;
            const result = resultById.get(assertion.id);
            return (
              <li key={assertion.id} className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={assertion.enabled}
                    onChange={(event) => onUpdate(assertion.id, { enabled: event.target.checked })}
                    aria-label={`Enable assertion ${n}`}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <select
                    value={assertion.kind}
                    onChange={(event) =>
                      onChangeKind(assertion.id, event.target.value as AssertionKind)
                    }
                    aria-label={`Assertion ${n} kind`}
                    className={inputClass}
                  >
                    {ASSERTION_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  {kindHasTarget(assertion.kind) && (
                    <input
                      type="text"
                      value={assertion.target}
                      onChange={(event) => onUpdate(assertion.id, { target: event.target.value })}
                      placeholder={TARGET_PLACEHOLDERS[assertion.kind]}
                      aria-label={`Assertion ${n} ${assertion.kind === 'header' ? 'header name' : 'path'}`}
                      spellCheck={false}
                      className={`${inputClass} w-48`}
                    />
                  )}
                  <select
                    value={assertion.operator}
                    onChange={(event) =>
                      onUpdate(assertion.id, {
                        operator: event.target.value as AssertionOperator,
                      })
                    }
                    aria-label={`Assertion ${n} operator`}
                    className={inputClass}
                  >
                    {ASSERTION_OPERATORS[assertion.kind].map((operator) => (
                      <option key={operator} value={operator}>
                        {OPERATOR_LABELS[operator]}
                      </option>
                    ))}
                  </select>
                  {operatorNeedsExpected(assertion.operator) &&
                    (assertion.operator === 'isType' ? (
                      <select
                        value={assertion.expected}
                        onChange={(event) =>
                          onUpdate(assertion.id, { expected: event.target.value })
                        }
                        aria-label={`Assertion ${n} expected value`}
                        className={inputClass}
                      >
                        {!JSON_TYPE_NAMES.includes(
                          assertion.expected as (typeof JSON_TYPE_NAMES)[number],
                        ) && <option value={assertion.expected}>choose a type…</option>}
                        {JSON_TYPE_NAMES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={assertion.expected}
                        onChange={(event) =>
                          onUpdate(assertion.id, { expected: event.target.value })
                        }
                        placeholder={EXPECTED_PLACEHOLDERS[assertion.kind]}
                        aria-label={`Assertion ${n} expected value`}
                        spellCheck={false}
                        className={`${inputClass} min-w-32 flex-1`}
                      />
                    ))}
                  {/* Keeps the badge and ✕ right-aligned when there is no free-text field */}
                  {(!operatorNeedsExpected(assertion.operator) ||
                    assertion.operator === 'isType') && <span className="flex-1" />}
                  {result && <OutcomeBadge outcome={result.outcome} />}
                  <button
                    type="button"
                    onClick={() => onRemove(assertion.id)}
                    aria-label={`Remove assertion ${n}`}
                    className="rounded-md px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                {result && result.outcome !== 'pass' && (
                  <p className="ml-6 text-xs text-slate-500">{result.message}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={assertions.length >= MAX_ASSERTIONS}
          className="rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:text-slate-300"
        >
          + Add assertion
        </button>
        {assertions.length > 0 && (
          <span className="text-xs text-slate-400">
            {results === null
              ? 'Send the request to run the assertions.'
              : 'Results update live while you edit.'}
          </span>
        )}
      </div>
    </div>
  );
}
