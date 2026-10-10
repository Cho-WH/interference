import { test, expect } from '@playwright/test';

for (const cpu of [false, true]) test(`full-window field has no letterbox after rotation (${cpu ? 'CPU' : 'GPU'})`, async ({ page }) => {
  if (cpu) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const field = await page.locator('#wave-field').evaluate((canvas: HTMLCanvasElement) => {
      const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
      const ctx = copy.getContext('2d')!; ctx.drawImage(canvas, 0, 0);
      const w = copy.width, h = copy.height;
      const strips = [[1, 0, 1, h], [w - 2, 0, 1, h], [0, 1, w, 1], [0, h - 2, w, 1]];
      return { height: canvas.getBoundingClientRect().height, variations: strips.map(([x, y, sw, sh]) => {
        const data = ctx.getImageData(x, y, sw, sh).data;
        const values = Array.from({ length: data.length / 4 }, (_, i) => data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]);
        return Math.max(...values) - Math.min(...values);
      }) };
    });
    for (const variation of field.variations) expect(variation).toBeGreaterThan(20);
    const expectedHeight = viewport.width >= 560 && viewport.height <= 500 && viewport.width > viewport.height
      ? Math.max(180, Math.min(360, viewport.height - 140))
      : viewport.width < 800 ? Math.max(170, Math.min(260, viewport.height - 630))
      : viewport.width >= 1100 && viewport.height >= 600 ? Math.max(210, Math.min(640, viewport.height - 410))
      : Math.max(210, Math.min(360, viewport.height - 460));
    expect(field.height).toBeCloseTo(expectedHeight, 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!cpu) await page.screenshot({ path: `test-results/field-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
