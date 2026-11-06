// @vitest-environment jsdom
import { evaluateAssertions, type ExecutedResponse } from '@api-sentinel/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { assertionsReducer, newAssertion } from '../state/assertionsReducer';
import { AssertionEditor } from './AssertionEditor';

afterEach(cleanup);

const RESPONSE: ExecutedResponse = {
  status: 200,
  statusText: 'OK',
  headers: [['content-type', 'application/json']],
  body: { kind: 'json', text: '{"data":{"total":2,"next":null}}' },
  sizeBytes: 33,
  durationMs: 10,
  finalUrl: 'http://example.com/',
  redirects: [],
};

/** Real reducer + real engine, like App wires them. */
function Harness({ response = RESPONSE as ExecutedResponse | null }) {
  const [assertions, dispatch] = useReducer(assertionsReducer, []);
  let id = assertions.length;
  return (
    <AssertionEditor
      assertions={assertions}
      results={response ? evaluateAssertions(assertions, response) : null}
      onAdd={() => dispatch({ type: 'add', assertion: newAssertion(`a${++id}`) })}
      onUpdate={(assertionId, patch) => dispatch({ type: 'update', id: assertionId, patch })}
      onChangeKind={(assertionId, kind) => dispatch({ type: 'changeKind', id: assertionId, kind })}
      onRemove={(assertionId) => dispatch({ type: 'remove', id: assertionId })}
    />
  );
}

const outcomes = () => screen.queryAllByTestId('assertion-outcome').map((el) => el.textContent);

describe('AssertionEditor', () => {
  it('shows no results and a hint before the first response', async () => {
    const user = userEvent.setup();
    render(<Harness response={null} />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));

    expect(outcomes()).toEqual([]);
    expect(screen.getByText('Send the request to run the assertions.')).toBeTruthy();
  });

  it('updates PASS / FAIL / ERROR live while the expected value is edited', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    expect(outcomes()).toEqual(['PASS']); // default: status equals 200

    const expected = screen.getByLabelText('Assertion 1 expected value');
    await user.clear(expected);
    await user.type(expected, '201');
    expect(outcomes()).toEqual(['FAIL']);
    expect(screen.getByText('200 does not equal 201.')).toBeTruthy();

    await user.clear(expected);
    await user.type(expected, 'abc');
    expect(outcomes()).toEqual(['ERROR']);
  });

  it('shows a path field for JSON path and hides the expected field for "is null"', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    await user.selectOptions(screen.getByLabelText('Assertion 1 kind'), 'jsonPath');
    await user.type(screen.getByLabelText('Assertion 1 path'), 'data.next');
    await user.selectOptions(screen.getByLabelText('Assertion 1 operator'), 'isNull');

    expect(screen.queryByLabelText('Assertion 1 expected value')).toBeNull();
    expect(outcomes()).toEqual(['PASS']);
  });

  it('offers a type list for "is of type"', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    await user.selectOptions(screen.getByLabelText('Assertion 1 kind'), 'jsonPath');
    await user.type(screen.getByLabelText('Assertion 1 path'), 'data.total');
    await user.selectOptions(screen.getByLabelText('Assertion 1 operator'), 'isType');
    await user.selectOptions(screen.getByLabelText('Assertion 1 expected value'), 'number');

    expect(outcomes()).toEqual(['PASS']);
  });

  it('only lists operators that fit the kind', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    await user.selectOptions(screen.getByLabelText('Assertion 1 kind'), 'body');
    const options = Array.from(
      screen.getByLabelText<HTMLSelectElement>('Assertion 1 operator').options,
    ).map((option) => option.textContent);

    expect(options).toEqual(['contains', 'does not contain']);
  });

  it('a disabled assertion shows no result; removing deletes the row', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    await user.click(screen.getByRole('button', { name: '+ Add assertion' }));
    expect(outcomes()).toHaveLength(2);

    await user.click(screen.getByLabelText('Enable assertion 1'));
    expect(outcomes()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Remove assertion 2' }));
    expect(screen.queryByLabelText('Assertion 2 kind')).toBeNull();
    expect(outcomes()).toHaveLength(0);
  });
});
