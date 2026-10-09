import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeComparisonLayout, createFieldTransform, interpolatePathPlacement, placePathPoint, toScreen, toWorld } from '../src/geometry/layout';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
test('physical coordinates survive viewport changes and inverse transform', () => {
  for (const [width, height] of [[1100, 420], [326, 260]]) {
    const t = createFieldTransform({ width: 1.2, height: .72 }, width, height);
    const p = { x: .85, y: .43 };
    const result = toWorld(toScreen(p, t), t);
    close(result.x, p.x); close(result.y, p.y);
  }
});
test('unfolding preserves path length ratios through rotations and shared scaling', () => {
  const source = { x: 300, y: 200 }, probe = { x: 150, y: 400 };
  for (const p of [0, .25, .5, .75, 1]) {
    const placement = interpolatePathPlacement(source, probe, { x: 26, y: 500 }, p, 500, 240, 2400);
    const start = placePathPoint(0, 0, placement);
    const end1 = placePathPoint(.5, 0, placement), end2 = placePathPoint(.8, 0, placement);
    close(Math.hypot(end1.x - start.x, end1.y - start.y), .5 * placement.distanceScale);
    close(Math.hypot(end2.x - start.x, end2.y - start.y) / Math.hypot(end1.x - start.x, end1.y - start.y), 1.6);
  }
});
test('compact and wide comparisons preserve true difference and common displacement scale', () => {
  for (const width of [286, 326, 700, 1100]) {
    for (const distances of [[.3, .5], [.5, .3], [.4, .4]] as const) {
      const l = computeComparisonLayout(width, 260, distances, .01);
      const ends = distances.map(d => l.startX + d * l.distanceScale);
      close((ends[1] - ends[0]) / l.distanceScale, distances[1] - distances[0]);
      assert.ok(Math.max(...ends) < l.pointX);
      close(.02 * l.displacementScale, 2 * l.componentAmplitudePx);
      assert.ok(l.rowZeros[2] + .02 * l.displacementScale < 600);
    }
  }
});
