import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel } from '../src/model/state';
import type { PhysicsSnapshot, ProbeSample } from '../src/model/types';
import { createWaveFrame, fieldGrid } from '../src/physics/sampling';

test('generic paths honor backend spacing, exact comparison distance and probe endpoints', () => {
  const model = createModel();
  const probe: ProbeSample = {
    distances: [.2, .35], origins: [{ x: 0, y: 0 }, { x: .1, y: .1 }],
    componentDisplacements: [.003, -.002], resultantDisplacement: .001,
    resultantAmplitude: null, signedPathDifference: .15, phaseDifference: null, interference: 'transient',
  };
  const snapshot: PhysicsSnapshot = { model, probe, steady: false, moving: true, clock: { timeSeconds: 0, temporalPhase: 0 } };
  const frame = createWaveFrame(snapshot, () => probe, (i, p) => (i + 1) * p.x,
    (cols, rows) => fieldGrid(cols, rows, model.bounds, () => 0),
    { pathSpacing: .037, fieldBounds: { ...model.bounds, x: 0, y: 0 } });
  frame.samplePaths().forEach((path, i) => {
    assert.equal(path.sourceId, model.sources[i].id);
    assert.equal(path.distances[0], 0);
    assert.equal(path.distances.at(-1), probe.distances[i]);
    assert.ok(path.distances.includes(.2));
    assert.equal(path.displacements.at(-1), probe.componentDisplacements[i]);
    for (let j = 1; j < path.distances.length; j++) assert.ok(path.distances[j] - path.distances[j - 1] <= .037);
  });
  assert.equal(frame.fieldCacheKey, undefined);
  assert.equal(frame.fieldProgram, undefined);
});
