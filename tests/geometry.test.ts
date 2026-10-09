import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel, sourcePositionExtremes } from '../src/model/state';
import { computeComparisonLayout, createSceneTransform, interpolatePathPlacement, placePathPoint, toScreen, toWorld } from '../src/geometry/layout';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const model = createModel();
test('physical coordinates survive viewport changes and inverse transform', () => {
  for (const [width, height] of [[1100, 420], [326, 210]]) {
    const t = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), width, height);
    const p = { x: .85, y: .43 };
    const result = toWorld(toScreen(p, t), t);
    close(result.x, p.x); close(result.y, p.y);
  }
});
test('every unfolding frame preserves actual spatial pixel length and wavelength', () => {
  for (const [width, height] of [[700, 308], [326, 210], [286, 170]]) {
    const t = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), width, height);
    for (const probe of [{ x: .9, y: .2 }, { x: .1, y: .7 }, { x: .4, y: .24 }]) {
      const source = model.sources[0].position;
      const a = toScreen(source, t), b = toScreen(probe, t);
      const r = Math.hypot(probe.x - source.x, probe.y - source.y);
      for (const p of [0, .25, .5, .75, 1]) {
        const placement = interpolatePathPlacement(a, b, { x: 22, y: 400 }, p, t.scale, 2000);
        const start = placePathPoint(0, 0, placement);
        const end = placePathPoint(r, 0, placement), oneWave = placePathPoint(model.wavelength, 0, placement);
        close(Math.hypot(end.x - start.x, end.y - start.y), Math.hypot(b.x - a.x, b.y - a.y));
        close(Math.hypot(oneWave.x - start.x, oneWave.y - start.y), model.wavelength * t.scale);
      }
    }
  }
});
test('shared scale fits all allowed positions and is independent of the current path', () => {
  for (const width of [286, 326, 700, 1100]) {
    const t = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), width, 260);
    const l = computeComparisonLayout(width, 260, t.scale, .01);
    close(l.distanceScale, t.scale);
    for (const source of sourcePositionExtremes(model.bounds)) {
      for (const probe of [{ x: 0, y: 0 }, { x: 1.2, y: .72 }, { x: 1.2, y: 0 }, { x: 0, y: .72 }]) {
        const r = Math.hypot(probe.x - source.x, probe.y - source.y);
        assert.ok(l.startX + r * l.distanceScale < l.pointX);
      }
    }
    close(.02 * l.displacementScale, 2 * l.componentAmplitudePx);
  }
});
