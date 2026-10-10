import { test, expect } from '@playwright/test';

test('entry bundle failure leaves a readable reload action without depending on app code', async ({ page }) => {
  await page.route('**/src/app/bootstrap.ts', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('불러오지 못했어요');
  await expect(page.getByRole('link', { name: '새로고침' })).toBeVisible();
});

test('module loading failure offers a diagnostic and reload recovers from the failure', async ({ page }) => {
  await page.route('**/src/app/main.ts', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '시뮬레이터를 시작하지 못했어요.' })).toBeFocused();
  const report = JSON.parse(await page.getByLabel('오류 정보', { exact: true }).inputValue());
  expect(report.events.at(-1).event).toBe('startup-failed');
  await page.unroute('**/src/app/main.ts');
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', /webgl2|cpu/);
});

test('partial startup failure disconnects acquired resources and explains the failure', async ({ page }) => {
  await page.addInitScript(() => {
    const original = ResizeObserver.prototype.observe;
    ResizeObserver.prototype.observe = function (...args) {
      original.apply(this, args);
      throw new Error('observer startup fixture');
    };
    const disconnect = ResizeObserver.prototype.disconnect;
    (window as any).disconnections = 0;
    ResizeObserver.prototype.disconnect = function () { (window as any).disconnections++; disconnect.call(this); };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '시뮬레이터를 시작하지 못했어요.' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).disconnections)).toBe(1);
  await expect(page.locator('#wave-field')).toHaveCount(0);
  expect(await page.getByLabel('오류 정보', { exact: true }).inputValue()).toContain('observer startup fixture');
});

test('when both graphics backends are unavailable the app stops instead of leaving a blank field', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '시뮬레이터가 멈췄어요.' })).toBeVisible();
  expect(await page.getByLabel('오류 정보', { exact: true }).inputValue()).toContain('Canvas 2D is required');
  await expect(page.locator('#wave-field')).toHaveCount(0);
});

test('render failure stops animation, retains experiment diagnostics and supports manual copy', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('clipboard fixture')) } });
  });
  await page.goto('/');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'cpu');
  await page.locator('#wavelength').fill('18');
  await page.evaluate(() => {
    (window as any).failedPaints = 0;
    CanvasRenderingContext2D.prototype.putImageData = function () {
      (window as any).failedPaints++; throw new Error('paint fixture');
    };
  });
  await expect(page.getByRole('heading', { name: '시뮬레이터가 멈췄어요.' })).toBeVisible();
  const report = JSON.parse(await page.getByLabel('오류 정보', { exact: true }).inputValue());
  expect(report.experiment.model.wavelength).toBe(.18);
  expect(report.experiment.rendering.renderer).toBe('cpu');
  expect(report.events.at(-1).error.message).toBe('paint fixture');
  await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).failedPaints)).toBe(1);
  await page.getByRole('button', { name: '오류 정보 복사' }).click();
  await expect(page.getByRole('status')).toContainText('직접 복사');
  await expect(page.getByLabel('오류 정보', { exact: true })).toBeFocused();
});

test('input exceptions use the same boundary and copy diagnostics without sending a report', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as any).copiedReport = text; } } });
  });
  await page.goto('/');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', /webgl2|cpu/);
  await page.getByRole('button', { name: '일시 정지', exact: true }).evaluate(button => {
    button.setAttribute = () => { throw new Error('input fixture'); };
  });
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시뮬레이터가 멈췄어요.' })).toBeVisible();
  await page.getByRole('button', { name: '오류 정보 복사' }).click();
  await expect(page.getByRole('status')).toHaveText('오류 정보를 복사했어요.');
  const copied = await page.evaluate(() => (window as any).copiedReport);
  expect(JSON.parse(copied).events.at(-1).error.message).toBe('input fixture');
});

test('GPU extension failure recovers to CPU and is included in later fatal diagnostics', async ({ page }) => {
  await page.addInitScript(() => {
    const getExtension = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      if (name === 'EXT_disjoint_timer_query_webgl2') throw new Error('GPU extension fixture');
      return getExtension.call(this, name);
    };
  });
  await page.goto('/');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'cpu');
  await page.evaluate(() => { void Promise.reject(new Error('async fixture')); });
  await expect(page.getByRole('heading', { name: '시뮬레이터가 멈췄어요.' })).toBeVisible();
  const report = JSON.parse(await page.getByLabel('오류 정보', { exact: true }).inputValue());
  expect(report.events.map((entry: any) => entry.event)).toEqual(['gpu-initialization-failed', 'cpu-fallback', 'unhandled-rejection']);
  expect(report.events[0].error.message).toBe('GPU extension fixture');
  expect(report.events.at(-1).error.message).toBe('async fixture');
});

test('a popup cleanup exception still releases its document and window listeners', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createFloatingPanel } = await import('/src/ui/floating-panel.ts');
    const root = document.createElement('div'), trigger = document.createElement('button'), panel = document.createElement('div');
    root.append(trigger, panel); document.body.append(root);
    let closes = 0, repositioned = 0;
    const popup = createFloatingPanel(root, trigger, panel, {
      onClose() { closes++; throw new Error('popup cleanup fixture'); },
      onReposition() { repositioned++; },
    });
    let failure = '';
    try { popup.destroy(); } catch (error) { failure = (error as Error).message; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new Event('resize'));
    root.remove();
    return { closes, repositioned, failure };
  });
  expect(result).toEqual({ closes: 1, repositioned: 0, failure: 'popup cleanup fixture' });
});
