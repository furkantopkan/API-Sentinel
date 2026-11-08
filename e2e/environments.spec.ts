import { expect, test, type Locator, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

// EN-xx: the manual scenarios of Phase 6.2, in a real browser.
// All spec files share one backend, so every test uses its own environment name.

const MOCK = `http://localhost:${MOCK_PORT}`;
const TOKEN = 'test-token'; // the token the mock target accepts
let counter = 0;
const unique = (label: string) => `${label} ${Date.now()}-${++counter}`;

interface Variable {
  key: string;
  value: string;
  secret?: boolean;
}

const manager = (page: Page) => page.getByRole('dialog', { name: 'Manage environments' });
const urlInput = (page: Page) => page.getByLabel('Request URL');
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });
const envSelect = (page: Page) => page.getByLabel('Environment', { exact: true });
const validationAlert = (page: Page) =>
  page.getByRole('region', { name: 'Request builder' }).getByRole('alert');

async function fillVariable(dialog: Locator, n: number, variable: Variable) {
  await dialog.getByRole('button', { name: '+ Add variable' }).click();
  await dialog.getByLabel(`Variable ${n} name`).fill(variable.key);
  if (variable.secret) await dialog.getByLabel(`Variable ${n} is secret`).check();
  await dialog.getByLabel(`Variable ${n} value`).fill(variable.value);
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: 'Manage' }).click();
  return manager(page);
}

async function createEnvironment(page: Page, name: string, variables: Variable[]) {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: '+ New environment' }).click();
  await dialog.getByLabel('Environment name').fill(name);
  for (const [index, variable] of variables.entries()) {
    await fillVariable(dialog, index + 1, variable);
  }
  await dialog.getByRole('button', { name: 'Save environment' }).click();
  await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
}

async function createAndSelect(page: Page, variables: Variable[]) {
  const name = unique('Env');
  await createEnvironment(page, name, variables);
  await envSelect(page).selectOption({ label: name });
  return name;
}

/** Opens an environment in the dialog and waits until its rows are loaded. */
async function editEnvironment(page: Page, name: string) {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name, exact: true }).click();
  await expect(dialog.getByLabel('Environment name')).toHaveValue(name);
  return dialog;
}

async function useBearer(page: Page, token: string) {
  await page
    .getByRole('tablist', { name: 'Request sections' })
    .getByRole('tab', { name: /Auth/ })
    .click();
  // The <label> wraps the <select>, so its text also contains the option names.
  await page.getByLabel(/^Type/).selectOption('bearer');
  await page.getByLabel('Token', { exact: true }).fill(token);
}

async function send(page: Page, status: string) {
  await sendButton(page).click();
  await expect(page.getByTestId('response-status')).toContainText(status);
}

async function rawBody(page: Page) {
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  return (await page.locator('pre').first().textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('EN-01: a variable without an environment blocks sending', async ({ page }) => {
  let executed = false;
  page.on('request', (r) => {
    if (r.url().includes('/api/requests/execute')) executed = true;
  });
  await urlInput(page).fill('{{baseUrl}}/json');
  await sendButton(page).click();

  await expect(validationAlert(page)).toContainText('{{baseUrl}}');
  expect(executed).toBe(false);
});

test('EN-02, 03, 04: a secret is saved but never comes back to the browser', async ({ page }) => {
  const responses: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/environments')) void r.text().then((t) => responses.push(t));
  });
  const name = unique('Secrets');
  await createEnvironment(page, name, [
    { key: 'baseUrl', value: MOCK },
    { key: 'token', value: 'NEVER-RETURNED-VALUE', secret: true },
  ]);

  const dialog = await editEnvironment(page, name);
  await expect(dialog.getByLabel('Variable 1 value')).toHaveValue(MOCK);
  await expect(dialog.getByLabel('Variable 2 value')).toHaveValue('');
  await expect(dialog.getByLabel('Variable 2 value')).toHaveAttribute(
    'placeholder',
    'Saved (leave blank to keep)',
  );
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.join('')).not.toContain('NEVER-RETURNED-VALUE');
});

