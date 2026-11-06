import { expect, test, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

const MOCK = `http://localhost:${MOCK_PORT}`;

async function send(page: Page, url: string) {
  await page.goto('/');
  await page.getByLabel('Request URL').fill(url);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('response-status')).toBeVisible();
}

test('JSON tree: summary, types and the path of a selected field', async ({ page }) => {
  await send(page, `${MOCK}/nested`);

  await expect(page.getByLabel('JSON summary')).toHaveText(
    '24 values · depth 5 · 6 objects, 3 arrays, 6 strings, 6 numbers, 2 booleans, 1 null',
  );
  await page.getByRole('button', { name: 'Expand all' }).click();
  await page
    .getByRole('treeitem', { name: 'first name' })
    .getByRole('button', { name: /"first name"/ })
    .click();

  const details = page.getByLabel('Selected field');
  await expect(details).toContainText('meta["first name"]');
  await expect(details.getByTestId('type-badge')).toHaveText('string');
});

test('big integers: warning in the tree, exact digits in the raw view', async ({ page }) => {
  await send(page, `${MOCK}/bigint`);

  await expect(page.getByRole('note')).toContainText('larger than 2^53');
  await page.getByRole('button', { name: 'Raw' }).click();
  await expect(page.getByText('12345678901234567890')).toBeVisible();
});

test('a 20 000-item array renders one page at a time', async ({ page }) => {
  await send(page, `${MOCK}/large-json/20000`);

  await expect(page.getByRole('button', { name: 'Show more (19900 remaining)' })).toBeVisible();
  // root + 100 items, each opened one level (3 fields) = 401 rows, not 60 000+
  await expect(page.getByRole('treeitem')).toHaveCount(401);
});

test('Info tab shows encoding and decoded vs wire size', async ({ page }) => {
  await send(page, `${MOCK}/gzip`);

  await page
    .getByRole('tablist', { name: 'Response sections' })
    .getByRole('tab', { name: 'Info' })
    .click();
  const info = page.getByRole('table', { name: 'Response metadata' });
  await expect(info).toContainText('gzip');
  await expect(info).toContainText(/bytes decoded \(Content-Length on the wire: \d+\)/);
});
