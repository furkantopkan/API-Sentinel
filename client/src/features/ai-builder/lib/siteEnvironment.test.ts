import type { CollectionDraft, EnvironmentVariable } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { mergeIntoEnvironment, siteEnvironmentName } from './siteEnvironment';

const step = (url: string, extra: Partial<CollectionDraft['steps'][number]> = {}) => ({
  sourceIndex: 0,
  name: 'Step',
  method: 'GET' as const,
  url,
  headers: [],
  body: '',
  assertions: [],
  captures: [],
  ...extra,
});

const draft = (
  variables: CollectionDraft['variables'],
  steps = [step('{{baseUrl}}/cart')],
): CollectionDraft => ({ collectionName: 'Flow', steps, variables, notes: [] });

const stored = (key: string, value: string, isSecret = false): EnvironmentVariable => ({
  id: `00000000-0000-4000-8000-00000000000${key.length}`,
  key,
  value: isSecret ? '' : value,
  isSecret,
  enabled: true,
  hasValue: true,
});

describe('siteEnvironmentName', () => {
  it('names the environment after the site of baseUrl, without www', () => {
    expect(
      siteEnvironmentName(
        draft([{ key: 'baseUrl', value: 'https://www.hepsiburada.com', secret: false }]),
      ),
    ).toBe('hepsiburada.com');
  });

  it('uses the first full address when there is no baseUrl', () => {
    expect(siteEnvironmentName(draft([], [step('https://api.demoblaze.com/bycat')]))).toBe(
      'demoblaze.com',
    );
    expect(siteEnvironmentName(draft([], [step('{{x}}/a')]))).toBeNull();
  });
});

describe('mergeIntoEnvironment', () => {
  const BASE = { key: 'baseUrl', value: 'https://www.shop.test', secret: false };

  it('shares a variable with the same value and keeps stored secrets untouched', () => {
    const existing = [stored('baseUrl', 'https://www.shop.test'), stored('token', '', true)];
    const result = mergeIntoEnvironment(
      existing,
      draft([BASE, { key: 'token', value: '', secret: true }]),
    );
    expect(result.variables).toEqual([
      {
        id: existing[0]!.id,
        key: 'baseUrl',
        value: 'https://www.shop.test',
        isSecret: false,
        enabled: true,
      },
      // Sent without a value: the server keeps what the user filled in.
      { id: existing[1]!.id, key: 'token', isSecret: true, enabled: true },
    ]);
    expect(result.draft.steps[0]?.url).toBe('{{baseUrl}}/cart');
  });

  it('adds new variables', () => {
    const result = mergeIntoEnvironment([], draft([BASE]));
    expect(result.variables).toEqual([
      { key: 'baseUrl', value: 'https://www.shop.test', isSecret: false, enabled: true },
    ]);
  });

  it('gives a variable with another value a name of its own, everywhere in the draft', () => {
    const existing = [stored('productId', '7'), stored('productId_2', '8')];
    const result = mergeIntoEnvironment(
      existing,
      draft(
        [{ key: 'productId', value: '9', secret: false }],
        [
          step('https://shop.test/p/{{productId}}', {
            body: '{"id":"{{ productId }}"}',
            headers: [{ key: 'X-Product', value: '{{productId}}' }],
          }),
        ],
      ),
    );
    expect(result.variables.at(-1)).toEqual({
      key: 'productId_3',
      value: '9',
      isSecret: false,
      enabled: true,
    });
    const [first] = result.draft.steps;
    expect(first?.url).toBe('https://shop.test/p/{{productId_3}}');
    expect(first?.body).toBe('{"id":"{{productId_3}}"}');
    expect(first?.headers[0]?.value).toBe('{{productId_3}}');
  });
});