test('EN-05: variables fill the URL preview and the request', async ({ page }) => {
  await createAndSelect(page, [{ key: 'baseUrl', value: MOCK }]);
  await urlInput(page).fill('{{baseUrl}}/json');

  // Scoped: a saved request from a parallel spec may show the same URL in the sidebar.
  await expect(
    page.getByRole('region', { name: 'Request builder' }).getByTitle(`${MOCK}/json`),
  ).toBeVisible();
  await send(page, '200');
});

test('EN-06: a secret variable works as the Bearer token', async ({ page }) => {
  await createAndSelect(page, [
    { key: 'baseUrl', value: MOCK },
    { key: 'token', value: TOKEN, secret: true },
  ]);
  await urlInput(page).fill('{{baseUrl}}/auth/bearer');
  await useBearer(page, '{{token}}');

  await send(page, '200');
});

test('EN-07, 08: secrets are *** in the preview and masked when echoed back', async ({ page }) => {
  await createAndSelect(page, [
    { key: 'baseUrl', value: MOCK },
    { key: 'token', value: 'ECHOED-SECRET-VALUE', secret: true },
  ]);
  await urlInput(page).fill('{{baseUrl}}/echo');
  await page.getByRole('button', { name: '+ Add query parameter' }).click();
  await page.getByLabel('query parameter 1 key').fill('key');
  await page.getByLabel('query parameter 1 value').fill('{{token}}');

  await expect(page.getByTitle(`${MOCK}/echo?key=***`)).toBeVisible();
  await send(page, '200');
  const body = await rawBody(page);
  expect(body).toContain('[secret]');
  expect(body).not.toContain('ECHOED-SECRET-VALUE');
});

test('EN-09: an unquoted variable in a JSON body', async ({ page }) => {
  await createAndSelect(page, [
    { key: 'baseUrl', value: MOCK },
    { key: 'num', value: '5' },
  ]);
  await page.getByLabel('HTTP method').selectOption('POST');
  await urlInput(page).fill('{{baseUrl}}/echo');
  await page
    .getByRole('tablist', { name: 'Request sections' })
    .getByRole('tab', { name: /Body/ })
    .click();
  await page.getByLabel('Request body').fill('{"id": {{num}}}');

  await send(page, '200');
  expect(await rawBody(page)).toContain('{\\"id\\": 5}');
});

test('EN-10: an undefined variable blocks sending', async ({ page }) => {
  await createAndSelect(page, [{ key: 'baseUrl', value: MOCK }]);
  await urlInput(page).fill('{{baseUrl}}/{{missing}}');
  await sendButton(page).click();

  await expect(validationAlert(page)).toContainText('{{missing}}');
});

