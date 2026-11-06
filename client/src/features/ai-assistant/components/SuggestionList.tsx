import type { SuggestedAssertion } from '@api-sentinel/shared';
import { useState } from 'react';
import { suggestionName } from '../lib/testCasesToMarkdown';

interface SuggestionListProps {
  suggestions: readonly SuggestedAssertion[];
  /** Adds the suggestion to the request's assertions. Nothing is added without a click. */
  onAdd: (suggestion: SuggestedAssertion) => void;
}

export function SuggestionList({ suggestions, onAdd }: SuggestionListProps) {
  const [added, setAdded] = useState<ReadonlySet<number>>(new Set());
  if (suggestions.length === 0) return null;

  const add = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion || added.has(index)) return;
    onAdd(suggestion);
    setAdded((prev) => new Set(prev).add(index));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Suggested assertions</span>
        {suggestions.length > 1 && added.size < suggestions.length && (
          <button
            type="button"
            onClick={() => suggestions.forEach((_, i) => add(i))}
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            Add all
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {suggestions.map((suggestion, index) => (
          <li key={index} className="flex items-center justify-between gap-2 text-xs">
            <code className="font-mono break-all text-slate-700">{suggestionName(suggestion)}</code>
            <button
              type="button"
              onClick={() => add(index)}
              disabled={added.has(index)}
              aria-label={`Add assertion: ${suggestionName(suggestion)}`}
              className="shrink-0 rounded-md border border-indigo-200 px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400"
            >
              {added.has(index) ? 'Added ✓' : 'Add'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
