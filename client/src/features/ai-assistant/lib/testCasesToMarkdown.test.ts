import type { TestCase } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { suggestionName, testCasesToMarkdown } from './testCasesToMarkdown';

const testCase: TestCase = {
  title: 'Missing token is rejected',
  category: 'security',
  priority: 'high',
  description: 'Without credentials no data is returned.',
  steps: ['Remove the Authorization header.', 'Send the request.'],
  expectedResult: '401 Unauthorized.',
  assertions: [{ kind: 'status', target: '', operator: 'equals', expected: '401' }],
};

describe('suggestionName', () => {
  it('uses the assertion engine wording', () => {
    expect(
      suggestionName({
        kind: 'jsonPath',
        target: 'data.id',
        operator: 'isType',
        expected: 'number',
      }),
    ).toBe('data.id is of type number');
  });
});

describe('testCasesToMarkdown', () => {
  it('renders title, metadata, steps, expected result and assertions', () => {
    expect(testCasesToMarkdown([testCase], 'GET https://x.io/me')).toBe(
      [
        '# Test cases: GET https://x.io/me',
        '',
        '## 1. Missing token is rejected',
        '**Category:** security · **Priority:** high',
        '',
        'Without credentials no data is returned.',
        '',
        '**Steps**',
        '1. Remove the Authorization header.',
        '2. Send the request.',
        '',
        '**Expected result:** 401 Unauthorized.',
        '',
        '**Assertions**',
        '- Status code equals 401',
        '',
      ].join('\n'),
    );
  });

  it('numbers cases in order and leaves out empty sections', () => {
    const markdown = testCasesToMarkdown(
      [testCase, { ...testCase, title: 'Second', description: '', assertions: [] }],
      'GET /',
    );

    expect(markdown).toContain('## 2. Second');
    expect(markdown.split('**Assertions**')).toHaveLength(2); // only the first case has assertions
  });
});
