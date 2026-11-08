import { expect, test, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

// All spec files share one in-memory backend, so every test uses its own names.

const MOCK = `http://localhost:${MOCK_PORT}`;
let counter = 0;
const unique = (label: string) => `${label} ${Date.now()}-${++counter}`;

async function createCollection(page: Page, name: string) {
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByLabel('New collection name').fill(name);
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('listitem', { name: `Collection ${name}` })).toBeVisible();
}

async function saveAs(page: Page, name: string, collection: string) {
  await page.getByRole('button', { name: 'Save as…' }).click();
  await page.getByLabel('Request name').fill(name);
  await page.getByLabel('Collection', { exact: true }).selectOption({ label: collection });
  await page.getByRole('form', { name: 'Save as' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByLabel('Open request')).toContainText(`${collection} / ${name}`);
  // The form closes just after the list refreshes; until then it has its own Save button.
  await expect(page.getByRole('form', { name: 'Save as' })).toHaveCount(0);
}

const urlInput = (page: Page) => page.getByLabel('Request URL');
const dirtyMark = (page: Page) => page.getByText('● Unsaved changes');
const openButton = (page: Page, name: string, method = 'GET') =>
  page.getByRole('button', { name: `${method} ${name}`, exact: true });

/** Hover-only buttons are hidden with opacity; hover the row first, like a user. */
async function clickRowAction(page: Page, rowName: string, action: string) {
  await openButton(page, rowName).hover();
  await page.getByRole('button', { name: `${action} request ${rowName}` }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('CO-02…05, 07, 08: save, edit, save again, reopen after reload', async ({ page }) => {
  const collection = unique('Users');
  const request = unique('Get user');
  await createCollection(page, collection);

  await urlInput(page).fill(`${MOCK}/json`);
  await page.getByRole('tab', { name: /Assertions/ }).click();
  await page.getByRole('button', { name: '+ Add assertion' }).click();
  await saveAs(page, request, collection);
  await expect(dirtyMark(page)).toHaveCount(0);

  await urlInput(page).fill(`${MOCK}/text`);
  await expect(dirtyMark(page)).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dirtyMark(page)).toHaveCount(0);

  await page.reload();
  await openButton(page, request).click();
  await expect(urlInput(page)).toHaveValue(`${MOCK}/text`);
  await expect(page.getByRole('tab', { name: /Assertions/ })).toContainText('1');
  await expect(dirtyMark(page)).toHaveCount(0); // opening must not look like a change
});

test('CO-06: leaving unsaved changes asks first; cancelling keeps them', async ({ page }) => {
  const collection = unique('Guard');
  const request = unique('Req');
  await createCollection(page, collection);
  await urlInput(page).fill(`${MOCK}/json`);
  await saveAs(page, request, collection);
  await urlInput(page).fill(`${MOCK}/changed`);

  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'New request' }).click();
  await expect(urlInput(page)).toHaveValue(`${MOCK}/changed`);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'New request' }).click();
  await expect(urlInput(page)).toHaveValue('');
  await expect(page.getByLabel('Open request')).toContainText('Unsaved request');
});

test('renames a saved request in place, keeping unsaved edits out of the stored copy', async ({
  page,
}) => {
  const collection = unique('Rename');
  const oldName = unique('Old name');
  const newName = unique('New name');
  await createCollection(page, collection);
  await urlInput(page).fill(`${MOCK}/json`);
  await saveAs(page, oldName, collection);

  await urlInput(page).fill(`${MOCK}/unsaved-edit`);
  await clickRowAction(page, oldName, 'Rename');
  await page.getByLabel(`Rename request ${oldName}`).fill(newName);
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(openButton(page, newName)).toBeVisible();
  await expect(openButton(page, oldName)).toHaveCount(0);
  await expect(page.getByLabel('Open request')).toContainText(`${collection} / ${newName}`);
  await expect(dirtyMark(page)).toBeVisible(); // the edit is still unsaved

  // A later Save keeps the new name (it must not write the old one back).
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dirtyMark(page)).toHaveCount(0);
  await page.reload();
  await openButton(page, newName).click();
  await expect(urlInput(page)).toHaveValue(`${MOCK}/unsaved-edit`);
});

test('CO-10: "Save as" creates a copy and leaves the original unchanged', async ({ page }) => {
  const collection = unique('Copy');
  const original = unique('Original');
  const copy = unique('Copy of it');
  await createCollection(page, collection);
  await urlInput(page).fill(`${MOCK}/json`);
  await saveAs(page, original, collection);

  await urlInput(page).fill(`${MOCK}/text`);
  await saveAs(page, copy, collection);

  await openButton(page, original).click();
  await expect(urlInput(page)).toHaveValue(`${MOCK}/json`);
  await openButton(page, copy).click();
  await expect(urlInput(page)).toHaveValue(`${MOCK}/text`);
});

test('CO-13, 14: deleting requests and collections asks first', async ({ page }) => {
  const collection = unique('Delete');
  const first = unique('First');
  const second = unique('Second');
  await createCollection(page, collection);
  await urlInput(page).fill(`${MOCK}/json`);
  await saveAs(page, first, collection);
  await saveAs(page, second, collection);

  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  });

  await clickRowAction(page, second, 'Delete');
  await expect(openButton(page, second)).toHaveCount(0);
  await expect(page.getByLabel('Open request')).toContainText('Unsaved request');

  const row = page.getByRole('listitem', { name: `Collection ${collection}` });
  await row.getByRole('button', { name: new RegExp(`^▾ ${collection}`) }).hover();
  await page.getByRole('button', { name: `Delete collection ${collection}` }).click();
  await expect(row).toHaveCount(0);
  expect(messages[1]).toContain('and its 1 saved request?');
});

test('CO-17: a saved request can be sent and its assertions run', async ({ page }) => {
  const collection = unique('Runnable'); // not "Send": other specs look for a button with that name
  const request = unique('Req');
  await createCollection(page, collection);
  await urlInput(page).fill(`${MOCK}/json`);
  await page.getByRole('tab', { name: /Assertions/ }).click();
  await page.getByRole('button', { name: '+ Add assertion' }).click();
  await saveAs(page, request, collection);
  await page.getByRole('button', { name: 'New request' }).click();

  await openButton(page, request).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(page.getByTestId('response-status')).toContainText('200');
  await expect(
    page
      .getByRole('tablist', { name: 'Response sections' })
      .getByRole('tab', { name: 'Tests 1/1' }),
  ).toBeVisible();
});
