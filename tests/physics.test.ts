import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModel, updateModel } from '../src/model/state';
import type { ModelState } from '../src/model/types';
import { createRetardedEngine } from '../src/physics/retarded-engine';
import { retardedArrival } from '../src/physics/history';
import { SOURCE_SPEED_RATIO } from '../src/physics/source-motion';
import { createClock } from '../src/runtime/clock';

const TAU = 2 * Math.PI;
const close = (actual: number, expected: number, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
function withDifference(ratio: number): ModelState {
  const model = createModel();
  return { ...model, probe: { x: 1, y: .36 }, sources: [
    { ...model.sources[0], position: { x: 0, y: .36 } },
    { ...model.sources[1], position: { x: model.wavelength * ratio, y: .36 } },
  ] };
}
for (const [ratio, normalizedAmplitude, condition] of [[0, 2, 'constructive'], [.25, Math.SQRT2, 'intermediate'], [.5, 0, 'destructive'], [1, 2, 'constructive']] as const) {
  test(`stationary path difference ${ratio}λ gives expected interference at every time`, () => {
    const model = withDifference(ratio), engine = createRetardedEngine(model);
    for (const time of [0, .2, 1.3, 20]) {
      engine.advanceTo(time);
      const sample = engine.read(model.probe).snapshot.probe;
      close(sample.resultantAmplitude! / model.sources[0].amplitude, normalizedAmplitude);
      assert.equal(sample.interference, condition);
      close(sample.signedPathDifference, -ratio * model.wavelength);
      close(sample.phaseDifference!, ratio * TAU);
      if (condition === 'destructive') close(sample.resultantDisplacement, 0);
    }
  });
}
test('instantaneous zero is not confused with cancellation', () => {
  const model = withDifference(0), engine = createRetardedEngine(model);
  engine.advanceTo(1 / model.speed);
  const sample = engine.read(model.probe).snapshot.probe;
  close(sample.resultantDisplacement, 0);
  assert.equal(sample.interference, 'constructive');
});
test('a wavelength change travels outwards, preserves old waves, and keeps source phase continuous', () => {
  const model = createModel(), engine = createRetardedEngine(model), original = createRetardedEngine(model);
  engine.advanceTo(1); original.advanceTo(1);
  const source = model.sources[0].position;
  const before = engine.read(source).snapshot.probe.componentDisplacements[0];
  engine.setWavelength(.24);
  close(engine.read(source).snapshot.probe.componentDisplacements[0], before);
  engine.advanceTo(1.5); original.advanceTo(1.5);
  const far = { x: 1.1, y: .24 }, near = { x: .424, y: .24 };
  close(engine.read(far).snapshot.probe.componentDisplacements[0], original.read(far).snapshot.probe.componentDisplacements[0]);
  const emitted = 1.5 - .024 / .12;
  close(engine.read(near).snapshot.probe.componentDisplacements[0], .01 * Math.sin(TAU * (.75 + .5 * (emitted - 1))));
  const pending = engine.read(far);
  assert.equal(pending.snapshot.probe.resultantAmplitude, null);
  assert.equal(pending.snapshot.probe.interference, 'transient');
  assert.throws(() => pending.sampleField(3, 3, 'amplitude'));
  engine.advanceTo(20);
  assert.equal(engine.read(far).snapshot.steady, true);
});
test('edits while paused, including at startup, do not rewrite emitted waves', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  const before = engine.read(model.probe).sampleField(9, 7, 'wave').values;
  engine.setWavelength(.3); engine.setWavelength(.06);
  assert.deepEqual(engine.read(model.probe).sampleField(9, 7, 'wave').values, before);
  close(engine.read(model.probe).snapshot.clock.temporalPhase, 0);
  engine.advanceTo(.1);
  close(engine.read(model.probe).snapshot.clock.temporalPhase, TAU * 2 * .1);
});
test('retarded origins match independent bisection across moving and stationary segments', () => {
  const positions = (y: number) => [{ x: .4, y }, { x: .4, y: .72 - y }] as const;
  const events = [{ time: 0, positions: positions(.24) }, { time: 2, positions: positions(.24) },
    { time: 5, positions: positions(.09) }, { time: 9, positions: positions(.09) }];
  const yAt = (t: number) => .24 - .05 * Math.max(0, Math.min(3, t - 2));
  for (let time = 0; time <= 16; time += .5) for (const point of [{ x: .4, y: .2 }, { x: .1, y: .6 }, { x: 1.2, y: 0 }]) {
    let low = time - 20, high = time;
    for (let n = 0; n < 60; n++) {
      const mid = (low + high) / 2;
      if (mid + Math.hypot(point.x - .4, point.y - yAt(mid)) / .12 > time) high = mid; else low = mid;
    }
    const actual = retardedArrival(events, 0, point, time, .12);
    close(actual.time, (low + high) / 2);
    close(actual.origin.y, yAt(actual.time));
    close(actual.distance, .12 * (time - actual.time));
  }
});
test('source motion is bounded, converges without overshoot, and freezes without time advancement', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  const target = updateModel(model, { type: 'separation', value: .54 });
  engine.setSourceTargets([target.sources[0].position, target.sources[1].position]);
  assert.deepEqual(engine.read(model.probe).snapshot.model.sources, model.sources);
  let previous = model.sources[0].position, settled = false;
  for (let step = 1; step <= 600; step++) {
    engine.advanceTo(step / 60);
    const frame = engine.read(model.probe), position = frame.snapshot.model.sources[0].position;
    assert.ok(Math.hypot(position.x - previous.x, position.y - previous.y) <= model.speed * SOURCE_SPEED_RATIO / 60 + 1e-12);
    assert.ok(position.y >= target.sources[0].position.y - 1e-12 && position.y <= previous.y + 1e-12);
    if (!frame.snapshot.moving) settled = true;
    assert.deepEqual(engine.read(model.probe).snapshot, frame.snapshot);
    previous = position;
  }
  assert.equal(settled, true);
  close(previous.y, target.sources[0].position.y);
  engine.setSourceTargets([model.sources[0].position, model.sources[1].position]);
  close(engine.read(model.probe).snapshot.model.sources[0].position.y, previous.y);
  engine.advanceTo(20);
  close(engine.read(model.probe).snapshot.model.sources[0].position.y, model.sources[0].position.y);
});
test('moving source history, field, spatial sections and endpoint components agree', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  const target = updateModel(model, { type: 'separation', value: .54 });
  engine.setSourceTargets([target.sources[0].position, target.sources[1].position]);
  engine.advanceTo(1);
  const frame = engine.read({ x: .92, y: .63 }), { snapshot } = frame;
  assert.deepEqual(snapshot.probe.origins, model.sources.map(s => s.position));
  assert.notDeepEqual(snapshot.model.sources[0].position, model.sources[0].position);
  const paths = frame.samplePaths();
  for (let i = 0; i < 2; i++) {
    const path = paths[i], origin = snapshot.probe.origins[i], length = snapshot.probe.distances[i];
    close(path.displacements.at(-1)!, snapshot.probe.componentDisplacements[i]);
    for (const j of [0, Math.floor(path.distances.length / 2)]) {
      const f = path.distances[j] / length;
      const p = { x: origin.x + (snapshot.model.probe.x - origin.x) * f, y: origin.y + (snapshot.model.probe.y - origin.y) * f };
      close(path.displacements[j], frame.samplePoint(p).componentDisplacements[i]);
    }
  }
  const grid = frame.sampleField(11, 7, 'wave');
  for (const [x, y] of [[0, 0], [4, 3], [10, 6]]) {
    const point = frame.samplePoint({ x: x / 10 * model.bounds.width, y: y / 6 * model.bounds.height });
    close(grid.values[y * 11 + x], point.resultantDisplacement / .02, 1e-6);
  }
});
test('a retained frame survives later commands, pruning, and reset', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  engine.setWavelength(.3); engine.advanceTo(.5);
  const frame = engine.read(model.probe), values = frame.sampleField(9, 7, 'wave').values, probe = frame.samplePoint(model.probe);
  engine.setWavelength(.06); engine.advanceTo(100);
  engine.reset(updateModel(model, { type: 'separation', value: .54 }));
  assert.deepEqual(frame.samplePoint(model.probe), probe);
  assert.deepEqual(frame.sampleField(9, 7, 'wave').values, values);
  assert.equal(engine.read(model.probe).snapshot.clock.timeSeconds, 0);
});
test('steady amplitude does not flicker, and settling restores ordinary wavelength geometry', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  const a = engine.read(model.probe).sampleField(11, 7, 'amplitude');
  engine.advanceTo(.7);
  assert.deepEqual(engine.read(model.probe).sampleField(11, 7, 'amplitude').values, a.values);
  engine.setWavelength(.2); engine.advanceTo(20);
  const frame = engine.read(model.probe);
  assert.equal(frame.snapshot.steady, true);
  const paths = frame.samplePaths(), common = Math.min(...frame.snapshot.probe.distances);
  close(paths[0].displacements[paths[0].distances.indexOf(common)], paths[1].displacements[paths[1].distances.indexOf(common)]);
  assert.notDeepEqual(frame.sampleField(11, 7, 'amplitude').values, a.values);
});
test('clock excludes pause duration and rejects invalid timestamps', () => {
  const clock = createClock();
  clock.tick(1000); close(clock.tick(1250).timeSeconds, .25);
  clock.setPlaying(false, 1500); close(clock.tick(5000).timeSeconds, .5);
  clock.setPlaying(true, 6000); close(clock.tick(6250).timeSeconds, .75);
  clock.reset(7000); close(clock.getFrame().timeSeconds, 0);
  assert.throws(() => clock.tick(NaN));
});

