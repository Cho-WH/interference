import { test, expect } from '@playwright/test';

for (const cpu of [false, true]) test(`propagating interference keeps history, animates and pauses (${cpu ? 'CPU' : 'GPU'})`, async ({ page }) => {
  if (cpu) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const pixels = () => page.locator('#wave-field').evaluate(async (canvas: HTMLCanvasElement) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    return copy.toDataURL();
  });
  await page.locator('#play').click();
  await page.locator('#amplitude-mode').click();
  const field = page.locator('#field-overlay');
  await expect(field).toHaveAttribute('data-field-mode', 'amplitude');
  await page.waitForTimeout(60);
  const initial = await pixels();
  await page.locator('#wavelength').fill('6');
  await expect(field).toHaveAttribute('data-steady', 'false');
  await expect(page.locator('#field-legend')).toHaveAttribute('aria-label', /도착 위상/);
  const pending = await pixels();
  // The field at this same instant still contains the old waves (GPU rounding may differ).
  if (cpu) expect(pending === initial).toBe(true);
  const time = await field.getAttribute('data-time-seconds');
  await page.locator('#wave-mode').click();
  await expect(field).toHaveAttribute('data-steady', 'false');
  await page.locator('#amplitude-mode').click();
  expect(await field.getAttribute('data-time-seconds')).toBe(time);
  expect((await pixels()) === pending).toBe(true);
  await page.locator('#play').click();
  await expect.poll(async () => Number(await field.getAttribute('data-time-seconds'))).toBeGreaterThan(Number(time) + .6);
  await page.locator('#play').click();
  await page.waitForTimeout(80);
  const changed = await pixels();
  expect(changed === pending).toBe(false);
  await page.waitForTimeout(100);
  expect((await pixels()) === changed).toBe(true);
  await page.locator('#detail-options-toggle').click();
  await page.locator('#change-process-toggle').click();
  await page.keyboard.press('Escape');
  await expect(field).toHaveAttribute('data-steady', 'true');
  await page.locator('#wave-mode').click();
  await page.locator('#separation').fill('54');
  await expect(field).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('[data-handle="source-1"]')).toHaveAttribute('data-world-y', String(.36 - .54 / 2));
  await page.locator('#reset').click();
  await page.locator('#detail-options-toggle').click();
  await expect(page.locator('#change-process-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('options and touch help fit portrait and short landscape, close accessibly and leave field geometry unchanged', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320, 640], [360, 640], [568, 320], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    await page.locator('#play').tap();
    const fieldBox = await page.locator('#field').boundingBox();
    const tools = await Promise.all(['#comparison-toggle', '#field-legend', '#detail-options-toggle'].map(s => page.locator(s).boundingBox()));
    for (const box of tools) {
      expect(box!.y).toBe(tools[0]!.y);
      expect(box!.height).toBe(tools[0]!.height);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const comparison = page.getByRole('button', { name: '경로 펼치기', exact: true });
    await comparison.tap();
    await expect(page.getByRole('button', { name: '경로 접기', exact: true })).toBeVisible();
    const expandedTools = await Promise.all(['#comparison-toggle', '#field-legend', '#detail-options-toggle'].map(s => page.locator(s).boundingBox()));
    expect(expandedTools).toEqual(tools);
    await page.screenshot({ path: `test-results/comparison-button-open-${width}.png` });
    await page.getByRole('button', { name: '경로 접기', exact: true }).tap();
    await expect(page.locator('#comparison-region')).toBeHidden();
    expect(await page.locator('#comparison-toggle').boundingBox()).toEqual(tools[0]);
    await expect(page.locator('[data-legend-label]')).toHaveText('−0+');
    await page.locator('#field-legend').tap();
    const palette = (await page.locator('#palette-options').boundingBox())!;
    expect(palette.x).toBeGreaterThanOrEqual(0); expect(palette.y).toBeGreaterThanOrEqual(0);
    expect(palette.x + palette.width).toBeLessThanOrEqual(width); expect(palette.y + palette.height).toBeLessThanOrEqual(height);
    await page.getByRole('button', { name: /푸른 물결/ }).tap();
    await expect(page.locator('#wave-field')).toHaveAttribute('data-palette', 'water');
    await page.locator('#detail-options-toggle').tap();
    const panel = page.locator('#detail-options-panel');
    await expect(panel).toBeVisible();
    for (const locator of [panel, page.locator('#change-process-toggle'), page.locator('#path-waves-toggle')]) {
      const box = (await locator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await page.getByRole('button', { name: '파동 변화 과정 생략 설명', exact: true }).tap();
    const tip = page.locator('#change-process-tip');
    await expect(tip).toBeVisible();
    const box = (await tip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.waitForTimeout(180);
    await page.screenshot({ path: `test-results/options-${width}.png` });
    await page.keyboard.press('Escape'); await expect(tip).toBeHidden();
    await expect(page.locator('#change-process-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#path-waves-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#path-waves-toggle').tap();
    await expect(page.locator('#path-waves-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
    await expect(page.locator('#detail-options-toggle')).toBeFocused();
    expect(await page.locator('#field').boundingBox()).toEqual(fieldBox);
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '상세 옵션 닫기', exact: true })).toBeFocused();
    await page.touchscreen.tap(2, height - 2); await expect(panel).toBeHidden();
    await page.screenshot({ path: `test-results/toolbar-${width}.png` });
  }
  await context.close();
});
