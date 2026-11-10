// @vitest-environment jsdom
import type { HttpMethod } from '@api-sentinel/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BodyEditor } from './BodyEditor';

afterEach(cleanup);

function Harness({ initial = '', method = 'POST' as HttpMethod, form = false }) {
  const [body, setBody] = useState(initial);
  return <BodyEditor body={body} method={method} form={form} onChange={setBody} />;
}

const textarea = () => screen.getByLabelText<HTMLTextAreaElement>('Request body');
const formatButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Format' });

describe('BodyEditor', () => {
  it('accepts an empty body without an error; Format is disabled', () => {
    render(<Harness />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(textarea().getAttribute('aria-invalid')).toBe('false');
    expect(formatButton().disabled).toBe(true);
  });

  it('shows the error location for invalid JSON', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // user-event treats "{" as a special key; "{{" types a literal brace.
    await user.type(textarea(), '{{"a":1,}');

    expect(screen.getByRole('alert').textContent).toMatch(/Invalid JSON at line 1, column \d+/);
    expect(textarea().getAttribute('aria-invalid')).toBe('true');
    expect(formatButton().disabled).toBe(true);
  });

  it('formats valid JSON with indentation', async () => {
    const user = userEvent.setup();
    render(<Harness initial='{"a":1,"b":[1,2]}' />);

    await user.click(formatButton());

    expect(textarea().value).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it('warns that GET bodies are often ignored', () => {
    render(<Harness method="GET" initial='{"a":1}' />);

    expect(screen.getByText('Many servers ignore the body of GET requests.')).toBeTruthy();
  });

  it('does not warn for POST', () => {
    render(<Harness method="POST" initial='{"a":1}' />);

    expect(screen.queryByText(/ignore the body/)).toBeNull();
  });

  it('treats the body as a form when the header says so: no JSON error, no Format', async () => {
    const user = userEvent.setup();
    render(<Harness form />);
    await user.type(textarea(), 'product_id=7&note=a+b');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Form body (x-www-form-urlencoded)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Format' })).toBeNull();
  });
});
