import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel, sourcePositionExtremes } from '../src/model/state';
import { createProbeRegion, containsProbe, constrainProbe, probeBoundary } from '../src/geometry/probe-region';
import { landscapeColumns } from '../src/geometry/layout';
import { computeComparisonLayout, createSceneTransform, interpolatePathPlacement, placePathPoint, sceneFieldEnvelope, visibleFieldBounds, toScreen, toWorld } from '../src/geometry/layout';
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const model = createModel();

test('probe uses spare vertical room without shrinking the waves', () => {
  const columns = landscapeColumns(637);
  const t = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), columns.fieldWidth, 235, columns.comparisonWidth);
  const region = createProbeRegion(t, columns.comparisonWidth, sourcePositionExtremes(model.bounds));
  for (const y of [18, 217]) {
    const point = toWorld({ x: columns.fieldWidth / 2, y }, t);
    assert.ok(y === 18 ? point.y < 0 : point.y > .72);
    assert.equal(constrainProbe(region, point), point);
  }
});

test('probe edges fit every source position, screen and comparison across aspect ratios', () => {
  for (const [width, height, side] of [[286, 170, false], [326, 360, false], [1000, 360, false], [538, 180, true], [637, 235, true], [814, 250, true], [994, 360, true]] as const) {
    const columns = side ? landscapeColumns(width) : { fieldWidth: width, comparisonWidth: width };
    const t = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), columns.fieldWidth, height, columns.comparisonWidth);
    const region = createProbeRegion(t, columns.comparisonWidth, sourcePositionExtremes(model.bounds));
    const layout = computeComparisonLayout(columns.comparisonWidth, 0, t.scale, .01);
    const points = [...probeBoundary(region), ...[-10, 0, .5, 10].flatMap(x => [-10, 0, .5, 10].map(y => constrainProbe(region, { x, y })))];
    for (const point of points) {
      assert.ok(containsProbe(region, point));
      const screen = toScreen(point, t);
      assert.ok(screen.x >= 16 - 1e-6 && screen.x <= columns.fieldWidth - 16 + 1e-6);
      assert.ok(screen.y >= 16 - 1e-6 && screen.y <= height - 16 + 1e-6);
      for (let y = .09; y <= .63; y += .03) {
        const length = Math.hypot(point.x - .4, point.y - y) * t.scale;
        assert.ok(layout.startX + length <= layout.pointX - 16 + 1e-6);
      }
    }
  }
});

test('probe projection chooses nearest feasible boundary including curved corners', () => {
  const region = { bounds: { x: -2, y: -2, width: 4, height: 4 }, centers: [{ x: 0, y: -1 }, { x: 0, y: 1 }], radius: 2 };
  const right = constrainProbe(region, { x: 4, y: 0 });
  close(right.x, Math.sqrt(3)); close(right.y, 0);
  const top = constrainProbe(region, { x: 0, y: -4 });
  close(top.x, 0); close(top.y, -1);
});
test('field bounds cover the full viewport and stay inside reserved history across supported sizes', () => {
  const sources = sourcePositionExtremes(model.bounds), envelope = sceneFieldEnvelope(model.bounds, sources);
  for (const width of [286, 326, 390, 600, 766, 1000]) for (const height of [170, 210, 260, 308, 360]) {
    const transform = createSceneTransform(model.bounds, sources, width, height), bounds = visibleFieldBounds(transform);
    const top = toScreen(bounds, transform), bottom = toScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, transform);
    close(top.x, 0); close(top.y, 0); close(bottom.x, width); close(bottom.y, height);
    assert.ok(bounds.x >= envelope.x - 1e-8 && bounds.y >= envelope.y - 1e-8);
    assert.ok(bounds.x + bounds.width <= envelope.x + envelope.width + 1e-8);
    assert.ok(bounds.y + bounds.height <= envelope.y + envelope.height + 1e-8);
  }
});
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
    assert.ok(l.sumX > l.pointX + 30);
    assert.ok(l.sumX + 24 < width);
    assert.ok(l.sumZeroY > l.rowZeros[0] && l.sumZeroY < l.rowZeros[1]);
  }
});
