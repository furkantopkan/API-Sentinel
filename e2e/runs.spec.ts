import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { MOCK_PORT } from './playwright.config';

// RU-xx: the manual scenarios of Phase 6.3, in a real browser.
// Test data is created through the API; all spec files share one backend, so names are unique.

const MOCK = `http://localhost:${MOCK_PORT}`;
const STATUS_200 = {
  id: 'a1',
  enabled: true,
  kind: 'status',
  target: '',
  operator: 'equals',
  expected: '200',
};
let counter = 0;
const unique = (label: string) => `${label} ${Date.now()}-${++counter}`;

const request = (
  url: string,
  headers: { key: string; value: string; enabled: boolean }[] = [],
) => ({
  method: 'GET',
  url,
  queryParams: [],
  headers,
  auth: { type: 'none' },
  body: '',
  options: { followRedirects: true },
});

interface ApiRecord {
  id: string;
}

async function post(api: APIRequestContext, path: string, data: unknown): Promise<ApiRecord> {
  const response = await api.post(path, { data });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    collection?: ApiRecord;
    savedRequest?: ApiRecord;
    environment?: ApiRecord;
  };
  const record = body.collection ?? body.savedRequest ?? body.environment;
  if (!record) throw new Error(`Unexpected response from ${path}`);
  return record;
}

async function createCollection(page: Page, requests: { name: string; url: string }[]) {
  const name = unique('Suite');
  const collection = await post(page.request, '/api/collections', { name });
  const saved: Record<string, ApiRecord> = {};
  for (const item of requests) {
    saved[item.name] = await post(page.request, '/api/saved-requests', {
      collectionId: collection.id,
      name: item.name,
      request: request(item.url),
      assertions: [STATUS_200],
    });
  }
  await page.reload();
  return { name, id: collection.id, saved };
}

const THREE = [
  { name: 'req-ok', url: `${MOCK}/status/200` },
  { name: 'req-bad', url: `${MOCK}/status/500` },
  { name: 'req-down', url: 'http://127.0.0.1:1/' }, // blocked: no response at all
];

const summary = (page: Page) => page.getByLabel('Run summary');
const details = (page: Page) => page.getByRole('region', { name: 'Run details' });
const resultRow = (page: Page, name: string) =>
  details(page).locator('details').filter({ hasText: name });
const history = (page: Page) => page.getByRole('navigation', { name: 'Run history' });
const historyItems = (page: Page, name: string) =>
  history(page).getByRole('button').filter({ hasText: name });
const views = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name });

/** Starts a run and waits for this run's own result, not the previous one. */
async function run(page: Page, name: string, expected: string) {
  await page.getByRole('button', { name: `Run collection ${name}` }).click();
  await expect(summary(page)).toHaveText(expected);
}

function updateRequest(page: Page, id: string, collectionId: string, name: string, url: string) {
  return page.request.put(`/api/saved-requests/${id}`, {
    data: { collectionId, name, request: request(url), assertions: [STATUS_200] },
  });
}

