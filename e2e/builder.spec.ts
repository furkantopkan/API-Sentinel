import { expect, test, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

// The backend runs with AI_MODE=mock and RECORDER_HEADLESS=true: the real
// recorder is used, against the local mock site, with no visible window.

const MOCK = `http://localhost:${MOCK_PORT}`;

async function openBuilder(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Build with AI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Build collection with AI' });
  await expect(dialog.getByLabel('Website to record')).toBeVisible();
  return dialog;
}

test('AB-01: record a flow, build a draft and create a collection', async ({ page }) => {
  const dialog = await openBuilder(page);
  await expect(dialog.getByRole('button', { name: 'Build draft' })).toBeDisabled();

  await dialog.getByLabel('Website to record').fill(`${MOCK}/recording-page`);
  await dialog.getByRole('button', { name: 'Start recording' }).click();
  await expect(dialog.getByRole('status')).toContainText('2 API requests captured');

  await dialog.getByRole('button', { name: 'Finish recording' }).click();
  await expect(dialog.getByText('2 API requests found.')).toBeVisible();

  // The goal is optional: showing the flow is enough.
  await dialog.getByRole('button', { name: 'Build draft' }).click();
  const steps = dialog.getByRole('list', { name: 'Draft steps' });
  await expect(steps.getByRole('listitem')).toHaveCount(2);
  await expect(steps).toContainText('{{baseUrl}}/json');

  const name = `Recorded flow ${Date.now()}`;
  await dialog.getByLabel('Collection name').fill(name);
  await dialog.getByRole('button', { name: 'Create collection (2)' }).click();

  await expect(page.getByRole('listitem', { name: `Collection ${name}` })).toBeVisible();
});

test('AB-02: closing the builder cancels the recording', async ({ page }) => {
  const dialog = await openBuilder(page);
  await dialog.getByLabel('Website to record').fill(`${MOCK}/recording-page`);
  await dialog.getByRole('button', { name: 'Start recording' }).click();
  await expect(dialog.getByRole('status')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();

  await expect
    .poll(async () => {
      const response = await page.request.get('/api/recordings/current');
      const body = (await response.json()) as { status: { active: boolean } };
      return body.status.active;
    })
    .toBe(false);
});

test('AB-03: a private address is refused with a clear message', async ({ page }) => {
  const dialog = await openBuilder(page);
  await dialog.getByLabel('Website to record').fill('http://192.168.1.1/');
  await dialog.getByRole('button', { name: 'Start recording' }).click();
  await expect(dialog.getByRole('alert')).toContainText('private network');
});

test('AB-04: a HAR file still works as the advanced option', async ({ page }) => {
  const dialog = await openBuilder(page);
  await dialog.getByText('Advanced: use a HAR file instead').click();
  const har = {
    log: {
      entries: [
        {
          _resourceType: 'fetch',
          request: { method: 'POST', url: `${MOCK}/echo`, headers: [] },
          response: { status: 200, content: { mimeType: 'application/json', text: '{"a":1}' } },
        },
      ],
    },
  };
  await dialog.getByLabel('HAR file').setInputFiles({
    name: 'flow.har',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(har)),
  });
  await expect(dialog.getByText('1 API request found.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Build draft' }).click();

  // A write can change real data, so it must be chosen deliberately.
  await expect(dialog.getByText('Changes data on the server. Off by default.')).toBeVisible();
  await expect(dialog.getByLabel('Include step 1')).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Create collection (0)' })).toBeDisabled();
});
