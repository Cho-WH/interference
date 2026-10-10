import { test, expect } from '@playwright/test';

for (const mode of [
  { name: 'simulation', url: '/', canvas: '#wave-field', clock: '#field-overlay', play: '일시 정지' },
  { name: 'teacher', url: '/?mode=teacher', canvas: '.teacher-background canvas', clock: '.teacher-shell', play: '파동 일시 정지 (K)' },
]) {
  test(`built ${mode.name} starts and renders live frames`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(mode.url);
    expect(response?.ok()).toBe(true);
    await expect(page.locator(mode.canvas)).toBeVisible();
    await expect(page.locator(mode.canvas)).toHaveAttribute('data-renderer', /^(webgl2|cpu)$/);
    await expect(page.getByRole('button', { name: mode.play, exact: true })).toBeVisible();
    const clock = page.locator(mode.clock);
    await expect(clock).toHaveAttribute('data-time-seconds', /\d/);
    const initial = Number(await clock.getAttribute('data-time-seconds'));
    await expect.poll(async () => Number(await clock.getAttribute('data-time-seconds'))).toBeGreaterThan(initial);
    expect(errors).toEqual([]);
  });
}
