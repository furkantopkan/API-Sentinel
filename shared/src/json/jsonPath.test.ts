import { describe, expect, it } from 'vitest';
import { formatJsonPath, parseJsonPath, resolveJsonPath, type PathSegment } from './jsonPath';

describe('formatJsonPath', () => {
  it.each<[PathSegment[], string]>([
    [[], ''],
    [['data'], 'data'],
    [['data', 'items', 0, 'id'], 'data.items[0].id'],
    [[0], '[0]'],
    [[0, 'name'], '[0].name'],
    [['first name'], '["first name"]'],
    [['user', 'e-mail'], 'user["e-mail"]'],
    [['a.b'], '["a.b"]'],
    [['1abc'], '["1abc"]'],
    [[''], '[""]'],
    [['quote"in'], '["quote\\"in"]'],
    [['_id', '$ref'], '_id.$ref'],
  ])('%j → %s', (segments, path) => {
    expect(formatJsonPath(segments)).toBe(path);
  });
});

describe('parseJsonPath', () => {
  it.each([
    '',
    'data',
    'data.items[0].id',
    '[0]',
    '[12][3]',
    '["first name"]',
    'user["e-mail"].x',
    '["quote\\"in"]',
    '["ünicode ğ"]',
  ])('round-trips %j', (path) => {
    const result = parseJsonPath(path);

    expect(result.ok).toBe(true);
    expect(result.ok && formatJsonPath(result.segments)).toBe(path);
  });

  it('parses into keys and numeric indexes', () => {
    expect(parseJsonPath('data.items[10].id')).toEqual({
      ok: true,
      segments: ['data', 'items', 10, 'id'],
    });
  });

  it.each([
    ['data.', 'Expected a property name after "."'],
    ['.data', 'Expected a property name'],
    ['data[', 'Expected an array index or a quoted key'],
    ['data[01]', 'Expected "]"'],
    ['data[-1]', 'Expected an array index or a quoted key'],
    ['data[0', 'Expected "]"'],
    ['data["x]', 'Unterminated quoted key'],
    ['data x', 'Unexpected character " "'],
    ["data['x']", 'Expected an array index or a quoted key'],
  ])('rejects %j', (path, message) => {
    const result = parseJsonPath(path);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});

describe('resolveJsonPath', () => {
  const data = { users: [{ name: 'Ada', tags: ['qa'] }], 'e-mail': null, zero: 0 };

  it.each<[PathSegment[], unknown]>([
    [[], data],
    [['users', 0, 'name'], 'Ada'],
    [['users', 0, 'tags', 0], 'qa'],
    [['e-mail'], null],
    [['zero'], 0],
  ])('finds %j', (segments, value) => {
    expect(resolveJsonPath(data, segments)).toEqual({ found: true, value });
  });

  it.each<PathSegment[][]>([
    [['missing']],
    [['users', 1]],
    [['users', 'name']], // key on an array
    [['zero', 'x']], // key on a number
    [['users', 0, 'name', 0]], // index on a string
    [['__proto__']],
    [['constructor']],
    [['users', 'length']],
  ])('does not find %j', (segments) => {
    expect(resolveJsonPath(data, segments)).toEqual({ found: false });
  });
});
