import { test, expect, type Page } from '@playwright/test';

const comparison = '[data-view="comparison"]';
const phase = (page: Page) => page.locator(comparison).getAttribute('data-temporal-phase').then(Number);
async function openComparison(page: Page) {
  await page.getByRole('button', { name: '경로 비교', exact: true }).click();
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
}
async function assertCorrespondence(page: Page) {
  const result = await page.locator(comparison).evaluate(root => {
    const num = (selector: string, name: string) => Number(root.querySelector(selector)!.getAttribute(name));
    const rows = ['source-1', 'source-2'];
    return {
      start: rows.map(id => num(`[data-source-row="${id}"]`, 'data-start-x')),
      scale: rows.map(id => num(`[data-source-row="${id}"]`, 'data-path-scale')),
      links: rows.map(id => [num(`[data-path-end="${id}"]`, 'cy'), num(`[data-endpoint-link="${id}"]`, 'y1'), num(`[data-endpoint-link="${id}"]`, 'y2'), num(`[data-displacement-point="${id}"]`, 'cy')]),
      x: [...rows, 'sum'].map(id => num(`[data-displacement-point="${id}"]`, 'cx')),
      values: [...rows, 'sum'].map(id => num(`[data-marker="${id}"]`, 'data-displacement')),
      scales: [...rows, 'sum'].map(id => num(`[data-marker="${id}"]`, 'data-displacement-scale')),
    };
  });
  expect(result.start[0]).toBeCloseTo(result.start[1], 9);
  expect(result.scale[0]).toBeCloseTo(result.scale[1], 9);
  for (const link of result.links) for (const value of link) expect(value).toBeCloseTo(link[0], 8);
  for (const x of result.x) expect(x).toBeCloseTo(result.x[0], 8);
  for (const s of result.scales) expect(s).toBeCloseTo(result.scales[0], 8);
  expect(result.values[2]).toBeCloseTo(result.values[0] + result.values[1], 9);
}

test('playback, continuous unfolding, view switch, keyboard and input stay connected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '파동의 간섭' })).toBeVisible();
  await page.getByRole('button', { name: '경로 비교', exact: true }).click();
  await expect.poll(async () => Number(await page.locator(comparison).getAttribute('data-progress'))).toBeGreaterThan(0);
  const unfoldingPhase = await phase(page);
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
  expect(await phase(page)).toBeGreaterThan(unfoldingPhase);
  await assertCorrespondence(page);
  const first = await phase(page);
  await expect.poll(() => phase(page)).toBeGreaterThan(first);
  await page.getByRole('button', { name: '간섭무늬', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const fixedPattern = await page.locator('#wave-field').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const patternPhase = await phase(page);
  await expect.poll(() => phase(page)).toBeGreaterThan(patternPhase + .2);
  expect(await page.locator('#wave-field').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(fixedPattern);
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const stopped = await phase(page);
  await page.getByRole('button', { name: '간섭무늬', exact: true }).click();
  await page.waitForTimeout(120);
  expect(await phase(page)).toBe(stopped);
  await page.locator('[data-handle="probe"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#path-difference')).not.toHaveText('0.0 cm');
  expect(await phase(page)).toBe(stopped);
  await page.locator('#wavelength').fill('20');
  await expect(page.locator('#wavelength-value')).toHaveText('20 cm');
  expect(await phase(page)).toBe(stopped);
  await page.getByRole('button', { name: '경로 접기', exact: true }).click();
  await expect(page.locator('#comparison-region')).toBeHidden();
  await openComparison(page);
  expect(await phase(page)).toBe(stopped);
  await assertCorrespondence(page);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(() => phase(page)).toBeGreaterThan(stopped);
  expect(errors).toEqual([]);
});

test('equal, half-wave and full-wave differences preserve geometry and cancellation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await openComparison(page);
  await expect(page.locator(comparison)).toHaveAttribute('data-long-source', 'equal');
  await expect(page.locator('[data-extra-path="source-1"]')).toHaveAttribute('visibility', 'hidden');
  // On the line between sources, |Δr| = 2|y − .36|.
  await page.locator('[data-handle="probe"]').focus();
  for (let i = 0; i < 22; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(page.locator('#path-ratio')).toHaveText('0.50λ');
  await expect(page.locator('#interference-condition')).toContainText('진동하지 않아요');
  await assertCorrespondence(page);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  const firstComponent = Number(await page.locator('[data-marker="source-1"]').getAttribute('data-displacement'));
  await expect.poll(async () => Number(await page.locator('[data-marker="source-1"]').getAttribute('data-displacement'))).not.toBe(firstComponent);
  expect(Math.abs(Number(await page.locator('[data-marker="sum"]').getAttribute('data-displacement')))).toBeLessThan(1e-10);
  await page.locator('#separation').fill('32');
  await page.locator('[data-handle="probe"]').focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(page.locator('#path-ratio')).toHaveText('1.00λ');
  await expect(page.locator('#interference-condition')).toContainText('보강 간섭');
  await expect(page.locator('[data-extra-path="source-2"]')).toHaveAttribute('visibility', 'visible');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator(comparison)).toHaveAttribute('data-long-source', 'source-1');
  await assertCorrespondence(page);
});

