import { expect, test, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

// The e2e backend runs with AI_MODE=mock (see playwright.config.ts): fixed answers,
// no API key, no network, no cost.

const MOCK = `http://localhost:${MOCK_PORT}`;
const responseTab = (page: Page, name: string | RegExp) =>
  page.getByRole('tablist', { name: 'Response sections' }).getByRole('tab', { name });

async function sendAndOpenAi(page: Page, url = `${MOCK}/nested`) {
  await page.goto('/');
  await page.getByLabel('Request URL').fill(url);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('response-status')).toBeVisible();
  await responseTab(page, 'AI').click();
}

test('AI-01…03: generate test cases in mock mode, invalid suggestion removed', async ({ page }) => {
  await sendAndOpenAi(page);
  await expect(page.getByText(/AI output is a suggestion/)).toContainText('Mock mode');

  await page.getByRole('button', { name: 'Generate test cases' }).click();

  await expect(page.getByText('Test cases (5)')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Test case 1' })).toContainText('positive');
  await expect(
    page.getByText(/1 invalid suggested assertion\(s\) removed by the server/),
  ).toBeVisible();
});

// Regression: results were lost when switching to another response tab (user report, Phase 5).
test('AI results survive tab switches; a new Send keeps test cases but hides the analysis', async ({
  page,
}) => {
  await sendAndOpenAi(page);
  await page.getByRole('button', { name: 'Generate test cases' }).click();
  await page.getByRole('button', { name: 'Analyze response' }).click();
  await expect(page.getByRole('region', { name: 'Response analysis' })).toBeVisible();

  await responseTab(page, /Tests/).click();
  await responseTab(page, 'Body').click();
  await responseTab(page, 'AI').click();
  await expect(page.getByText('Test cases (5)')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Response analysis' })).toBeVisible();

  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('response-status')).toBeVisible();
  await responseTab(page, 'AI').click();
  await expect(page.getByText('Test cases (5)')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Response analysis' })).toHaveCount(0);
});

test('AI-04, 05: adding suggestions creates assertions; "Added" follows the assertion list', async ({
  page,
}) => {
  await sendAndOpenAi(page);
  await page.getByRole('button', { name: 'Generate test cases' }).click();
  const first = page.getByRole('article', { name: 'Test case 1' });

  await first.getByRole('button', { name: 'Add assertion: Status code equals 200' }).click();
  await expect(
    first.getByRole('button', { name: 'Add assertion: Status code equals 200' }),
  ).toHaveText('Added ✓');
  await expect(responseTab(page, 'Tests 1/1')).toBeVisible();

  // Card 2 has a single suggestion (status 401), so it has "Add" but no "Add all".
  await page
    .getByRole('article', { name: 'Test case 2' })
    .getByRole('button', { name: 'Add assertion: Status code equals 401' })
    .click();
  await expect(responseTab(page, 'Tests 1/2')).toBeVisible(); // expects 401, the response is 200

  // Removing the assertion turns the button back into "Add".
  await page
    .getByRole('tablist', { name: 'Request sections' })
    .getByRole('tab', { name: /Assertions/ })
    .click();
  await page.getByRole('button', { name: 'Remove assertion 1' }).click();
  await expect(
    first.getByRole('button', { name: 'Add assertion: Status code equals 200' }),
  ).toHaveText('Add');
});

test('AI-06…08: edit, remove and export test cases', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await sendAndOpenAi(page);
  await page.getByRole('button', { name: 'Generate test cases' }).click();

  const second = page.getByRole('article', { name: 'Test case 2' });
  await second.getByRole('button', { name: 'Edit' }).click();
  await second.getByLabel('Test case 2 title').fill('Edited title');
  await second.getByRole('button', { name: 'Done' }).click();
  await expect(second.getByRole('heading', { name: 'Edited title' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove test case 3' }).click();
  await expect(page.getByText('Test cases (4)')).toBeVisible();

  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toContain(`# Test cases: GET ${MOCK}/nested`);
  expect(markdown).toContain('## 2. Edited title');
  expect(markdown).not.toContain('Unknown resource returns 404'); // the removed case
});

test('AI-09, 10: analysis with observations and suggested assertions', async ({ page }) => {
  await sendAndOpenAi(page);
  await page.getByRole('button', { name: 'Analyze response' }).click();
  const analysis = page.getByRole('region', { name: 'Response analysis' });

  // Shown upper-case by CSS; the text itself is "warning".
  await expect(analysis).toContainText('warning · No Cache-Control header');
  await analysis.getByRole('button', { name: 'Add all' }).click();
  await expect(responseTab(page, 'Tests 3/3')).toBeVisible();
});
