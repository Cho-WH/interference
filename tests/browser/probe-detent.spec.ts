import { test, expect } from '@playwright/test';
import { DEFAULT_LESSON } from '../../src/lesson/default-lesson';
import { LESSON_STORAGE_KEY } from '../../src/lesson/storage';

for (const teacher of [false, true]) for (const touch of [false, true]) test(`P catches only a crossed line, releases freely and never adjusts on release (${teacher ? 'teacher' : 'exploration'}, ${touch ? 'touch' : 'mouse'})`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch });
  const page = await context.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(teacher ? '/?mode=teacher' : '/');
  if (teacher) {
    await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
    await page.getByRole('button', { name: '도구', exact: true }).click();
    await page.getByRole('slider', { name: 'P 세로 위치', exact: true }).fill('36');
    await page.getByRole('button', { name: '닫기 · Esc', exact: true }).click();
    await expect(page.locator('.teacher-shell')).toHaveAttribute('data-probe-y', '0.36');
  } else await page.locator('#play').click();
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
  await pointer('move', center.y + 7); await atY(center.y);
  await pointer('move', center.y + 10);
  await expect.poll(async () => (await position()).y - center.y).toBeGreaterThan(1);
  expect((await position()).y - center.y).toBeLessThan(10);
  const partialRelease = await position();
  await pointer('up', center.y + 10); await atY(partialRelease.y);
  await pointer('down', center.y - 2);
  await pointer('move', center.y + 1); await atY(center.y);
  await pointer('move', center.y + 13); await atY(center.y + 13);
  await pointer('move', center.y - 1); await atY(center.y - 1);
  await pointer('up', center.y - 1); await atY(center.y - 1);
  // Transients disable the detent, even though the geometric center is unchanged.
  if (teacher) {
    await page.getByRole('button', { name: '도구', exact: true }).click();
    await page.getByRole('slider', { name: '파장 λ', exact: true }).fill('20');
    await page.getByRole('button', { name: '닫기 · Esc', exact: true }).click();
    await expect(page.locator('.teacher-shell')).toHaveAttribute('data-analysis-steady', 'false');
  } else {
    await page.locator('#wavelength').fill('20');
    await expect(page.locator('#field-overlay')).toHaveAttribute('data-steady', 'false');
  }
  await pointer('down', center.y - 2); await pointer('move', center.y + 1);
  await atY(center.y + 1); await pointer('up', center.y + 1);
  expect(errors).toEqual([]);
  await context.close();
});

for (const policy of ['predict-from-paths', 'predict-sum'] as const) {
  test(`teacher ${policy} disables catches, exploration enables them and returning disables them again`, async ({ page }) => {
    const lesson = structuredClone(DEFAULT_LESSON);
    lesson.scenes[0].cues[0].revealPolicy = policy;
    await page.addInitScript(({ key, lesson }) => localStorage.setItem(key, JSON.stringify(lesson)), { key: LESSON_STORAGE_KEY, lesson });
    await page.goto('/?mode=teacher');
    await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
    const probe = page.locator('[data-handle="probe"]');
    async function cross(catches: boolean) {
      await expect(page.locator('.teacher-shell')).toHaveAttribute('data-transitioning', 'false');
      const center = await page.locator('.teacher-field-overlay').evaluate(svg => {
        const at = (id: string) => svg.querySelector<SVGGraphicsElement>(`[data-handle="${id}"]`)!.getScreenCTM()!;
        return { x: at('probe').e, y: (at('source-1').f + at('source-2').f) / 2 };
      });
      await page.mouse.move(center.x, center.y - 2); await page.mouse.down();
      await page.mouse.move(center.x, center.y + 1);
      await expect.poll(() => probe.evaluate((el: SVGGraphicsElement) => el.getScreenCTM()!.f)).toBeCloseTo(center.y + (catches ? 0 : 1), 2);
      await page.mouse.up();
    }
    await cross(false);
    await page.getByRole('button', { name: '도구', exact: true }).click();
    await page.getByRole('button', { name: '잠시 자유 조작', exact: true }).click();
    await expect(page.locator('.teacher-shell')).toHaveAttribute('data-exploring', 'true');
    await cross(true);
    await page.getByRole('button', { name: '도구', exact: true }).click();
    await page.getByRole('button', { name: '현재 조건으로 수업 복귀', exact: true }).click();
    await expect(page.locator('.teacher-shell')).toHaveAttribute('data-exploring', 'false');
    await cross(false);
  });
}
