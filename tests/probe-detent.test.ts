import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProbeDetent, type ProbeGuide } from '../src/geometry/probe-detent';
import { createModel } from '../src/model/state';
import { createRetardedEngine } from '../src/physics/retarded-engine';

const guide: ProbeGuide = { key: 'fixed', phaseAt: p => p.y * Math.PI / 20, contains: () => true };
const point = (y: number, x = 0) => ({ x, y });

test('only crossing catches; tangential movement is free and release allows positions beside the same line', () => {
  const detent = createProbeDetent();
  for (const y of [-8, -2, -.1]) assert.deepEqual(detent.move(point(y), guide, 1), point(y));
  assert.ok(Math.abs(detent.move(point(1), guide, 1).y) < 1e-10);
  const along = detent.move(point(2, 10), guide, 1);
  assert.equal(along.x, 10); assert.ok(Math.abs(along.y) < 1e-10);
  assert.ok(Math.abs(detent.move(point(5, 10), guide, 1).y) < 1e-10);
  assert.deepEqual(detent.move(point(10, 10), guide, 1), point(10, 10));
  // After breaking through, even crossing back near the same line remains free.
  for (const y of [1, -.5, .5]) assert.deepEqual(detent.move(point(y), guide, 1), point(y));
  detent.move(point(14), guide, 1);
  assert.ok(Math.abs(detent.move(point(-1), guide, 1).y) < 1e-10);
  detent.reset();
  assert.deepEqual(detent.move(point(.5), guide, 1), point(.5));
});

test('large crossings, starting on a line, transient frames and changed geometry do not retain a catch', () => {
  const detent = createProbeDetent();
  detent.move(point(-8), guide, 1);
  assert.deepEqual(detent.move(point(8), guide, 1), point(8));
  detent.reset(); detent.move(point(0), guide, 1);
  assert.deepEqual(detent.move(point(1), guide, 1), point(1));
  detent.reset(); detent.move(point(-1), guide, 1); detent.move(point(1), guide, 1);
  assert.deepEqual(detent.move(point(2), undefined, 1), point(2));
  detent.move(point(-1), guide, 1); detent.move(point(1), guide, 1);
  assert.deepEqual(detent.move(point(2), { ...guide, key: 'changed' }, 1), point(2));
  detent.move(point(-1), guide, 1); detent.move(point(1), guide, 1);
  assert.deepEqual(detent.move(point(2), { ...guide, contains: () => false }, 1), point(2));
});

test('the catch has the same screen strength at different scales', () => {
  for (const scale of [100, 500, 1000]) {
    const detent = createProbeDetent();
    detent.move(point(-2 / scale), guide, scale);
    assert.ok(Math.abs(detent.move(point(2 / scale), guide, scale).y) < 1e-10);
    assert.ok(Math.abs(detent.move(point(5 / scale), guide, scale).y) < 1e-10);
    assert.deepEqual(detent.move(point(10 / scale), guide, scale), point(10 / scale));
  }
});

test('release is continuous and monotonic on both sides, then leaves no residual offset', () => {
  for (const sign of [-1, 1]) {
    const detent = createProbeDetent();
    detent.move(point(-sign), guide, 1); detent.move(point(sign), guide, 1);
    let previous = 0;
    for (let pixels = 6; pixels <= 10; pixels += .01) {
      const actual = sign * detent.move(point(sign * pixels), guide, 1).y;
      assert.ok(actual >= previous - 1e-10);
      assert.ok(actual - previous < .06); // No position jump across either boundary.
      assert.ok(actual <= pixels + 1e-10);
      previous = actual;
    }
    assert.deepEqual(detent.move(point(sign * 10), guide, 1), point(sign * 10));
    assert.deepEqual(detent.move(point(sign), guide, 1), point(sign));
  }
});

test('curved nodal and constructive lines land at the engine interference condition, including unequal initial phases', () => {
  const base = createModel();
  for (const initialPhase of [0, .4]) {
    const model = { ...base, sources: [base.sources[0], { ...base.sources[1], initialPhase }] as const };
    const frame = createRetardedEngine(model).read(model.probe);
    const field: ProbeGuide = { key: 'real', phaseAt: p => frame.samplePoint(p).phaseDifference, contains: () => true };
    for (const target of [-Math.PI, 0, Math.PI]) {
      let low = .01, high = .71;
      for (let i = 0; i < 50; i++) {
        const y = (low + high) / 2;
        if (field.phaseAt({ x: .65, y })! < target) low = y; else high = y;
      }
      const y = (low + high) / 2, detent = createProbeDetent();
      detent.move({ x: .65, y: y - .002 }, field, 500);
      const caught = detent.move({ x: .65, y: y + .002 }, field, 500);
      assert.ok(Math.abs(field.phaseAt(caught)! - target) < 1e-10);
      assert.equal(frame.samplePoint(caught).interference, target === 0 ? 'constructive' : 'destructive');
    }
  }
});
