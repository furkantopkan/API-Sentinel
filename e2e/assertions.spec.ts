import { expect, test, type Page } from '@playwright/test';
import { MOCK_PORT } from './playwright.config';

const MOCK = `http://localhost:${MOCK_PORT}`;

async function openAssertions(page: Page, url: string) {
  await page.goto('/');
  await page.getByLabel('Request URL').fill(url);
  await page.getByRole('tab', { name: /Assertions/ }).click();
}

const addButton = (page: Page) => page.getByRole('button', { name: '+ Add assertion' });
const outcome = (page: Page, n: number) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByLabel(`Assertion ${n} kind`) })
    .getByTestId('assertion-outcome');

async function send(page: Page) {
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('response-status')).toBeVisible();
}

async function addJsonPath(
  page: Page,
  n: number,
  path: string,
  operator: string,
  expected?: string,
) {
  await addButton(page).click();
  await page.getByLabel(`Assertion ${n} kind`).selectOption('jsonPath');
  await page.getByLabel(`Assertion ${n} path`).fill(path);
  await page.getByLabel(`Assertion ${n} operator`).selectOption(operator);
  if (expected !== undefined) await page.getByLabel(`Assertion ${n} expected value`).fill(expected);
}

test('AS-01…04: results appear after Send and update live while editing', async ({ page }) => {
  await openAssertions(page, `${MOCK}/nested`);
  await addButton(page).click();
  await expect(page.getByText('Send the request to run the assertions.')).toBeVisible();
  await expect(outcome(page, 1)).toHaveCount(0);

  await send(page);
  await expect(outcome(page, 1)).toHaveText('PASS');
  await expect(page.getByRole('tab', { name: 'Tests 1/1' })).toBeVisible();

  const expected = page.getByLabel('Assertion 1 expected value');
  await expected.fill('201');
  await expect(outcome(page, 1)).toHaveText('FAIL');
  await expect(page.getByText('200 does not equal 201.')).toBeVisible();
  await expected.fill('abc');
  await expect(outcome(page, 1)).toHaveText('ERROR');
});

test('AS-05…17: JSON path, header, body and time checks', async ({ page }) => {
  await openAssertions(page, `${MOCK}/nested`);
  await addJsonPath(page, 1, 'data.total', 'equals', '2');
  await addJsonPath(page, 2, 'data.total', 'equals', '"2"');
  await addJsonPath(page, 3, 'meta["first name"]', 'equals', 'Ada');
  await addJsonPath(page, 4, 'data.nextPage', 'isNull');
  await addJsonPath(page, 5, 'data.items', 'isType');
  await page.getByLabel('Assertion 5 expected value').selectOption('array');
  await addJsonPath(page, 6, 'data.items[0].tags', 'contains', 'usb');
  await addJsonPath(page, 7, 'data.items[0].price', 'greaterThan', '40');
  await addJsonPath(page, 8, 'data.missing', 'exists');
  await addJsonPath(page, 9, 'data.items[', 'exists');
  await addButton(page).click();
  await page.getByLabel('Assertion 10 kind').selectOption('header');
  await page.getByLabel('Assertion 10 header name').fill('Content-Type');
  await page.getByLabel('Assertion 10 operator').selectOption('contains');
  await page.getByLabel('Assertion 10 expected value').fill('json');
  await addButton(page).click();
  await page.getByLabel('Assertion 11 kind').selectOption('body');
  await page.getByLabel('Assertion 11 expected value').fill('Keyboard');
  await addButton(page).click();
  await page.getByLabel('Assertion 12 kind').selectOption('responseTime');
  await page.getByLabel('Assertion 12 expected value').fill('5000');
  await send(page);

  const expected = [
    'PASS',
    'FAIL',
    'PASS',
    'PASS',
    'PASS',
    'PASS',
    'PASS',
    'FAIL',
    'ERROR',
    'PASS',
    'PASS',
    'PASS',
  ];
  for (const [i, text] of expected.entries()) await expect(outcome(page, i + 1)).toHaveText(text);
  await expect(
    page.getByText('The types differ: number vs string.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Assertion 4 expected value')).toHaveCount(0); // is null has no value

  await page.getByRole('tab', { name: 'Tests 9/12' }).click();
  await expect(page.getByLabel('Assertion summary')).toHaveText(
    '9 of 12 passed · 2 failed · 1 invalid',
  );
});

test('AS-18, AS-19, AS-24: disable, remove and change kind', async ({ page }) => {
  await openAssertions(page, `${MOCK}/nested`);
  await addButton(page).click();
  await addButton(page).click();
  await send(page);
  await expect(page.getByRole('tab', { name: 'Tests 2/2' })).toBeVisible();

  await page.getByLabel('Enable assertion 1').uncheck();
  await expect(outcome(page, 1)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Tests 1/1' })).toBeVisible();

  await page.getByLabel('Assertion 2 kind').selectOption('header');
  await expect(page.getByLabel('Assertion 2 operator')).toHaveValue('exists');
  await expect(page.getByLabel('Assertion 2 header name')).toHaveValue('');

  await page.getByRole('button', { name: 'Remove assertion 2' }).click();
  await expect(page.getByLabel('Assertion 2 kind')).toHaveCount(0);
});

test('AS-21, AS-22: add assertions from the JSON tree', async ({ page }) => {
  await openAssertions(page, `${MOCK}/nested`);
  await send(page);
  await page.getByRole('button', { name: 'Expand all' }).click();

  await page.getByRole('treeitem', { name: 'price' }).first().getByRole('button').first().click();
  const addFromTree = page.getByRole('button', { name: 'Add assertion', exact: true });
  await addFromTree.click();
  await expect(page.getByRole('button', { name: /Added ✓/ })).toBeVisible();

  await page
    .getByRole('treeitem', { name: 'items' })
    .getByRole('button', { name: /^"items"/ })
    .click();
  await addFromTree.click();

  await expect(page.getByLabel('Assertion 1 path')).toHaveValue('data.items[0].price');
  await expect(page.getByLabel('Assertion 1 expected value')).toHaveValue('49.9');
  await expect(page.getByLabel('Assertion 2 operator')).toHaveValue('isType');
  await expect(page.getByLabel('Assertion 2 expected value')).toHaveValue('array');
  await expect(outcome(page, 1)).toHaveText('PASS');
  await expect(outcome(page, 2)).toHaveText('PASS');
});

test('AS-23: JSON path checks on a text response are errors; others still run', async ({
  page,
}) => {
  await openAssertions(page, `${MOCK}/text`);
  await addButton(page).click(); // status equals 200
  await addJsonPath(page, 2, 'a', 'exists');
  await send(page);

  await expect(outcome(page, 1)).toHaveText('PASS');
  await expect(outcome(page, 2)).toHaveText('ERROR');
  await expect(page.getByText('The body is not JSON (text).')).toBeVisible();
});
