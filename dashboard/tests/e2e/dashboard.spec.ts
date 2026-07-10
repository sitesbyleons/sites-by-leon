import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('centers the progress label inside the circular progress ring', async ({ page }) => {
  await page.goto('/dashboard?preview=true');

  const orbit = await page.locator('.progress-orbit').boundingBox();
  const label = await page.locator('.progress-orbit > div').boundingBox();

  expect(orbit).not.toBeNull();
  expect(label).not.toBeNull();

  const orbitCenter = { x: orbit!.x + orbit!.width / 2, y: orbit!.y + orbit!.height / 2 };
  const labelCenter = { x: label!.x + label!.width / 2, y: label!.y + label!.height / 2 };

  expect(Math.abs(orbitCenter.x - labelCenter.x)).toBeLessThan(2);
  expect(Math.abs(orbitCenter.y - labelCenter.y)).toBeLessThan(2);
  expect(Math.abs(orbit!.width - orbit!.height)).toBeLessThan(2);
});

test('keeps the preview dashboard within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard?preview=true');

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole('heading', { name: /your website is/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible();
});

test('has no serious or critical accessibility violations on the client surfaces', async ({ page }) => {
  for (const path of ['/?preview=true', '/dashboard?preview=true']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const important = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(important, `${path}: ${important.map((item) => item.id).join(', ')}`).toEqual([]);
  }
});