async function download(page: Page, label: string): Promise<string> {
  const event = page.waitForEvent('download');
  await page.getByRole('link', { name: label }).click();
  return readFile(await (await event).path(), 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('RU-01, 02: pass, fail and error results of one run', async ({ page }) => {
  const { name } = await createCollection(page, THREE);

  await run(page, name, '1 of 3 passed · 1 failed · 1 error');

  await expect(resultRow(page, 'req-ok').getByTestId('assertion-outcome').first()).toHaveText(
    'PASS',
  );
  await expect(resultRow(page, 'req-bad')).toContainText('500 does not equal 200.');
  await expect(resultRow(page, 'req-down')).toContainText('BLOCKED_TARGET');
});

test('RU-03, 04: HTML and JSON reports can be downloaded', async ({ page }) => {
  const { name } = await createCollection(page, THREE);
  await run(page, name, '1 of 3 passed · 1 failed · 1 error');

  const html = await download(page, 'Download HTML');
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('1 passed');
  expect(html).toContain('Status code equals 200');

  const json = JSON.parse(await download(page, 'Download JSON')) as {
    generatedBy: string;
    run: { total: number; collectionName: string };
  };
  expect(json.generatedBy).toBe('API Sentinel');
  expect(json.run).toMatchObject({ total: 3, collectionName: name });
});

test('RU-05…07: comparing runs shows fixes and regressions', async ({ page }) => {
  const { name, id, saved } = await createCollection(page, THREE);
  const compare = page.getByLabel('Compare with', { exact: true });
  const comparison = page.getByRole('region', { name: 'Run comparison' });
  await run(page, name, '1 of 3 passed · 1 failed · 1 error');

  await updateRequest(page, saved['req-bad']!.id, id, 'req-bad', `${MOCK}/status/200`);
  await run(page, name, '2 of 3 passed · 1 error');
  await compare.selectOption({ index: 1 });
  await expect(comparison).toContainText('0 regressions, 1 fixed');
  await expect(comparison.getByRole('row').filter({ hasText: 'req-bad' })).toContainText('Fixed');

  await updateRequest(page, saved['req-bad']!.id, id, 'req-bad', `${MOCK}/status/500`);
  await run(page, name, '1 of 3 passed · 1 failed · 1 error');
  await compare.selectOption({ index: 1 });
  await expect(comparison).toContainText('1 regression, 0 fixed');
  await expect(comparison.getByRole('row').filter({ hasText: 'req-bad' })).toContainText(
    'Regression',
  );
});

test('RU-08: a run uses the saved version, not unsaved edits', async ({ page }) => {
  const { name } = await createCollection(page, [{ name: 'Only', url: `${MOCK}/status/200` }]);
  await page.getByRole('button', { name: 'GET Only', exact: true }).click();
  await page.getByLabel('Request URL').fill(`${MOCK}/status/500`);

  await run(page, name, '1 of 1 passed');

  await expect(resultRow(page, 'Only')).toContainText(`${MOCK}/status/200`);
});

test('RU-09: a cancelled run stops and is not added to the history', async ({ page }) => {
  const { name } = await createCollection(page, [{ name: 'Slow', url: `${MOCK}/delay/5000` }]);

  await page.getByRole('button', { name: `Run collection ${name}` }).click();
  await expect(details(page)).toContainText(`Running “${name}”`);
  await details(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(details(page)).not.toContainText('Running');

  await page.waitForTimeout(500); // long enough for a run that was wrongly kept to be stored
  await page.reload();
  await views(page, 'Test runs').click();
  await expect(historyItems(page, name)).toHaveCount(0);
});

test('RU-10, 12: environments work in runs and secrets stay out of reports', async ({ page }) => {
  const environmentName = unique('RunEnv');
  const secret = 'REPORT-SECRET-VALUE';
  await post(page.request, '/api/environments', {
    name: environmentName,
    variables: [
      { key: 'baseUrl', value: MOCK, isSecret: false, enabled: true },
      { key: 'token', value: secret, isSecret: true, enabled: true },
    ],
  });
  const name = unique('EnvSuite');
  const collection = await post(page.request, '/api/collections', { name });
  await post(page.request, '/api/saved-requests', {
    collectionId: collection.id,
    name: 'Echo',
    request: request('{{baseUrl}}/echo', [{ key: 'X-Token', value: '{{token}}', enabled: true }]),
    // Reports show actual values, so this one would carry the secret if it were not masked.
    assertions: [
      {
        id: 'a1',
        enabled: true,
        kind: 'jsonPath',
        target: 'headers["x-token"]',
        operator: 'exists',
        expected: '',
      },
    ],
  });
  await page.reload();
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: environmentName });

  await run(page, name, '1 of 1 passed');

  await expect(details(page)).toContainText(`Environment: ${environmentName}`);
  await expect(resultRow(page, 'Echo')).toContainText('{{baseUrl}}/echo');
  const html = await download(page, 'Download HTML');
  expect(html).toContain('[secret]');
  expect(html).not.toContain(secret);
  expect(await download(page, 'Download JSON')).not.toContain(secret);
});

test('RU-11: without an environment, requests using variables are errors', async ({ page }) => {
  const { name } = await createCollection(page, [{ name: 'Templated', url: '{{baseUrl}}/json' }]);

  await run(page, name, '0 of 1 passed · 1 error');

  await expect(resultRow(page, 'Templated')).toContainText('Select an environment');
});

test('RU-13: an empty collection cannot be run', async ({ page }) => {
  const { name } = await createCollection(page, []);

  await expect(page.getByRole('button', { name: `Run collection ${name}` })).toBeDisabled();
});

test('RU-14: a run can be deleted from the history', async ({ page }) => {
  const { name } = await createCollection(page, [{ name: 'One', url: `${MOCK}/status/200` }]);
  await run(page, name, '1 of 1 passed');
  await expect(historyItems(page, name)).toHaveCount(1);

  page.once('dialog', (dialog) => void dialog.accept());
  await details(page).getByRole('button', { name: 'Delete' }).click();

  await expect(historyItems(page, name)).toHaveCount(0);
  await expect(summary(page)).toHaveCount(0);
});

test('RU-15, 16: history survives a reload and deleting the collection', async ({ page }) => {
  const { name, id } = await createCollection(page, [{ name: 'Kept', url: `${MOCK}/status/200` }]);
  await run(page, name, '1 of 1 passed');
  await expect(historyItems(page, name)).toHaveCount(1);

  expect((await page.request.delete(`/api/collections/${id}`)).status()).toBe(200);
  await page.reload();
  await views(page, 'Test runs').click();
  await historyItems(page, name).click();

  await expect(summary(page)).toHaveText('1 of 1 passed');
  await expect(resultRow(page, 'Kept')).toContainText(`${MOCK}/status/200`);
});

test('RU-17: the editor keeps its response while viewing runs', async ({ page }) => {
  await page.getByLabel('Request URL').fill(`${MOCK}/json`);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('response-status')).toContainText('200');

  await views(page, 'Test runs').click();
  await expect(page.getByTestId('response-status')).toBeHidden();
  await views(page, 'Requests').click();

  await expect(page.getByTestId('response-status')).toBeVisible();
  await expect(page.getByLabel('Request URL')).toHaveValue(`${MOCK}/json`);
});
