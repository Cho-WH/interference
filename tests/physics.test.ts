import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel, updateModel } from '../src/model/state';
import type { ModelState } from '../src/model/types';
import { createSnapshot, samplePoint, samplePaths, createFieldSampler } from '../src/physics/waves';
import { createClock } from '../src/runtime/clock';

const close = (actual: number, expected: number, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
function withDifference(ratio: number): ModelState {
  const model = createModel();
  return { ...model, probe: { x: 1, y: .36 }, sources: [
    { ...model.sources[0], position: { x: 0, y: .36 } },
    { ...model.sources[1], position: { x: model.wavelength * ratio, y: .36 } },
  ] };
}
for (const [ratio, normalizedAmplitude, condition] of [[0, 2, 'constructive'], [.25, Math.SQRT2, 'intermediate'], [.5, 0, 'destructive'], [1, 2, 'constructive']] as const) {
  test(`path difference ${ratio}λ produces expected amplitude and condition`, () => {
    const model = withDifference(ratio);
    for (const temporalPhase of [0, .2, Math.PI / 2, 2.71]) {
      const sample = createSnapshot(model, { timeSeconds: 0, temporalPhase }).probe;
      close(sample.resultantAmplitude / model.sources[0].amplitude, normalizedAmplitude);
      assert.equal(sample.interference, condition);
      close(sample.signedPathDifference, -ratio * model.wavelength);
      close(sample.phaseDifference, ratio * 2 * Math.PI);
      if (condition === 'destructive') close(sample.resultantDisplacement, 0);
    }
  });
}
test('instantaneous zero is not mistaken for cancellation', () => {
  const model = withDifference(0);
  const phase = 2 * Math.PI * 1 / model.wavelength;
  const sample = createSnapshot(model, { timeSeconds: 0, temporalPhase: phase }).probe;
  close(sample.resultantDisplacement, 0);
  assert.equal(sample.interference, 'constructive');
});
test('path endpoints, shared distance and probe contributions use one physical value', () => {
  let model = updateModel(createModel(), { type: 'probe', position: { x: .92, y: .63 } });
  for (const y of [.63, .09, .36, .24]) {
    model = updateModel(model, { type: 'probe', position: { x: y === .24 ? .4 : .92, y } });
    const snapshot = createSnapshot(model, { timeSeconds: .35, temporalPhase: 1.73 });
    const paths = samplePaths(snapshot);
    const common = Math.min(...snapshot.probe.distances);
    for (let i = 0; i < 2; i++) {
      close(paths[i].distances.at(-1)!, snapshot.probe.distances[i]);
      close(paths[i].displacements.at(-1)!, snapshot.probe.componentDisplacements[i]);
      assert.ok(paths[i].distances.includes(common));
    }
    close(paths[0].displacements[paths[0].distances.indexOf(common)], paths[1].displacements[paths[1].distances.indexOf(common)]);
    close(snapshot.probe.resultantDisplacement, snapshot.probe.componentDisplacements[0] + snapshot.probe.componentDisplacements[1]);
  }
});
test('amplitude field stays fixed while displacement field follows time and point samples', () => {
  const sampler = createFieldSampler();
  const model = createModel();
  const first = createSnapshot(model, { timeSeconds: 0, temporalPhase: .4 });
  const second = createSnapshot(model, { timeSeconds: 1, temporalPhase: 2 });
  assert.deepEqual(sampler(first, 11, 7, 'amplitude').values, sampler(second, 11, 7, 'amplitude').values);
  const field = sampler(first, 11, 7, 'wave');
  assert.notDeepEqual(field.values, sampler(second, 11, 7, 'wave').values);
  for (const [x, y] of [[0, 0], [4, 3], [10, 6]]) {
    const point = samplePoint(first, { x: x / 10 * model.bounds.width, y: y / 6 * model.bounds.height });
    close(field.values[y * 11 + x], point.resultantDisplacement / .02, 1e-6);
  }
  const changed = createSnapshot(updateModel(model, { type: 'wavelength', value: .23 }), first.clock);
  assert.notDeepEqual(sampler(first, 11, 7, 'amplitude').values, sampler(changed, 11, 7, 'amplitude').values);
});
test('clock excludes pause duration and preserves accumulated phase when frequency changes', () => {
  const clock = createClock();
  clock.tick(1000, 1);
  close(clock.tick(1250, 1).temporalPhase, Math.PI / 2);
  clock.setPlaying(false, 1500, 1);
  const paused = clock.tick(5000, 1);
  close(paused.temporalPhase, Math.PI);
  clock.setPlaying(true, 6000, 2);
  close(clock.tick(6250, 2).temporalPhase, 2 * Math.PI);
  close(clock.getFrame().timeSeconds, .75);
  clock.tick(6500, 2); // settle old frequency at the input boundary
  close(clock.tick(6750, 1).temporalPhase, 3.5 * Math.PI);
});
test('input reducer bounds values without mutating source IDs or previous state', () => {
  const model = createModel();
  const moved = updateModel(model, { type: 'probe', position: { x: -4, y: 9 } });
  assert.deepEqual(moved.probe, { x: 0, y: .72 });
  assert.deepEqual(model.probe, { x: .85, y: .36 });
  assert.equal(updateModel(model, { type: 'wavelength', value: 0 }).wavelength, .06);
  const separated = updateModel(model, { type: 'separation', value: 10 });
  close(separated.sources[1].position.y - separated.sources[0].position.y, .54);
  assert.deepEqual(separated.sources.map(s => s.id), ['source-1', 'source-2']);
  assert.equal(updateModel(model, { type: 'wavelength', value: NaN }), model);
});