test('cached stationary fields match point physics through wavelength edits, motion, resize and reset', () => {
  const model = createModel(), engine = createRetardedEngine(model);
  function check(columns = 13, rows = 9) {
    const frame = engine.read(model.probe), grid = frame.sampleField(columns, rows, 'wave');
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const p = { x: columns === 1 ? .6 : x / (columns - 1) * 1.2, y: rows === 1 ? .36 : y / (rows - 1) * .72 };
      close(grid.values[y * columns + x], frame.samplePoint(p).resultantDisplacement / .02, 1e-6);
    }
  }
  check();
  engine.setWavelength(.06); engine.advanceTo(1); check();
  engine.setWavelength(.3); engine.advanceTo(2); check(1, 9); check();
  const target = updateModel(model, { type: 'separation', value: .54 });
  engine.setSourceTargets([target.sources[0].position, target.sources[1].position]);
  engine.advanceTo(5); check(); // stopped source, but past moving waves still in the domain
  engine.setWavelength(.2); engine.advanceTo(6); check(17, 11);
  engine.advanceTo(20); check(); // all moving waves have left the domain
  engine.setWavelength(.06); engine.advanceTo(21); check();
  engine.reset(model); engine.setWavelength(.24); check(9, 1);
});
test('desired input remains bounded and separate from actual source motion', () => {
  const model = createModel();
  assert.deepEqual(updateModel(model, { type: 'probe', position: { x: -4, y: 9 } }).probe, { x: 0, y: .72 });
  assert.deepEqual(model.probe, { x: .85, y: .36 });
  assert.equal(updateModel(model, { type: 'wavelength', value: 0 }).wavelength, .06);
  const separated = updateModel(model, { type: 'separation', value: 10 });
  close(separated.sources[1].position.y - separated.sources[0].position.y, .54);
  assert.deepEqual(separated.sources.map(s => s.id), ['source-1', 'source-2']);
  assert.equal(updateModel(model, { type: 'wavelength', value: NaN }), model);
});
