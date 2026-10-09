import { test, expect } from '@playwright/test';

test('GPU fields match CPU reference through edits, motion, retained frames and long runtimes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { createModel } = await import('/src/model/state.ts');
    const { createRetardedEngine } = await import('/src/physics/retarded-engine.ts');
    const { createWebGLField } = await import('/src/rendering/webgl-field.ts');
    const { paletteTable } = await import('/src/visual/field-palettes.ts');
    const canvas = document.createElement('canvas'), renderer = createWebGLField(canvas);
    if (!renderer) return { supported: false, max: 999, mean: 999, error: -1 };
    const gl = canvas.getContext('webgl2')!;
    const model = createModel(), engine = createRetardedEngine(model);
    const frames = [engine.read(model.probe)];
    engine.advanceTo(1); engine.setWavelength(.06); frames.push(engine.read(model.probe));
    engine.advanceTo(2.8); frames.push(engine.read(model.probe));
    engine.setSourceTargets([{ x: .2, y: .1 }, { x: .6, y: .6 }]);
    engine.advanceTo(4); frames.push(engine.read(model.probe));
    engine.setWavelength(.3);
    engine.setSourceTargets([{ x: .5, y: .33 }, { x: .3, y: .39 }]);
    engine.advanceTo(5.5); frames.push(engine.read(model.probe));
    engine.advanceTo(20); frames.push(engine.read(model.probe));
    engine.advanceTo(100000); engine.setWavelength(.06);
    engine.setSourceTargets([{ x: .4, y: .09 }, { x: .4, y: .63 }]);
    engine.advanceTo(100001.8); frames.push(engine.read(model.probe));
    engine.reset(model); frames.push(engine.read(model.probe));
    let max = 0, sum = 0, samples = 0;
    for (const frame of frames) for (const mode of frame.snapshot.steady ? ['wave', 'amplitude'] : ['wave']) for (const palette of ['contrast', 'water', 'silver']) {
      const columns = 100, rows = 60;
      renderer.render(frame.fieldProgram()!, { columns, rows, bounds: model.bounds, transform: { width: columns, height: rows, scale: columns / model.bounds.width, offsetX: 0, offsetY: 0 }, dpr: 1, palette, mode, redraw: true });
      const actual = new Uint8Array(columns * rows * 4);
      // Readback is test-only, never used by the application rendering loop.
      gl.readPixels(0, 0, columns, rows, gl.RGBA, gl.UNSIGNED_BYTE, actual);
      const expected = frame.sampleField(columns, rows, mode).values, table = paletteTable(palette, mode);
      for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const value = expected[y * columns + x];
        const color = table[Math.max(0, Math.min(512, Math.round(mode === 'wave' ? value * 256 + 256 : value * 512)))];
        for (let c = 0; c < 3; c++) {
          const delta = Math.abs(actual[((rows - 1 - y) * columns + x) * 4 + c] - color[c]);
          max = Math.max(max, delta); sum += delta; samples++;
        }
      }
    }
    const error = gl.getError(); renderer.destroy();
    return { supported: true, max, mean: sum / samples, error };
  });
  expect(result.supported).toBe(true);
  expect(result.error).toBe(0);
  expect(result.max).toBeLessThanOrEqual(4);
  expect(result.mean).toBeLessThan(.03);
});

test('context loss falls back without resetting physics and restoration resumes GPU rendering', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'webgl2');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.locator('#separation').fill('54');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const time = await page.locator('#field-overlay').getAttribute('data-time-seconds');
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#wave-field')!.getContext('webgl2')!;
    (window as any).lostContext = gl.getExtension('WEBGL_lose_context');
    (window as any).lostContext.loseContext();
  });
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'cpu');
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(time);
  await expect(page.locator('#separation-value')).toHaveText('54 cm');
  await page.evaluate(() => (window as any).lostContext.restoreContext());
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'webgl2');
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(time);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#field-overlay').getAttribute('data-time-seconds'))).toBeGreaterThan(Number(time));
});

test('GPU unavailable at startup keeps input, color presets and propagation working on CPU', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-renderer', 'cpu');
  await page.locator('#separation').fill('54');
  await expect(page.locator('#field-overlay')).toHaveAttribute('data-moving', 'true');
  await expect(page.locator('#wave-field')).toHaveAttribute('data-target-fps', '30');
  await page.locator('#field-legend').click();
  await page.getByRole('button', { name: /푸른 물결/ }).click();
  await expect(page.locator('#wave-field')).toHaveAttribute('data-palette', 'water');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const time = await page.locator('#field-overlay').getAttribute('data-time-seconds');
  await page.waitForTimeout(100);
  expect(await page.locator('#field-overlay').getAttribute('data-time-seconds')).toBe(time);
  expect(errors).toEqual([]);
});

test('an unsupported field shader uses the CPU frame without exposing a blank canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  const result = await page.evaluate(async () => {
    const { createFieldSurface } = await import('/src/rendering/field-surface.ts');
    const { createRetardedEngine } = await import('/src/physics/retarded-engine.ts');
    const { createModel } = await import('/src/model/state.ts');
    const model = createModel(), frame = createRetardedEngine(model).read(model.probe);
    const container = document.createElement('div'), canvas = document.createElement('canvas');
    container.append(canvas); document.body.append(container);
    const surface = createFieldSurface(canvas, () => {});
    const broken = { ...frame, fieldProgram: () => ({ key: 'unsupported-test', glsl: 'invalid shader', textures: [], uniforms: {} }) };
    surface.render(broken, 'wave', { width: 200, height: 120, offsetX: 0, offsetY: 0, scale: 200 / 1.2 }, 'water', false);
    const pixel = canvas.getContext('2d')!.getImageData(50, 50, 1, 1).data;
    const result = { backend: canvas.dataset.renderer, visible: container.contains(canvas), opaque: pixel[3] === 255, sum: pixel[0] + pixel[1] + pixel[2] };
    surface.destroy(); container.remove(); return result;
  });
  expect(result.backend).toBe('cpu'); expect(result.visible).toBe(true);
  expect(result.opaque).toBe(true); expect(result.sum).toBeGreaterThan(0);
});
