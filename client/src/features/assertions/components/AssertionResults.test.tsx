// @vitest-environment jsdom
import type { AssertionResult } from '@api-sentinel/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeResults } from '../lib/summarizeResults';
import { AssertionResults } from './AssertionResults';

afterEach(cleanup);

const result = (id: string, outcome: AssertionResult['outcome']): AssertionResult => ({
  assertionId: id,
  name: `check ${id}`,
  outcome,
  expected: 'E',
  actual: 'A',
  message: `message ${id}`,
});

describe('summarizeResults', () => {
  it('counts each outcome', () => {
    expect(
      summarizeResults([
        result('1', 'pass'),
        result('2', 'fail'),
        result('3', 'error'),
        result('4', 'pass'),
      ]),
    ).toEqual({ total: 4, passed: 2, failed: 1, errors: 1 });
  });
});

describe('AssertionResults', () => {
  it('shows a hint when there are no enabled assertions', () => {
    render(<AssertionResults results={[]} />);

    expect(screen.getByText(/No enabled assertions/)).toBeTruthy();
  });

  it('shows the summary and one row per result with expected and actual', () => {
    render(
      <AssertionResults
        results={[result('1', 'pass'), result('2', 'fail'), result('3', 'error')]}
      />,
    );

    expect(screen.getByLabelText('Assertion summary').textContent).toBe(
      '1 of 3 passed · 1 failed · 1 invalid',
    );
    const rows = within(screen.getByRole('table', { name: 'Assertion results' })).getAllByRole(
      'row',
    );
    expect(rows).toHaveLength(4); // header + 3
    expect(rows[2]?.textContent).toContain('FAIL');
    expect(rows[2]?.textContent).toContain('message 2');
  });

  it('omits zero counts when everything passed', () => {
    render(<AssertionResults results={[result('1', 'pass')]} />);

    expect(screen.getByLabelText('Assertion summary').textContent).toBe('1 of 1 passed');
  });
});
