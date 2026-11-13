import { expect, test } from '@playwright/test';

test('TH-01: dark mode follows the system and the user choice survives a reload', async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Dark mode' });

  // No saved choice: the system setting decides.
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The colours really change (page background), not only the attribute.
  const darkBackground = await page
    .locator('body > #root > div')
    .evaluate((el) => getComputedStyle(el).backgroundColor);

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  const lightBackground = await page
    .locator('body > #root > div')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(lightBackground).not.toBe(darkBackground);
  await context.close();
});
