import { TEST_CASE_CATEGORIES, type SuggestedAssertion, type TestCase } from '@api-sentinel/shared';
import { useState } from 'react';
import { SuggestionList } from './SuggestionList';

const PRIORITY_STYLES: Record<TestCase['priority'], string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const field = 'w-full rounded-md border border-slate-300 px-2 py-1 text-xs';

interface TestCaseCardProps {
  index: number;
  testCase: TestCase;
  onChange: (testCase: TestCase) => void;
  onRemove: () => void;
  onAddAssertion: (suggestion: SuggestedAssertion) => void;
}

/** One generated test case. "Edit" turns the text into form fields (FR-05: editable). */
export function TestCaseCard({
  index,
  testCase,
  onChange,
  onRemove,
  onAddAssertion,
}: TestCaseCardProps) {
  const [editing, setEditing] = useState(false);
  const n = index + 1;

  return (
    <article
      aria-label={`Test case ${n}`}
      className="space-y-2 rounded-md border border-slate-200 p-3 text-sm"
    >
      <header className="flex flex-wrap items-start gap-2">
        <span className="font-mono text-xs text-slate-400">{n}.</span>
        {editing ? (
          <input
            aria-label={`Test case ${n} title`}
            value={testCase.title}
            onChange={(e) => onChange({ ...testCase, title: e.target.value })}
            className={`${field} flex-1 font-medium`}
          />
        ) : (
          <h3 className="flex-1 font-medium text-slate-800">{testCase.title}</h3>
        )}
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">
          {testCase.category}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${PRIORITY_STYLES[testCase.priority]}`}>
          {testCase.priority}
        </span>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove test case ${n}`}
          className="text-xs text-slate-400 hover:text-red-600"
        >
          ✕
        </button>
      </header>

      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              aria-label={`Test case ${n} category`}
              value={testCase.category}
              onChange={(e) =>
                onChange({ ...testCase, category: e.target.value as TestCase['category'] })
              }
              className={`${field} w-auto`}
            >
              {TEST_CASE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label={`Test case ${n} priority`}
              value={testCase.priority}
              onChange={(e) =>
                onChange({ ...testCase, priority: e.target.value as TestCase['priority'] })
              }
              className={`${field} w-auto`}
            >
              {(['high', 'medium', 'low'] as const).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <textarea
            aria-label={`Test case ${n} description`}
            value={testCase.description}
            onChange={(e) => onChange({ ...testCase, description: e.target.value })}
            rows={2}
            className={field}
          />
          <label className="block text-xs text-slate-500">
            Steps (one per line)
            <textarea
              aria-label={`Test case ${n} steps`}
              value={testCase.steps.join('\n')}
              onChange={(e) => onChange({ ...testCase, steps: e.target.value.split('\n') })}
              rows={Math.max(3, testCase.steps.length)}
              className={`${field} mt-1`}
            />
          </label>
          <label className="block text-xs text-slate-500">
            Expected result
            <textarea
              aria-label={`Test case ${n} expected result`}
              value={testCase.expectedResult}
              onChange={(e) => onChange({ ...testCase, expectedResult: e.target.value })}
              rows={2}
              className={`${field} mt-1`}
            />
          </label>
        </div>
      ) : (
        <>
          {testCase.description && <p className="text-xs text-slate-600">{testCase.description}</p>}
          <ol className="list-decimal space-y-0.5 pl-5 text-xs text-slate-700">
            {testCase.steps
              .filter((step) => step.trim() !== '')
              .map((step, i) => (
                <li key={i}>{step}</li>
              ))}
          </ol>
          <p className="text-xs text-slate-700">
            <span className="font-medium">Expected:</span> {testCase.expectedResult}
          </p>
        </>
      )}

      <SuggestionList suggestions={testCase.assertions} onAdd={onAddAssertion} />
    </article>
  );
}
