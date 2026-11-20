// @vitest-environment jsdom
import type { Collection } from '@api-sentinel/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionsSidebar } from './CollectionsSidebar';

afterEach(cleanup);

const COLLECTION: Collection = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Users API',
  environmentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  requests: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Get user',
      method: 'GET',
      url: 'https://x.io/u',
    },
  ],
};
const REQUEST_ID = COLLECTION.requests[0]!.id;
// jsdom has no layout, so adjacent spans are read without a space ("GETGet user").
const OPEN_REQUEST = /^GETs*Get user$/;

function setup(overrides: Partial<ComponentProps<typeof CollectionsSidebar>> = {}) {
  const done = () => vi.fn(() => Promise.resolve<string | null>(null));
  const props = {
    state: { status: 'ready' as const, collections: [COLLECTION] },
    activeRequestId: null,
    onCreate: done(),
    onRename: done(),
    onDelete: done(),
    onRun: vi.fn(),
    onOpenRequest: done(),
    onRenameRequest: done(),
    onDeleteRequest: done(),
    onNewRequest: vi.fn(),
    onBuildWithAi: vi.fn(),
    ...overrides,
  };
  render(<CollectionsSidebar {...props} />);
  return { props, user: userEvent.setup() };
}

describe('CollectionsSidebar', () => {
  it('CO-01: shows an empty state', () => {
    setup({ state: { status: 'ready', collections: [] } });

    expect(screen.getByText(/No collections yet/)).toBeTruthy();
  });

  it('shows loading and error states', () => {
    setup({ state: { status: 'loading' } });
    expect(screen.getByText('Loading…')).toBeTruthy();
    cleanup();

    setup({ state: { status: 'error', message: 'Backend down' } });
    expect(screen.getByRole('alert').textContent).toBe('Backend down');
  });

  it('creates a collection with a trimmed name', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: '+ New' }));
    await user.type(screen.getByLabelText('New collection name'), '  Orders {Enter}');

    expect(props.onCreate).toHaveBeenCalledWith('Orders');
  });

  it('CO-15: does not allow an empty name', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: '+ New' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'OK' }).disabled).toBe(true);
  });

  it('opens a saved request and marks the active one', async () => {
    const { props, user } = setup({ activeRequestId: REQUEST_ID });
    const open = screen.getByRole('button', { name: OPEN_REQUEST });

    await user.click(open);

    expect(props.onOpenRequest).toHaveBeenCalledWith(REQUEST_ID);
    expect(open.getAttribute('aria-current')).toBe('true');
  });

  it('renames a saved request in place, starting from its current name', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Rename request Get user' }));
    const input = screen.getByLabelText<HTMLInputElement>('Rename request Get user');
    expect(input.value).toBe('Get user');
    await user.clear(input);
    await user.type(input, 'Fetch user{Enter}');

    expect(props.onRenameRequest).toHaveBeenCalledWith(REQUEST_ID, 'Fetch user');
  });

  it('cancels a rename with Escape', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Rename request Get user' }));
    await user.keyboard('{Escape}');

    expect(props.onRenameRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: OPEN_REQUEST })).toBeTruthy();
  });

  it('renames and deletes collections', async () => {
    const { props, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Delete collection Users API' }));
    expect(props.onDelete).toHaveBeenCalledWith(COLLECTION);

    await user.click(screen.getByRole('button', { name: 'Rename collection Users API' }));
    await user.type(screen.getByLabelText('Rename collection Users API'), ' v2{Enter}');
    expect(props.onRename).toHaveBeenCalledWith(COLLECTION.id, 'Users API v2');
  });

  it('collapses a collection', async () => {
    const { user } = setup();
    const item = within(screen.getByRole('listitem', { name: 'Collection Users API' }));

    await user.click(item.getByRole('button', { name: /^▾s*Users API/ }));

    expect(item.queryByRole('button', { name: OPEN_REQUEST })).toBeNull();
  });

  it('shows the error message of a failed action', async () => {
    const { user } = setup({
      onOpenRequest: vi.fn(() => Promise.resolve('Saved request not found.')),
    });

    await user.click(screen.getByRole('button', { name: OPEN_REQUEST }));

    expect((await screen.findByRole('alert')).textContent).toBe('Saved request not found.');
  });
});
