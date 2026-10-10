import { test, expect, type Page } from '@playwright/test';

const comparison = '[data-view="comparison"]';
const guide = '[data-same-distance-guide]';
const ruler = '[data-path-difference-ruler]';

for (const teacher of [false, true]) {
  test(`stationary wavelength reference matches one ruler unit in ${teacher ? 'teacher' : 'exploration'} mode`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(teacher ? '/?mode=teacher' : '/');
    if (teacher) {
      await page.getByRole('button', { name: '1 / 8 · 전체 현상', exact: true }).click();
      await page.getByRole('button', { name: '파장으로 비교', exact: true }).click();
    } else await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
    const reference = page.locator('[data-wavelength-mark] [data-ruler-reference-wave]');
    await expect(reference).toBeVisible();
    await expect(page.locator(`${ruler} [data-ruler-reference-wave]`)).toBeVisible();
    const shape = await reference.evaluate(el => {
      const parent = el.parentElement!, band = parent.querySelector('[data-ruler-band]')!;
      const points = [...el.getAttribute('d')!.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
      return { points, start: Number(band.getAttribute('x')), wavelength: Number(parent.getAttribute('data-wavelength-pixels')),
        zero: Number(parent.getAttribute('data-zero-y')), opacity: Number(el.getAttribute('stroke-opacity')) };
    });
    const first = shape.points[0], last = shape.points.at(-1)!;
    expect(last.x - first.x).toBeCloseTo(shape.wavelength, 2);
    expect(first.y).toBeCloseTo(shape.zero, 2); expect(last.y).toBeCloseTo(shape.zero, 2);
    const crest = shape.points.reduce((a, b) => a.y < b.y ? a : b);
    const trough = shape.points.reduce((a, b) => a.y > b.y ? a : b);
    expect(Math.abs(crest.x - shape.start - shape.wavelength / 4)).toBeLessThan(3);
    expect(Math.abs(trough.x - crest.x - shape.wavelength / 2)).toBeLessThan(3);
    expect(shape.opacity).toBeGreaterThan(0); expect(shape.opacity).toBeLessThan(1);
    const curve = await reference.getAttribute('d');
    const main = page.locator(comparison), time = Number(await main.getAttribute('data-time-seconds'));
    await expect.poll(async () => Number(await main.getAttribute('data-time-seconds'))).toBeGreaterThan(time + .1);
    await expect(reference).toHaveAttribute('d', curve!);
  });
}

// Vertical SVG lines have zero-width boxes, so Playwright's visibility check
// cannot distinguish a drawn line from a hidden one.
const guideDrawn = (page: Page) => page.locator(guide).evaluate(line => {
  if (getComputedStyle(line).visibility !== 'visible') return false;
  for (let node: Element | null = line; node; node = node.parentElement) {
    if (getComputedStyle(node).display === 'none') return false;
  }
  return true;
});

async function unequalPaths(page: Page) {
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.locator('[data-handle="probe"]').focus();
  for (let i = 0; i < 22; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowUp');
}

test('initial equal paths keep their vibrating connector after unfolding and reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
  await expect(page.locator(comparison)).toHaveAttribute('data-long-source', 'equal');
  expect(await guideDrawn(page)).toBe(true);
  await expect(page.locator(ruler)).toBeVisible();
  await expect(page.locator(`${ruler} [data-ruler-highlight]`)).toBeHidden();
  await expect(page.locator('[data-long-distance-guide]')).toHaveAttribute('visibility', 'hidden');
  const rulerTicks = await page.locator(`${ruler} [data-ruler-divisions]`).getAttribute('d');
  const y = await page.locator(guide).getAttribute('y1');
  await expect.poll(() => page.locator(guide).getAttribute('y1')).not.toBe(y);
  expect(await page.locator(`${ruler} [data-ruler-divisions]`).getAttribute('d')).toBe(rulerTicks);
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const endpoints = await page.evaluate(() => {
    const n = (selector: string, attr: string) => Number(document.querySelector(selector)!.getAttribute(attr));
    return { ends: [n('[data-path-end="source-1"]', 'cy'), n('[data-path-end="source-2"]', 'cy')].sort(),
      guide: [n('[data-same-distance-guide]', 'y1'), n('[data-same-distance-guide]', 'y2')].sort() };
  });
  endpoints.guide.forEach((y, i) => expect(y).toBeCloseTo(endpoints.ends[i], 6));
  await page.screenshot({ path: 'test-results/equal-path-connector.png', fullPage: true });
  await page.getByRole('button', { name: '처음으로', exact: true }).click();
  expect(await guideDrawn(page)).toBe(true);
  await page.getByRole('button', { name: '경로 접기', exact: true }).click();
  await expect.poll(() => guideDrawn(page)).toBe(false);
});