test('EN-11, 12: editing keeps a secret; un-marking it clears the value', async ({ page }) => {
  const name = await createAndSelect(page, [
    { key: 'baseUrl', value: MOCK },
    { key: 'token', value: TOKEN, secret: true },
  ]);
  await urlInput(page).fill('{{baseUrl}}/auth/bearer');
  await useBearer(page, '{{token}}');

  // Change something else; the blank secret field must keep the stored value.
  let dialog = await editEnvironment(page, name);
  await fillVariable(dialog, 3, { key: 'extra', value: '1' });
  await dialog.getByRole('button', { name: 'Save environment' }).click();
  await expect(dialog.getByRole('button', { name: 'Save environment' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await send(page, '200');

  dialog = await editEnvironment(page, name);
  await dialog.getByLabel('Variable 2 is secret').uncheck();
  await expect(dialog.getByLabel('Variable 2 value')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Save environment' }).click();
  await expect(dialog.getByRole('button', { name: 'Save environment' })).toBeDisabled();
  await expect(dialog.getByLabel('Variable 2 value')).toHaveValue(''); // not revealed
  await dialog.getByRole('button', { name: 'Close' }).click();

  await sendButton(page).click();
  await expect(page.getByRole('region', { name: 'Response' }).getByRole('alert')).toContainText(
    'Bearer token is empty',
  );
});

test('EN-13: a disabled variable counts as undefined', async ({ page }) => {
  const name = await createAndSelect(page, [{ key: 'baseUrl', value: MOCK }]);
  await urlInput(page).fill('{{baseUrl}}/json');

  const dialog = await editEnvironment(page, name);
  await dialog.getByLabel('Enable variable 1').uncheck();
  await dialog.getByRole('button', { name: 'Save environment' }).click();
  await expect(dialog.getByRole('button', { name: 'Save environment' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await sendButton(page).click();
  await expect(validationAlert(page)).toContainText('{{baseUrl}}');
});

test('EN-14: duplicate names are rejected with a clear message', async ({ page }) => {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: '+ New environment' }).click();
  await dialog.getByLabel('Environment name').fill(unique('Dup'));
  await fillVariable(dialog, 1, { key: 'same', value: '1' });
  await fillVariable(dialog, 2, { key: 'same', value: '2' });
  await dialog.getByRole('button', { name: 'Save environment' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Duplicate variable "same"');
});

test('EN-15: closing with unsaved changes asks first', async ({ page }) => {
  const dialog = await openManager(page);
  await dialog.getByRole('button', { name: '+ New environment' }).click();
  await dialog.getByLabel('Environment name').fill('typed but not saved');

  page.once('dialog', (d) => void d.dismiss());
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('EN-16: saved requests keep placeholders, never the values', async ({ page }) => {
  await createAndSelect(page, [{ key: 'baseUrl', value: MOCK }]);
  const collection = unique('EnvCollection');
  const request = unique('Templated');
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel('New collection name').fill(collection);
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('listitem', { name: `Collection ${collection}` })).toBeVisible();

  await urlInput(page).fill('{{baseUrl}}/json');
  await page.getByRole('button', { name: 'Save as…' }).click();
  await page.getByLabel('Request name').fill(request);
  await page.getByLabel('Collection', { exact: true }).selectOption({ label: collection });
  await page.getByRole('form', { name: 'Save as' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByLabel('Open request')).toContainText(request);

  await page.reload();
  await page.getByRole('button', { name: `GET ${request}`, exact: true }).click();
  await expect(urlInput(page)).toHaveValue('{{baseUrl}}/json');
});

test('EN-17, 18: the selection is remembered; deleting it falls back to none', async ({ page }) => {
  const name = await createAndSelect(page, [{ key: 'a', value: '1' }]);

  await page.reload();
  await expect(envSelect(page).locator('option:checked')).toHaveText(name);

  const dialog = await editEnvironment(page, name);
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete environment' }).click();
  await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await expect(envSelect(page).locator('option:checked')).toHaveText('No environment');
});

test('EN-20: the AI receives the placeholder, not the secret', async ({ page }) => {
  await createAndSelect(page, [
    { key: 'baseUrl', value: MOCK },
    { key: 'token', value: 'AI-MUST-NOT-SEE', secret: true },
  ]);
  await urlInput(page).fill('{{baseUrl}}/echo');
  await useBearer(page, '{{token}}');
  await send(page, '200');

  await page
    .getByRole('tablist', { name: 'Response sections' })
    .getByRole('tab', { name: 'AI' })
    .click();
  const aiRequest = page.waitForRequest((r) => r.url().includes('/api/ai/test-cases'));
  await page.getByRole('button', { name: 'Generate test cases' }).click();
  await expect(page.getByText('Test cases (5)')).toBeVisible();

  const payload = (await aiRequest).postData() ?? '';
  expect(payload).toContain('{{baseUrl}}/echo');
  expect(payload).not.toContain('AI-MUST-NOT-SEE');
});
