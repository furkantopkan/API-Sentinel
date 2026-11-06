import { expect, test } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

const MOCK = `http://localhost:${MOCK_PORT}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function send(page: import('@playwright/test').Page, url: string) {
  await page.getByLabel('Request URL').fill(url);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('GET to the mock target shows 200 and the JSON body', async ({ page }) => {
  await send(page, `${MOCK}/json`);

  await expect(page.getByTestId('response-status')).toContainText('200');
  await expect(page.getByText('"Ada Lovelace"')).toBeVisible();
});

test('a loopback target is blocked by the SSRF guard', async ({ page }) => {
  await send(page, 'http://127.0.0.1:3998/api/health');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('BLOCKED_TARGET');
  await expect(alert).toContainText('127.0.0.1');
});

test('an invalid URL is rejected in the browser before sending', async ({ page }) => {
  await send(page, 'ftp://example.com');

  // The message appears twice (URL preview + validation list); check the validation list.
  await expect(
    page.getByRole('listitem').filter({ hasText: /Unsupported protocol "ftp:"/ }),
  ).toBeVisible();
  await expect(page.getByText('No response yet')).toBeVisible();
});

test('an invalid JSON body blocks sending', async ({ page }) => {
  let executeCalls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/requests/execute')) executeCalls++;
  });

  await page.getByLabel('HTTP method').selectOption('POST');
  await page.getByRole('tab', { name: /Body/ }).click();
  await page.getByLabel('Request body').fill('{"a":1,}');
  await send(page, `${MOCK}/echo`);

  await expect(
    page.getByRole('listitem').filter({ hasText: /Body is not valid JSON/ }),
  ).toBeVisible();
  expect(executeCalls).toBe(0);
});

test('HTML responses are shown as text, never executed', async ({ page }) => {
  let dialogOpened = false;
  page.on('dialog', (dialog) => {
    dialogOpened = true;
    void dialog.dismiss();
  });

  await send(page, `${MOCK}/html`);

  await expect(page.getByText('<script>alert("xss")</script>', { exact: false })).toBeVisible();
  expect(dialogOpened).toBe(false);
});
