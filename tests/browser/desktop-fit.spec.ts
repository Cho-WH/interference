import { test, expect } from '@playwright/test';

test('scaled FHD laptop viewports use the available width with readable controls and no expanded overflow', async ({ browser }) => {
  for (const { width, height, dpr } of [
    { width: 1280, height: 600, dpr: 1.5 },
    { width: 1280, height: 620, dpr: 1.5 },
    { width: 1280, height: 720, dpr: 1.5 },
    { width: 1536, height: 600, dpr: 1.25 },
    { width: 1536, height: 760, dpr: 1.25 },
    { width: 1536, height: 864, dpr: 1.25 },
    { width: 1920, height: 1080, dpr: 1 },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    const initialField = await page.locator('#field').boundingBox();
    await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
    await expect(page.locator('[data-view="comparison"]')).toHaveAttribute('data-progress', '1');
    expect(await page.locator('#field').boundingBox()).toEqual(initialField);
    const layout = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      font: parseFloat(getComputedStyle(document.querySelector('.parameter-label')!).fontSize),
      boxes: ['#field', '#comparison-region', '.control-panel', '.learning-footer', '#wavelength', '#separation', '#interference-condition'].map(selector => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    }));
    expect(layout.font).toBeGreaterThanOrEqual(14);
    expect(layout.scrollHeight).toBeLessThanOrEqual(height);
    for (const box of layout.boxes) {
      expect(box.left, box.selector).toBeGreaterThanOrEqual(0);
      expect(box.right, box.selector).toBeLessThanOrEqual(width);
      expect(box.top, box.selector).toBeGreaterThanOrEqual(0);
      expect(box.bottom, box.selector).toBeLessThanOrEqual(height);
    }
    await page.getByRole('button', { name: '상세 옵션', exact: true }).click();
    const popup = (await page.locator('#detail-options-panel').boundingBox())!;
    expect(popup.x + popup.width).toBeLessThanOrEqual(width);
    expect(popup.y + popup.height).toBeLessThanOrEqual(height);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
    await context.close();
  }
});
