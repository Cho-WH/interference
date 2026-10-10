import { test, expect } from '@playwright/test';

test('stepped playback changes the shared time, stays paused on edits and survives reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await page.getByRole('button', { name: '상세 옵션', exact: true }).click();
  const slider = page.getByRole('slider', { name: '재생 속도', exact: true });
  await expect(slider).toHaveValue('2');
  await expect(slider).toHaveAttribute('step', '1');
  for (const [index, rate] of [.25, .5, 1, 1.5, 2].entries()) {
    await slider.fill(String(index));
    await expect(slider).toHaveAttribute('aria-valuetext', `${rate}배속`);
    await expect(page.locator('#playback-rate-value')).toHaveText(`${rate}×`);
    const measured = await page.evaluate(() => new Promise<{ ratio: number; aligned: boolean }>(resolve => {
      const field = document.querySelector('#field-overlay')!;
      const comparison = document.querySelector('[data-view="comparison"]')!;
      requestAnimationFrame(start => {
        const initial = Number(field.getAttribute('data-time-seconds'));
        let aligned = true;
        function sample(now: number) {
          const time = Number(field.getAttribute('data-time-seconds'));
          aligned &&= time === Number(comparison.getAttribute('data-time-seconds'));
          if (now - start < 600) requestAnimationFrame(sample);
          else resolve({ ratio: (time - initial) / ((now - start) / 1000), aligned });
        }
        requestAnimationFrame(sample);
      });
    }));
    expect(measured.ratio).toBeGreaterThan(rate * .85);
    expect(measured.ratio).toBeLessThan(rate * 1.15);
    expect(measured.aligned).toBe(true);
  }
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.getByRole('button', { name: '상세 옵션', exact: true }).click();
  const before = await page.locator('#field-overlay').getAttribute('data-time-seconds');
  await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.5배속');
  await page.waitForTimeout(120);
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(before);
  await page.getByRole('button', { name: '처음으로', exact: true }).click();
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-time-seconds', '0');
  await page.getByRole('button', { name: '상세 옵션', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await expect(slider).toHaveAttribute('aria-valuetext', '0.5배속');
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
});
