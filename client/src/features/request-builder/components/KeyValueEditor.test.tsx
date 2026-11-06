// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueRow } from '../types';
import { KeyValueEditor } from './KeyValueEditor';

// Component tests find elements the way a user does (by role and label),
// not by CSS classes, so styling changes do not break them.

afterEach(cleanup);

/** Wraps the controlled editor with real state, like the app does. */
function Harness({ initial = [] as KeyValueRow[] }) {
  const [rows, setRows] = useState<KeyValueRow[]>(initial);
  return (
    <KeyValueEditor
      rows={rows}
      itemName="header"
      keyPlaceholder="Key"
      valuePlaceholder="Value"
      onAdd={() =>
        setRows((r) => [...r, { id: `id${r.length}`, key: '', value: '', enabled: true }])
      }
      onUpdate={(id, patch) =>
        setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)))
      }
      onRemove={(id) => setRows((r) => r.filter((row) => row.id !== id))}
    />
  );
}

describe('KeyValueEditor', () => {
  it('shows an empty-state text when there are no rows', () => {
    render(<Harness />);

    expect(screen.getByText('No headers yet.')).toBeTruthy();
  });

  it('adds an enabled row and lets the user type key and value', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add header' }));
    await user.type(screen.getByLabelText('header 1 key'), 'X-Trace');
    await user.type(screen.getByLabelText('header 1 value'), '123');

    expect(screen.getByLabelText<HTMLInputElement>('header 1 key').value).toBe('X-Trace');
    expect(screen.getByLabelText<HTMLInputElement>('header 1 value').value).toBe('123');
    expect(screen.getByLabelText<HTMLInputElement>('Enable header 1').checked).toBe(true);
  });

  it('disables a row via its checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ id: 'a', key: 'k', value: 'v', enabled: true }]} />);

    await user.click(screen.getByLabelText('Enable header 1'));

    expect(screen.getByLabelText<HTMLInputElement>('Enable header 1').checked).toBe(false);
  });

  it('removes only the chosen row', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { id: 'a', key: 'first', value: '', enabled: true },
          { id: 'b', key: 'second', value: '', enabled: true },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove header 1' }));

    expect(screen.getByLabelText<HTMLInputElement>('header 1 key').value).toBe('second');
    expect(screen.queryByLabelText('header 2 key')).toBeNull();
  });

  it('reports changes through callbacks with the row id (controlled component)', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <KeyValueEditor
        rows={[{ id: 'row-7', key: '', value: '', enabled: true }]}
        itemName="param"
        keyPlaceholder="Key"
        valuePlaceholder="Value"
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('param 1 key'), 'q');

    expect(onUpdate).toHaveBeenCalledWith('row-7', { key: 'q' });
  });
});
