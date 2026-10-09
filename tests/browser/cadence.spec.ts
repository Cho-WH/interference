import { test, expect, type Page } from '@playwright/test';

async function displayedFrames(page: Page, edit = false) {
  return page.evaluate(edit => new Promise<{ count: number; elapsed: number; aligned: boolean }>(resolve => {
    const field = document.querySelector('#field-overlay')!;
    const comparison = document.querySelector('[data-view="comparison"]')!;
    const initial = Number(field.getAttribute('data-time-seconds'));
    const times = new Set<number>();
    const start = performance.now();
    let aligned = true, lastEdit = start;
    function tick(now: number) {
      const time = Number(field.getAttribute('data-time-seconds'));
      times.add(time);
      aligned &&= Number(comparison.getAttribute('data-time-seconds')) === time;
      if (edit && now - lastEdit > 15) {
        const control = document.querySelector<HTMLInputElement>('#wavelength')!;
        control.value = control.value === '6' ? '30' : '6';
        control.dispatchEvent(new Event('input', { bubbles: true }));
        lastEdit = now;
      }
      if (now - start < 1000) requestAnimationFrame(tick);
      else resolve({ count: times.size, elapsed: time - initial, aligned });
    }
    requestAnimationFrame(tick);
  }), edit);
}

test('transient sampling drops to 30 Hz even during input, while physical time and views stay aligned', async ({ page }) => {
  // CPU fallback retains the previous sampling ceiling; GPU cadence adapts separately.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
  });
  await page.goto('/');
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
  const steady = await displayedFrames(page);
  expect(steady.count).toBeGreaterThan(40);
  expect(steady.count).toBeLessThanOrEqual(65);
  expect(steady.aligned).toBe(true);
  await page.locator('#wavelength').fill('6');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'false');
  const transient = await displayedFrames(page, true);
  expect(transient.count).toBeGreaterThanOrEqual(24);
  expect(transient.count).toBeLessThanOrEqual(34);
  expect(transient.elapsed).toBeGreaterThan(.9);
  expect(transient.aligned).toBe(true);
  await page.getByRole('button', { name: '처음으로', exact: true }).click();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'true');
  const restored = await displayedFrames(page);
  expect(restored.count).toBeGreaterThan(40);
  expect(restored.aligned).toBe(true);
});
