import type { SuggestedAssertion } from '@api-sentinel/shared';
import { Button } from '../../../components/Button';
import { suggestionName } from '../lib/testCasesToMarkdown';

interface SuggestionListProps {
  suggestions: readonly SuggestedAssertion[];
  /**
   * Whether an identical assertion already exists. Derived from the assertion
   * list (not stored here), so it survives tab switches and turns back to
   * "Add" when the user deletes the assertion.
   */
  isAdded: (suggestion: SuggestedAssertion) => boolean;
  /** Adds the suggestion to the request's assertions. Nothing is added without a click. */
  onAdd: (suggestion: SuggestedAssertion) => void;
}

export function SuggestionList({ suggestions, isAdded, onAdd }: SuggestionListProps) {
  if (suggestions.length === 0) return null;
  const pending = suggestions.filter((s) => !isAdded(s));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Suggested assertions</span>
        {suggestions.length > 1 && pending.length > 0 && (
          <Button onClick={() => pending.forEach(onAdd)}>Add all</Button>
        )}
      </div>
      <ul className="space-y-1">
        {suggestions.map((suggestion, index) => {
          const added = isAdded(suggestion);
          const name = suggestionName(suggestion);
          return (
            <li key={index} className="flex items-center justify-between gap-2 text-xs">
              <code className="font-mono break-all text-slate-700">{name}</code>
              <Button
                onClick={() => onAdd(suggestion)}
                disabled={added}
                aria-label={`Add assertion: ${name}`}
              >
                {added ? 'Added ✓' : 'Add'}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
