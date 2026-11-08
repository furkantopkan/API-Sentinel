import type { Environment } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { errorMessageOf } from '../../collections/hooks/useCollections';
import { initialRequestDraft } from '../../request-builder/state/requestDraftReducer';
import { validateDraft } from '../../request-builder/lib/validateDraft';
import { NO_VARIABLES, editorVariablesFor } from './variableLookups';
import { toRows, toVariableInputs, withSecretFlag, type VariableRow } from './variableRows';

const environment: Environment = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Local',
  createdAt: '',
  updatedAt: '',
  variables: [
    {
      id: 'a',
      key: 'baseUrl',
      value: 'http://x.io',
      isSecret: false,
      enabled: true,
      hasValue: true,
    },
    { id: 'b', key: 'token', value: '', isSecret: true, enabled: true, hasValue: true },
    { id: 'c', key: 'off', value: 'v', isSecret: false, enabled: false, hasValue: true },
  ],
};

describe('editorVariablesFor', () => {
  const { display, validate } = editorVariablesFor(environment);

  it('returns plain values', () => {
    expect(display('baseUrl')).toBe('http://x.io');
    expect(validate('baseUrl')).toBe('http://x.io');
  });

  it('never shows a real secret: *** in the preview, a neutral stand-in for validation', () => {
    expect(display('token')).toBe('***');
    expect(validate('token')).toBe('0');
  });

  it('treats disabled and unknown variables as undefined', () => {
    expect(display('off')).toBeUndefined();
    expect(validate('nope')).toBeUndefined();
  });

  it('has no variables without an environment', () => {
    expect(editorVariablesFor(undefined)).toBe(NO_VARIABLES);
  });
});

describe('variable rows', () => {
  const row = (overrides: Partial<VariableRow>): VariableRow => ({
    rowId: 'r',
    key: 'k',
    value: 'v',
    isSecret: false,
    enabled: true,
    hasStoredSecret: false,
    ...overrides,
  });

  it('marks stored secrets when loading', () => {
    expect(toRows(environment).map((r) => r.hasStoredSecret)).toEqual([false, true, false]);
    expect(toRows(undefined)).toEqual([]);
  });

  // No "value" key means "keep what is stored" on the server.
  it('omits the value of a blank secret', () => {
    expect(toVariableInputs([row({ id: 'x', isSecret: true, value: '' })])[0]).not.toHaveProperty(
      'value',
    );
  });

  it('sends a typed secret, and blank normal values', () => {
    expect(toVariableInputs([row({ isSecret: true, value: 'new' })])[0]?.value).toBe('new');
    expect(toVariableInputs([row({ value: '' })])[0]?.value).toBe('');
  });

  it('skips rows without a name and trims names', () => {
    expect(toVariableInputs([row({ key: '   ' }), row({ key: ' a ' })]).map((v) => v.key)).toEqual([
      'a',
    ]);
  });

  it('forgets the stored secret when the flag is removed', () => {
    expect(withSecretFlag(row({ isSecret: true, hasStoredSecret: true }), false)).toMatchObject({
      isSecret: false,
      hasStoredSecret: false,
    });
  });
});

describe('validateDraft with variables', () => {
  it('reports unknown variables instead of a misleading URL error', () => {
    const result = validateDraft({ ...initialRequestDraft, url: '{{baseUrl}}/x' }, ['baseUrl']);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.field)).toEqual(['variables']);
    expect(!result.ok && result.errors[0]?.message).toContain('{{baseUrl}}');
  });
});

describe('errorMessageOf', () => {
  it('prefers the first validation issue over the generic message', () => {
    expect(
      errorMessageOf({
        code: 'VALIDATION_ERROR',
        message: 'Request body is invalid.',
        details: { issues: [{ path: 'variables.1.key', message: 'Duplicate variable "a".' }] },
      }),
    ).toBe('Duplicate variable "a".');
  });

  it('falls back to the message when there are no issues', () => {
    expect(errorMessageOf({ code: 'NOT_FOUND', message: 'Gone.' })).toBe('Gone.');
    expect(errorMessageOf({ code: 'NOT_FOUND', message: 'Gone.', details: { issues: 'x' } })).toBe(
      'Gone.',
    );
  });
});