test('mobile touch and reduced-motion preserve readable comparison', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await openComparison(page);
  await assertCorrespondence(page);
  const box = await page.locator('#field-overlay').boundingBox();
  await page.touchscreen.tap(box!.x + box!.width * .7, box!.y + box!.height * .65);
  await expect(page.locator('#first-use-hint')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.screenshot({ path: 'test-results/mobile-comparison.png', fullPage: true });
  await context.close();
});

test('desktop dragging updates probe and source separation without replacing selected elements', async ({ page }) => {
  await page.goto('/');
  await openComparison(page);
  const probe = page.locator('[data-handle="probe"]');
  const box = await probe.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 50, box!.y + box!.height / 2 + 55, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#first-use-hint')).toBeHidden();
  const source = page.locator('[data-handle="source-1"]');
  await source.focus();
  const before = Number(await page.locator('#separation').inputValue());
  await page.keyboard.press('ArrowUp');
  expect(Number(await page.locator('#separation').inputValue())).toBeGreaterThan(before);
  await expect(source).toBeFocused();
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await assertCorrespondence(page);
  await page.screenshot({ path: 'test-results/desktop-comparison.png', fullPage: true });
});

async function inspectPixelScales(page: Page) {
  return page.evaluate(() => {
    function length(selector: string) {
      const line = document.querySelector<SVGLineElement>(selector)!;
      const matrix = line.getScreenCTM()!;
      const a = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(matrix);
      const b = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(matrix);
      return Math.hypot(b.x - a.x, b.y - a.y);
    }
    const field = document.querySelector('#field-overlay')!;
    const comparison = document.querySelector('[data-view="comparison"]')!;
    const mark = document.querySelector<SVGPathElement>('[data-wavelength-mark]')!;
    return {
      lengths: ['source-1', 'source-2'].map(id => [length(`[data-spatial-path="${id}"]`), length(`[data-path-baseline="${id}"]`)]),
      fieldScale: Number(field.getAttribute('data-distance-scale')),
      comparisonScale: Number(comparison.getAttribute('data-distance-scale')),
      fieldWavelength: Number(field.getAttribute('data-wavelength-pixels')),
      markerWavelength: mark.getTotalLength() - 12,
    };
  });
}
function expectMatchingPixels(measurement: Awaited<ReturnType<typeof inspectPixelScales>>) {
  for (const [spatial, unfolded] of measurement.lengths) expect(unfolded).toBeCloseTo(spatial, 4);
  expect(measurement.comparisonScale).toBe(measurement.fieldScale);
  expect(measurement.markerWavelength).toBeCloseTo(measurement.fieldWavelength, 3);
}

test('spatial and comparison pixels match through unfolding, movement, inputs and resize', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const initialScale = Number(await page.locator('#field-overlay').getAttribute('data-distance-scale'));
  await page.getByRole('button', { name: '경로 비교', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[data-view="comparison"]')?.getAttribute('data-progress')) > .1);
  expectMatchingPixels(await inspectPixelScales(page));
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
  expectMatchingPixels(await inspectPixelScales(page));
  await page.locator('[data-handle="probe"]').focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.locator('#wavelength').fill('24');
  await page.locator('#separation').fill('54');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const moved = await inspectPixelScales(page);
  expectMatchingPixels(moved);
  expect(moved.fieldScale).toBe(initialScale);
  for (const viewport of [{width:390,height:844}, {width:360,height:800}, {width:320,height:740}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expectMatchingPixels(await inspectPixelScales(page));
  }
});

test('expanded scenes, result and sliders remain in the viewport on laptop and phone', async ({ page }) => {
  for (const viewport of [{width:1366,height:768},{width:390,height:844},{width:360,height:800}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await openComparison(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const boxes = await page.evaluate(() => ['#field','#comparison-region','#wavelength','#separation','#interference-condition'].map(selector => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return {selector, top:box.top,bottom:box.bottom,left:box.left,right:box.right,viewHeight:innerHeight,viewWidth:innerWidth};
    }));
    for (const box of boxes) {
      expect(box.top, box.selector).toBeGreaterThanOrEqual(0);
      expect(box.bottom, box.selector).toBeLessThanOrEqual(box.viewHeight);
      expect(box.left, box.selector).toBeGreaterThanOrEqual(0);
      expect(box.right, box.selector).toBeLessThanOrEqual(box.viewWidth);
    }
  }
});

test('overlapping source hit areas pick the nearest source center', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.locator('#separation').fill('6');
  // Range input updates the model immediately; SVG positions update on the next frame.
  // Read drag coordinates only once the visible source separation is actually 6 cm.
  await expect.poll(() => page.evaluate(() => {
    const a = document.querySelector('[data-handle="source-1"]')!.getBoundingClientRect();
    const b = document.querySelector('[data-handle="source-2"]')!.getBoundingClientRect();
    const scale = Number(document.querySelector('#field-overlay')!.getAttribute('data-distance-scale'));
    return (b.y - a.y) / scale;
  })).toBeCloseTo(.06, 5);
  const source = page.locator('[data-handle="source-1"]');
  const box = await source.boundingBox();
  await page.mouse.move(box!.x + box!.width/2, box!.y + box!.height/2);
  await page.mouse.down();
  await expect(source).toBeFocused();
  await page.mouse.move(box!.x + box!.width/2, box!.y + box!.height/2 - 18, {steps:4});
  await page.mouse.up();
  expect(Number(await page.locator('#separation').inputValue())).toBeGreaterThan(6);
  await expect(source).toBeFocused();
});
