// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonTreeView, PAGE_SIZE } from './JsonTreeView';

afterEach(cleanup);

const data = {
  data: { items: [{ id: 1, name: 'Keyboard' }], total: 1 },
  meta: { 'first name': 'Ada' },
};

/** The clickable row (key, value, type badge) of a tree item. */
function selectButton(name: string) {
  const item = screen.getAllByRole('treeitem', { name })[0]!;
  return within(item).getAllByRole('button', { name: new RegExp(`^"?${name}"?`) })[0]!;
}

function details() {
  return within(screen.getByLabelText('Selected field'));
}

describe('JsonTreeView', () => {
  it('opens the root and its children, but not deeper levels', () => {
    render(<JsonTreeView data={data} />);

    expect(screen.getByRole('treeitem', { name: 'data' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'items' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(screen.queryByRole('treeitem', { name: 'id' })).toBeNull(); // not rendered at all
  });

  it('shows a type badge next to each value', () => {
    render(<JsonTreeView data={{ n: 1, s: 'x', b: true, z: null }} />);

    for (const [name, type] of [
      ['n', 'number'],
      ['s', 'string'],
      ['b', 'boolean'],
      ['z', 'null'],
    ]) {
      const item = within(screen.getByRole('treeitem', { name }));
      expect(item.getByTestId('type-badge').textContent).toBe(type);
    }
  });

  it('expands and collapses a node', async () => {
    const user = userEvent.setup();
    render(<JsonTreeView data={data} />);

    await user.click(screen.getByRole('button', { name: 'Expand "items"' }));
    expect(screen.getByRole('treeitem', { name: '0' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Collapse "items"' }));
    expect(screen.queryByRole('treeitem', { name: '0' })).toBeNull();
  });

  it('Expand all opens every level; Collapse all keeps only the root open', async () => {
    const user = userEvent.setup();
    render(<JsonTreeView data={data} />);

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('treeitem', { name: 'name' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.getByRole('treeitem', { name: 'root' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'data' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('shows path, type and size of the selected field and copies the path', async () => {
    const user = userEvent.setup(); // also installs a clipboard stub
    render(<JsonTreeView data={data} />);

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    await user.click(selectButton('name'));

    expect(details().getByText('data.items[0].name')).toBeTruthy();
    expect(details().getByText('string')).toBeTruthy();
    expect(details().getByText('Size 8 characters')).toBeTruthy();

    await user.click(details().getByRole('button', { name: 'Copy path' }));
    expect(await navigator.clipboard.readText()).toBe('data.items[0].name');
  });

  it('quotes keys that are not identifiers', async () => {
    const user = userEvent.setup();
    render(<JsonTreeView data={data} />);

    await user.click(selectButton('first name'));

    expect(details().getByText('meta["first name"]')).toBeTruthy();
  });

  it('copies the value of a container as indented JSON', async () => {
    const user = userEvent.setup();
    render(<JsonTreeView data={data} />);

    await user.click(selectButton('meta'));
    await user.click(details().getByRole('button', { name: 'Copy value' }));

    expect(await navigator.clipboard.readText()).toBe('{\n  "first name": "Ada"\n}');
  });

  it('renders big arrays one page at a time', async () => {
    const user = userEvent.setup();
    const big = Array.from({ length: 250 }, (_, i) => i);
    render(<JsonTreeView data={big} />);

    expect(screen.getAllByRole('treeitem')).toHaveLength(1 + PAGE_SIZE); // root + first page
    await user.click(screen.getByRole('button', { name: 'Show more (150 remaining)' }));
    expect(screen.getAllByRole('treeitem')).toHaveLength(1 + 2 * PAGE_SIZE);
    await user.click(screen.getByRole('button', { name: 'Show more (50 remaining)' }));
    expect(screen.getAllByRole('treeitem')).toHaveLength(1 + 250);
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
  });

  it('flags integers that lost precision', async () => {
    const user = userEvent.setup();
    render(<JsonTreeView data={{ id: 2 ** 60 }} />);

    expect(screen.getByText('⚠ precision')).toBeTruthy();
    await user.click(selectButton('id'));
    expect(details().getByText(/larger than 2\^53/)).toBeTruthy();
  });

  it('renders HTML in values as text', () => {
    render(<JsonTreeView data={{ html: '<img src=x onerror=alert(1)>' }} />);

    expect(screen.getByText('"<img src=x onerror=alert(1)>"')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
