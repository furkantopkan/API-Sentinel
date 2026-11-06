// @vitest-environment jsdom
import type { SuggestedAssertion } from '@api-sentinel/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../../../components/Button';
import { SuggestionList } from './SuggestionList';

afterEach(cleanup);

const SUGGESTIONS: SuggestedAssertion[] = [
  { kind: 'status', target: '', operator: 'equals', expected: '200' },
  { kind: 'header', target: 'content-type', operator: 'contains', expected: 'json' },
];

const same = (a: SuggestedAssertion, b: SuggestedAssertion) =>
  a.kind === b.kind &&
  a.target === b.target &&
  a.operator === b.operator &&
  a.expected === b.expected;

/** The "added" list lives outside, like the assertion list in App. */
function Harness({ initial = [] as SuggestedAssertion[] }) {
  const [added, setAdded] = useState(initial);
  return (
    <>
      <SuggestionList
        suggestions={SUGGESTIONS}
        isAdded={(s) => added.some((a) => same(a, s))}
        onAdd={(s) => setAdded((list) => [...list, s])}
      />
      <output aria-label="added count">{added.length}</output>
      <button type="button" onClick={() => setAdded([])}>
        clear
      </button>
    </>
  );
}

const addButton = (name: string) => screen.getByRole('button', { name: `Add assertion: ${name}` });

describe('SuggestionList', () => {
  it('adds one suggestion and marks it as added', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(addButton('Status code equals 200'));

    expect(addButton('Status code equals 200').textContent).toBe('Added ✓');
    expect(addButton('Status code equals 200')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('added count').textContent).toBe('1');
  });

  it('"Add all" adds only the suggestions that are not added yet', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[SUGGESTIONS[0]!]} />);

    await user.click(screen.getByRole('button', { name: 'Add all' }));

    expect(screen.getByLabelText('added count').textContent).toBe('2');
    expect(screen.queryByRole('button', { name: 'Add all' })).toBeNull();
  });

  // "Added" is derived from the outside list, so it can never get out of sync.
  it('shows "Add" again when the assertion is removed elsewhere', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[SUGGESTIONS[0]!]} />);

    await user.click(screen.getByRole('button', { name: 'clear' }));

    expect(addButton('Status code equals 200').textContent).toBe('Add');
  });
});

describe('Button', () => {
  // A plain <button> inside a <form> submits it; ours must not.
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Click</Button>);

    expect(screen.getByRole('button', { name: 'Click' }).getAttribute('type')).toBe('button');
  });
});
