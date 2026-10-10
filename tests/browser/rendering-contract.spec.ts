import { test, expect } from '@playwright/test';

test('field surface treats cache hints as opaque and safely redraws frames without hints', async ({ page }) => {
  await page.goto('/');
  await page.locator('#play').click();
  const result = await page.evaluate(async () => {
    const { createFieldSurface } = await import('/src/rendering/field-surface.ts');
    const { createModel } = await import('/src/model/state.ts');
    const { createRetardedEngine } = await import('/src/physics/retarded-engine.ts');
    const reference = createRetardedEngine(createModel()).read({ x: .8, y: .3 });
    const canvas = document.createElement('canvas');
    const surface = createFieldSurface(canvas, () => {});
    const transform = { width: 160, height: 96, offsetX: 0, offsetY: 0, scale: 100 };
    let calls = 0;
    const frame = (value: number, key?: string) => ({
      ...reference, fieldProgram: undefined, fieldCacheKey: key === undefined ? undefined : () => key,
      sampleField(columns: number, rows: number) {
        calls++;
        return { columns, rows, values: new Float32Array(columns * rows).fill(value) };
      },
    });
    const render = (f: ReturnType<typeof frame>, palette: 'water' | 'silver' = 'water') => {
      surface.render(f, 'wave', transform, palette, false);
      return canvas.toDataURL();
    };
    const first = frame(-1), firstImage = render(first);
    render(first);
    const sameFrameCalls = calls;
    const secondImage = render(frame(1));
    const unkeyedCalls = calls;
    const keyedImage = render(frame(-.5, 'a'));
    render(frame(-.5, 'a'));
    const keyedCalls = calls;
    const recolored = render(frame(-.5, 'a'), 'silver');
    const paletteCalls = calls;
    const changed = render(frame(.5, 'b'));
    surface.destroy();
    return { sameFrameCalls, unkeyedCalls, keyedCalls, paletteCalls, calls,
      changedUnkeyed: firstImage !== secondImage, recolored: keyedImage !== recolored, changedKey: keyedImage !== changed };
  });
  expect(result).toEqual({ sameFrameCalls: 1, unkeyedCalls: 2, keyedCalls: 3, paletteCalls: 3, calls: 4,
    changedUnkeyed: true, recolored: true, changedKey: true });
});
