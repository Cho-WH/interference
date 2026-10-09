import { test, expect } from '@playwright/test';

test('expanded probe range uses top and bottom room and survives comparison and rotation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 667, height: 375 }); await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const overlay = page.locator('#field-overlay');
  const scale = Number(await overlay.getAttribute('data-distance-scale'));
  const time = await overlay.getAttribute('data-time-seconds');
  const probePosition = () => page.locator('[data-handle="probe"]').evaluate(e => {
    const t = (e as SVGGraphicsElement).transform.baseVal.getItem(0).matrix;
    return { x: t.e, y: t.f };
  });
  const field = (await page.locator('#field').boundingBox())!;
  // Both points lie beyond the old 0..0.72 m rectangle.
  await page.mouse.click(field.x + field.width / 2, field.y + 18);
  await expect.poll(async () => (await probePosition()).y).toBeCloseTo(18, 4);
  await page.locator('[data-handle="probe"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await probePosition()).y).toBeCloseTo(18 + .005 * scale, 4);
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
  expect((await probePosition()).y).toBeCloseTo(18 + .005 * scale, 4);
  expect(Number(await overlay.getAttribute('data-distance-scale'))).toBe(scale);
  const opened = (await page.locator('#field').boundingBox())!;
  await page.mouse.click(opened.x + opened.width / 2, opened.y + opened.height - 18);
  await expect.poll(async () => (await probePosition()).y).toBeCloseTo(opened.height - 18, 4);
  await page.screenshot({ path: 'test-results/expanded-probe-bottom.png' });
  const lengths = await page.evaluate(() => [1, 2].map(i => {
    const line = document.querySelector(`[data-spatial-path="source-${i}"]`)!;
    const base = document.querySelector(`[data-path-baseline="source-${i}"]`)!;
    const n = (e: Element, a: string) => Number(e.getAttribute(a));
    return { spatial: Math.hypot(n(line, 'x2') - n(line, 'x1'), n(line, 'y2') - n(line, 'y1')), comparison: n(base, 'x2') - n(base, 'x1') };
  }));
  lengths.forEach(l => expect(l.spatial).toBeCloseTo(l.comparison, 5));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => Number(await overlay.getAttribute('data-distance-scale'))).not.toBe(scale);
  await expect.poll(async () => (await probePosition()).y).toBeLessThanOrEqual(235);
  expect((await probePosition()).y).toBeGreaterThanOrEqual(16);
  expect(await overlay.getAttribute('data-time-seconds')).toBe(time);
  const landscapeScale = await overlay.getAttribute('data-distance-scale');
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(() => overlay.getAttribute('data-distance-scale')).not.toBe(landscapeScale);
  expect(await overlay.getAttribute('data-time-seconds')).toBe(time);
  expect(errors).toEqual([]);
});

test('short landscape keeps waves, comparison and controls in view without overlap or scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const [width, height] of [[568, 320], [667, 375], [780, 390], [844, 390], [932, 430], [1024, 500]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    const scale = await page.locator('#field-overlay').getAttribute('data-distance-scale');
    await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
    await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
    expect(await page.locator('#field-overlay').getAttribute('data-distance-scale')).toBe(scale);
    const geometry = await page.evaluate(() => {
      const box = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
      const controls = ['#play', '#comparison-toggle', '#wavelength', '#separation', '#field-legend', '#detail-options-toggle'];
      return { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight, pageWidth: document.documentElement.scrollWidth,
        field: box('#field'), wave: box('[data-wave-path="source-1"]'), sum: box('[data-marker="sum"]'),
        controls: controls.map(s => { const r = box(s), e = document.querySelector(s)!; const top = document.elementFromPoint((r.x + r.right) / 2, (r.y + r.bottom) / 2); return { ...r, clear: !!top && e.contains(top) }; }) };
    });
    expect(geometry.pageHeight, `${width}x${height}`).toBeLessThanOrEqual(height + 1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(width);
    expect(geometry.wave.x).toBeGreaterThanOrEqual(geometry.field.right);
    for (const r of [geometry.field, geometry.wave, geometry.sum, ...geometry.controls]) {
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width); expect(r.bottom).toBeLessThanOrEqual(height);
    }
    for (const control of geometry.controls) expect(control.clear).toBe(true);
    await page.screenshot({ path: `test-results/landscape-${width}x${height}.png` });
    await page.getByRole('button', { name: '간섭무늬', exact: true }).click();
    await page.locator('#wavelength').fill('20');
    await expect(page.locator('#field-status')).toContainText('변화 중');
    await expect(page.locator('#field-overlay')).toHaveAttribute('data-field-mode', 'amplitude');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height + 1);
  }
  expect(errors).toEqual([]);
});

test('landscape popovers fit the viewport and small portrait controls do not cover the comparison', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 }); await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.locator('#field-legend').click();
  let box = (await page.locator('#palette-options').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(568);
  await page.keyboard.press('Escape');
  await page.locator('.help summary').click();
  box = (await page.locator('.help-content').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(320);
  await page.locator('.help summary').click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
  const controls = (await page.locator('.control-panel').boundingBox())!;
  const comparison = (await page.locator('#comparison-region').boundingBox())!;
  expect(controls.y).toBeGreaterThanOrEqual(comparison.y + comparison.height);
});

test('rotation during unfolding keeps the paused instant and matching path lengths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const time = await page.locator('#field-overlay').getAttribute('data-time-seconds');
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(time);
  const lengths = await page.evaluate(() => {
    const length = (s: string) => { const e = document.querySelector<SVGLineElement>(s)!; const n = (a: string) => Number(e.getAttribute(a)); return Math.hypot(n('x2') - n('x1'), n('y2') - n('y1')); };
    return [1, 2].map(i => [length(`[data-spatial-path="source-${i}"]`), length(`[data-path-baseline="source-${i}"]`)]);
  });
  lengths.forEach(([a, b]) => expect(a).toBeCloseTo(b, 5));
  await page.getByRole('button', { name: '경로 접기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#comparison-region')).toBeHidden();
  await expect(page.locator('#comparison-overlay')).toBeVisible();
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(time);
});

test('close sources have a separate spacing handle and outside taps show the probe boundary', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }); await page.goto('/');
  await page.locator('#separation').fill('6');
  const gap = page.locator('[data-handle="source-gap"]');
  await expect(gap).toHaveAttribute('visibility', 'visible');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const box = (await gap.boundingBox())!;
  // The label extends the box downwards; the circular handle is at the top + 24.
  await page.mouse.move(box.x + box.width / 2, box.y + 24); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 5 });
  await page.mouse.up();
  expect(Number(await page.locator('#separation').inputValue())).toBeGreaterThan(6);
  const field = (await page.locator('#field').boundingBox())!;
  await page.mouse.click(field.x + field.width - 6, field.y + field.height / 2);
  await expect(page.locator('[data-probe-bounds]')).toHaveAttribute('visibility', 'visible');
  await expect(page.locator('#probe-boundary-hint')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#probe-boundary-hint')).toBeVisible();
  await expect(page.locator('[data-probe-bounds]')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('#probe-boundary-hint')).toBeHidden();
});
