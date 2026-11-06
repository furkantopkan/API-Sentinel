// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  // Colour communicates the status class at a glance; boundaries 199/200, 299/300, ...
  it.each([
    [199, 'bg-slate-100'],
    [200, 'bg-emerald-100'],
    [299, 'bg-emerald-100'],
    [302, 'bg-sky-100'],
    [400, 'bg-amber-100'],
    [404, 'bg-amber-100'],
    [499, 'bg-amber-100'],
    [500, 'bg-red-100'],
    [503, 'bg-red-100'],
  ])('status %i uses %s', (status, colorClass) => {
    render(<StatusBadge status={status} statusText="X" />);

    expect(screen.getByTestId('response-status').className).toContain(colorClass);
  });

  it('shows the code and the status text', () => {
    render(<StatusBadge status={404} statusText="Not Found" />);

    expect(screen.getByTestId('response-status').textContent).toBe('404 Not Found');
  });
});
