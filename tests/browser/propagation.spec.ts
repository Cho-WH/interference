import { test, expect, type Page } from '@playwright/test';

const source = '[data-handle="source-1"]';
async function position(page: Page) {
  // Page load can precede the first animation frame (and initial GPU compilation).
  await page.locator(`${source}[data-world-y]`).waitFor({ state: 'attached' });
  return page.evaluate(() => ({
    y: Number(document.querySelector('[data-handle="source-1"]')!.getAttribute('data-world-y')),
    t: Number(document.querySelector('#field-overlay')!.getAttribute('data-time-seconds')),
  }));
}
async function startDrag(page: Page) {
  const box = (await page.locator(source).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, { steps: 4 });
}

test('drag previews only, release commits, movement respects wave speed, pause freezes and retarget stays continuous', async ({ page }) => {
  await page.goto('/');
  const initial = await position(page);
  await startDrag(page);
  await expect(page.locator('#motion-hint')).toContainText('손을 떼면');
  await expect(page.locator('[data-source-target="source-1"]')).toHaveAttribute('visibility', 'visible');
  expect((await position(page)).y).toBe(initial.y);
  await page.waitForTimeout(120);
  expect((await position(page)).y).toBe(initial.y);
  await page.mouse.up();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-moving', 'true');
  await expect.poll(async () => (await position(page)).y).toBeLessThan(initial.y);
  const a = await position(page);
  await page.waitForTimeout(250);
  const b = await position(page);
  expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(.12 * .7 * (b.t - a.t) + 1e-8);
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await expect(page.locator('#motion-hint')).toContainText('재생하면');
  const frozen = await position(page);
  await page.waitForTimeout(150);
  expect(await position(page)).toEqual(frozen);
  await page.locator('#separation').fill('6');
  await expect(page.locator('#separation-value')).toHaveText('6 cm');
  expect(await position(page)).toEqual(frozen);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(async () => (await position(page)).y).toBeGreaterThan(frozen.y);
});

test('Escape, pointer cancellation and reset discard previews without moving the source', async ({ page }) => {
  await page.goto('/');
  const initial = await position(page);
  await startDrag(page);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-source-target="source-1"]')).toHaveAttribute('visibility', 'hidden');
  expect((await position(page)).y).toBe(initial.y);
  await startDrag(page);
  await page.locator('#field-overlay').evaluate(svg => svg.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-moving', 'false');
  expect((await position(page)).y).toBe(initial.y);
  await startDrag(page);
  await page.getByRole('button', { name: '처음으로', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(page.locator('[data-source-target="source-1"]')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-moving', 'false');
  expect((await position(page)).y).toBe(initial.y);
});

test('paused wavelength edits preserve field pixels; transient amplitude view is explicitly deferred and reset clears history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const pixelDifference = (save: boolean) => page.locator('#wave-field').evaluate((c: HTMLCanvasElement, save) => {
    const copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height;
    const context = copy.getContext('2d')!; context.drawImage(c, 0, 0);
    const pixels = context.getImageData(0, 0, c.width, c.height).data;
    if (save) (window as any).pausedPixels = pixels;
    const before: Uint8ClampedArray = (window as any).pausedPixels;
    let max = 0, sum = 0;
    for (let i = 0; i < pixels.length; i++) { const d = Math.abs(pixels[i] - before[i]); max = Math.max(max, d); sum += d; }
    return { max, mean: sum / pixels.length };
  }, save);
  await pixelDifference(true);
  await page.locator('#wavelength').fill('6');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'false');
  const difference = await pixelDifference(false);
  // Equivalent steady/history shader branches may round into an adjacent palette bin.
  expect(difference.max).toBeLessThanOrEqual(4);
  expect(difference.mean).toBeLessThan(.03);
  await expect(page.locator('#path-ratio')).toHaveText('—');
  await expect(page.locator('#interference-condition')).toContainText('도착하는 중');
  await page.getByRole('button', { name: '간섭무늬', exact: true }).click();
  await expect(page.locator('#field-status')).toBeVisible();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-field-mode', 'wave');
  await page.getByRole('button', { name: '경로 비교', exact: true }).click();
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
  await expect(page.locator('[data-wavelength-mark]')).toHaveAttribute('visibility', 'hidden');
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'true', { timeout: 12000 });
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-field-mode', 'amplitude');
  await expect(page.locator('#field-status')).toBeHidden();
  await expect(page.locator('[data-wavelength-mark]')).toHaveAttribute('visibility', 'visible');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.locator('#wavelength').fill('20');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'false');
  await page.getByRole('button', { name: '처음으로', exact: true }).click();
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'true');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-field-mode', 'amplitude');
  await expect(page.locator('#field-status')).toBeHidden();
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-time-seconds', '0');
});
