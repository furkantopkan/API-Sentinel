import { assertionName, type SuggestedAssertion, type TestCase } from '@api-sentinel/shared';

/** Readable name for a suggested assertion, using the engine's own wording. */
export function suggestionName(suggestion: SuggestedAssertion): string {
  // assertionName only reads kind, target, operator and expected.
  return assertionName({ ...suggestion, id: '', enabled: true } as Parameters<
    typeof assertionName
  >[0]);
}

/** Exports test cases as Markdown, e.g. to paste into a test management tool or ticket. */
export function testCasesToMarkdown(testCases: readonly TestCase[], endpoint: string): string {
  const lines = [`# Test cases: ${endpoint}`, ''];
  testCases.forEach((testCase, index) => {
    lines.push(`## ${index + 1}. ${testCase.title}`);
    lines.push(`**Category:** ${testCase.category} · **Priority:** ${testCase.priority}`, '');
    if (testCase.description) lines.push(testCase.description, '');
    lines.push('**Steps**');
    testCase.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push('', `**Expected result:** ${testCase.expectedResult}`);
    if (testCase.assertions.length > 0) {
      lines.push('', '**Assertions**');
      testCase.assertions.forEach((a) => lines.push(`- ${suggestionName(a)}`));
    }
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}
