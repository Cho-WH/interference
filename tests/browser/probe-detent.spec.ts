import { test, expect } from '@playwright/test';

for (const touch of [false, true]) test(`P catches only a crossed line, releases freely and never adjusts on release (${touch ? 'touch' : 'mouse'})`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#play').click();
  const probe = page.locator('[data-handle="probe"]');
  const position = () => probe.evaluate((element: SVGGraphicsElement) => {
    const m = element.getScreenCTM()!; return { x: m.e, y: m.f };
  });
  await expect(probe).toHaveAttribute('transform', /translate/);
  const center = await position();
  const cdp = await context.newCDPSession(page);
  const pointer = async (action: 'down' | 'move' | 'up', y: number) => {
    if (touch) await cdp.send('Input.dispatchTouchEvent', {
      type: action === 'down' ? 'touchStart' : action === 'move' ? 'touchMove' : 'touchEnd',
      touchPoints: action === 'up' ? [] : [{ x: center.x, y, id: 1 }],
    });
    else if (action === 'down') { await page.mouse.move(center.x, y); await page.mouse.down(); }
    else if (action === 'up') await page.mouse.up();
    else await page.mouse.move(center.x, y);
  };
  const atY = async (y: number) => expect.poll(async () => Math.abs((await position()).y - y)).toBeLessThan(.01);
  // Crossing the equal-distance constructive line catches exactly at its center.
  await pointer('down', center.y - 7); await atY(center.y - 7);
  await pointer('move', center.y - 1); await atY(center.y - 1);
  await pointer('move', center.y + 1); await atY(center.y);
  await pointer('up', center.y + 1); await atY(center.y);
  // A click/tap beside it is never attracted.
  await pointer('down', center.y + 1); await atY(center.y + 1);
  await pointer('up', center.y + 1); await atY(center.y + 1);
  await pointer('down', center.y - 2);
  await pointer('move', center.y + 1); await atY(center.y);
  await pointer('move', center.y + 5); await atY(center.y);
  await pointer('move', center.y + 7.5);
  await expect.poll(async () => (await position()).y - center.y).toBeGreaterThan(1);
  expect((await position()).y - center.y).toBeLessThan(7.5);
  const partialRelease = await position();
  await pointer('up', center.y + 7.5); await atY(partialRelease.y);
  await pointer('down', center.y - 2);
  await pointer('move', center.y + 1); await atY(center.y);
  await pointer('move', center.y + 10); await atY(center.y + 10);
  await pointer('move', center.y - 1); await atY(center.y - 1);
  await pointer('up', center.y - 1); await atY(center.y - 1);
  // Transients disable the detent, even though the geometric center is unchanged.
  await page.locator('#wavelength').fill('20');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'false');
  await pointer('down', center.y - 2); await pointer('move', center.y + 1);
  await atY(center.y + 1); await pointer('up', center.y + 1);
  expect(errors).toEqual([]);
  await context.close();
});