test('path preview shares the unfolding wave and hides all settled guides during transitions', async ({ page }) => {
  await page.goto('/');
  await unequalPaths(page);
  await page.locator('#detail-options-toggle').click();
  const toggle = page.getByRole('button', { name: '경로에 파형 표시', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#comparison-overlay')).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-wave-path="source-1"]')).toBeVisible();
  await expect(page.locator('#comparison-region')).toBeHidden();
  expect(await guideDrawn(page)).toBe(false);
  await expect(page.locator(ruler)).toBeHidden();
  await page.screenshot({ path: 'test-results/path-preview.png', fullPage: true });
  const wave = await page.locator('[data-wave-path="source-1"]').getAttribute('d');
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect.poll(async () => Number(await page.locator(comparison).getAttribute('data-progress'))).toBeGreaterThan(.05);
  expect(await guideDrawn(page)).toBe(false);
  await expect(page.locator('[data-same-distance-point]')).toBeHidden();
  await expect(page.locator('[data-marker="sum"]')).toBeHidden();
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
  expect(await guideDrawn(page)).toBe(true);
  await expect(page.locator(ruler)).toBeVisible();
  await page.screenshot({ path: 'test-results/comparison-ruler.png', fullPage: true });
  await page.getByRole('button', { name: '경로 접기', exact: true }).click();
  await expect.poll(() => guideDrawn(page)).toBe(false);
  await expect(page.locator('[data-same-distance-point]')).toBeHidden();
  await expect(page.locator('#comparison-region')).toBeHidden();
  await expect(page.locator('[data-wave-path="source-1"]')).toHaveAttribute('d', wave!);
  expect(await guideDrawn(page)).toBe(false);
  await page.locator('#detail-options-toggle').click();
  await toggle.click();
  await expect(page.locator('#comparison-overlay')).toBeHidden();
});

test('fixed half-wave ruler highlights the exact difference between both endpoint bars on every layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await unequalPaths(page);
  await page.getByRole('button', { name: '경로 펼치기', exact: true }).click();
  await expect(page.locator(comparison)).toHaveAttribute('data-progress', '1');
  for (const viewport of [{ width: 1366, height: 768 }, { width: 360, height: 800 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    for (const direction of ['ArrowUp', 'ArrowDown']) {
      await page.locator('[data-handle="probe"]').focus();
      for (let i = 0; i < 36; i++) await page.keyboard.press(`Shift+${direction}`);
      await expect(page.locator(comparison)).toHaveAttribute('data-long-source', direction === 'ArrowUp' ? 'source-2' : 'source-1');
      const geometry = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector<SVGGraphicsElement>(selector)!.getBBox();
        const num = (selector: string, name: string) => Number(document.querySelector(selector)!.getAttribute(name));
        const ruler = box('[data-path-difference-ruler] [data-ruler-band]');
        const shade = box('[data-path-difference-ruler] [data-ruler-highlight]');
        const mark = box('[data-wavelength-mark] [data-ruler-band]');
        const endpoints = [1, 2].map(i => num(`[data-path-end="source-${i}"]`, 'cx'));
        const d = document.querySelector('[data-wavelength-mark] [data-ruler-divisions]')!.getAttribute('d')!;
        // Reference end divisions span λ, with a smaller λ/2 tick.
        const ticks = [...d.matchAll(/M([\d.e+-]+),([\d.e+-]+)v([\d.e+-]+)/g)].map(m => [Number(m[1]), Number(m[3])]);
        return { start: ruler.x, end: ruler.x + ruler.width, length: ruler.width,
          middle: ruler.y + ruler.height / 2,
          rowMiddle: (num('[data-source-row="source-1"]', 'data-zero-y') + num('[data-source-row="source-2"]', 'data-zero-y')) / 2,
          pointX: num('[data-endpoint-link="source-1"]', 'x2'),
          shade: { x: shade.x, end: shade.x + shade.width, y: shade.y, height: shade.height },
          shortBarX: num('[data-same-distance-guide]', 'x1'), longBarX: num('[data-long-distance-guide]', 'x1'),
          longBarYs: [num('[data-long-distance-guide]', 'y1'), num('[data-long-distance-guide]', 'y2')].sort((a, b) => a - b),
          endYs: [1, 2].map(i => num(`[data-path-end="source-${i}"]`, 'cy')).sort((a, b) => a - b),
          minorTicks: [...document.querySelector('[data-path-difference-ruler] [data-ruler-halves]')!.getAttribute('d')!.matchAll(/M([\d.e+-]+),/g)].map(m => Number(m[1])),
          endpoints, reference: mark.width, wavelength: num('#field-overlay', 'data-wavelength-pixels'), ticks,
          halfX: box('[data-wavelength-mark] [data-ruler-halves]').x };
      });
      expect(geometry.start).toBeCloseTo(Math.min(...geometry.endpoints), 4);
      expect(geometry.end).toBeCloseTo(geometry.pointX, 4);
      expect(geometry.middle).toBeCloseTo(geometry.rowMiddle, 4);
      expect(geometry.shade.x).toBeCloseTo(Math.min(...geometry.endpoints), 4);
      expect(geometry.shade.end).toBeCloseTo(Math.max(...geometry.endpoints), 4);
      expect(geometry.shade.y + geometry.shade.height / 2).toBeCloseTo(geometry.rowMiddle, 4);
      expect(geometry.shade.height).toBeLessThanOrEqual(12);
      expect(geometry.shortBarX).toBeCloseTo(geometry.shade.x, 4);
      expect(geometry.longBarX).toBeCloseTo(geometry.shade.end, 4);
      geometry.longBarYs.forEach((y, i) => expect(y).toBeCloseTo(geometry.endYs[i], 4));
      expect(geometry.minorTicks[0] - geometry.start).toBeCloseTo(geometry.wavelength / 2, 4);
      for (let i = 1; i < geometry.minorTicks.length; i++) expect(geometry.minorTicks[i] - geometry.minorTicks[i - 1]).toBeCloseTo(geometry.wavelength, 4);
      expect(geometry.length).toBeGreaterThan(geometry.wavelength);
      expect(geometry.reference).toBeCloseTo(geometry.wavelength, 4);
      expect(geometry.ticks).toHaveLength(2);
      expect(geometry.halfX - geometry.ticks[0][0]).toBeCloseTo(geometry.wavelength / 2, 4);
      expect(geometry.ticks[1][0] - geometry.halfX).toBeCloseTo(geometry.wavelength / 2, 4);
    }
    await page.screenshot({ path: `test-results/fixed-ruler-${viewport.width}.png`, fullPage: true });
  }
  await page.screenshot({ path: 'test-results/mobile-ruler.png', fullPage: true });
});

test('panel height animates without rescaling waves and guides fade only while paths are aligned', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const sampleTransition = () => page.evaluate(() => new Promise<Array<{ height: number; opacity: number; progress: number; time: number }>>(resolve => {
    const samples: Array<{ height: number; opacity: number; progress: number; time: number }> = [];
    const opening = document.querySelector('#comparison-toggle')!.getAttribute('aria-expanded') === 'false';
    (document.querySelector('#comparison-toggle') as HTMLButtonElement).click();
    function sample() {
      const region = document.querySelector('#comparison-region')!;
      const group = document.querySelector('[data-view="comparison"]')!;
      const guides = document.querySelector('[data-comparison-settled]')!;
      const height = region.getBoundingClientRect().height;
      const opacity = Number(guides.getAttribute('opacity') ?? 0);
      const progress = Number(group.getAttribute('data-progress'));
      const time = Number(document.querySelector('#field-overlay')!.getAttribute('data-time-seconds'));
      samples.push({ height, opacity, progress, time });
      if (samples.length > 1 && (opening ? progress === 1 && opacity === 1 : height === 0)) resolve(samples);
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  const opened = await sampleTransition();
  const fullHeight = opened.at(-1)!.height;
  expect(opened.filter(s => s.height > 5 && s.height < fullHeight - 5).length).toBeGreaterThan(5);
  expect(opened.some(s => s.opacity > .05 && s.opacity < .95)).toBe(true);
  for (const s of opened) if (s.opacity > 0) expect(s.progress).toBe(1);
  const closed = await sampleTransition();
  expect(closed.some(s => s.opacity > .05 && s.opacity < .95)).toBe(true);
  expect(closed.filter(s => s.height > 5 && s.height < fullHeight - 5).length).toBeGreaterThan(5);
  for (const s of closed) if (s.progress < 1) expect(s.opacity).toBe(0);
  for (let i = 1; i < opened.length; i++) expect(opened[i].height).toBeGreaterThanOrEqual(opened[i - 1].height);
  for (let i = 1; i < closed.length; i++) expect(closed[i].height).toBeLessThanOrEqual(closed[i - 1].height);
  expect(new Set([...opened, ...closed].map(s => s.time)).size).toBe(1);
  await expect(page.locator('[data-extra-path]')).toHaveCount(0);
});
