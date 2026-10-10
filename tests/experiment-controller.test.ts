import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentController } from '../src/app/experiment-controller';
import { createModel, updateModel } from '../src/model/state';

const modelA = () => updateModel(createModel(), {
  type: 'probe', position: { x: 0.8491202337626307, y: 0.238125 },
});

test('one controller advances, pauses and reads the same instant without implicit read progress', () => {
  const experiment = createExperimentController({ model: modelA() });
  assert.equal(experiment.playing, true);
  assert.equal(experiment.playbackRate, 1);
  experiment.advance(0);
  assert.equal(experiment.advance(1000), 1);
  assert.equal(experiment.setPlaying(false, 1500), 1.5);
  assert.equal(experiment.advance(9000), 1.5);
  const frame = experiment.read();
  assert.equal(frame.snapshot.probe.interference, 'destructive');
  assert.equal(frame.snapshot.clock.timeSeconds, experiment.timeSeconds);
  assert.equal(experiment.read().snapshot.clock.timeSeconds, 1.5);
  const paths = frame.samplePaths();
  paths.forEach((path, index) => assert.equal(path.displacements.at(-1), frame.snapshot.probe.componentDisplacements[index]));
  experiment.setPlaying(true, 10000);
  assert.equal(experiment.advance(11000), 2.5);
  assert.equal(frame.snapshot.clock.timeSeconds, 1.5, 'previously returned frames remain immutable');
});

test('input locks and instant changes are per command and cannot leak into later propagation', () => {
  const experiment = createExperimentController({ model: modelA() });
  experiment.advance(0);
  assert.equal(experiment.dispatch({ type: 'wavelength', value: .075 }, 1000, { allowedInputs: ['probe'] }), false);
  assert.equal(experiment.model.wavelength, .15);
  assert.equal(experiment.timeSeconds, 0);
  experiment.dispatch({ type: 'wavelength', value: .075 }, 1000, { changeMode: 'instant' });
  assert.equal(experiment.read().snapshot.probe.interference, 'constructive');
  experiment.dispatch({ type: 'wavelength', value: .15 }, 1000);
  assert.equal(experiment.read().snapshot.probe.interference, 'transient');
  assert.equal(experiment.model.wavelength, .15);
  experiment.settle(1000);
  assert.equal(experiment.read().snapshot.probe.interference, 'destructive');
});

test('probe constraints belong to each input policy, not the last rendered camera', () => {
  const experiment = createExperimentController();
  experiment.dispatch({ type: 'probe', position: { x: 2, y: -.1 } }, 0, {
    constrainProbe: point => ({ x: Math.max(0, Math.min(1.2, point.x)), y: Math.max(0, Math.min(.72, point.y)) }),
  });
  assert.deepEqual(experiment.model.probe, { x: 1.2, y: 0 });
  experiment.dispatch({ type: 'probe', position: { x: 1.3, y: .4 } }, 0);
  assert.deepEqual(experiment.model.probe, { x: 1.3, y: .4 }, 'ordinary caller may supply its own supported camera constraint');
});

test('target input and actual moving sources remain distinct through the shared boundary', () => {
  const experiment = createExperimentController();
  experiment.advance(0);
  experiment.dispatch({ type: 'separation', value: .5 }, 1000);
  assert.ok(Math.abs(experiment.model.sources[0].position.y - .11) < 1e-12);
  assert.equal(experiment.read().snapshot.model.sources[0].position.y, .21);
  assert.equal(experiment.read().snapshot.moving, true);
  experiment.advance(1100);
  const actual = experiment.read().snapshot.model.sources[0].position.y;
  assert.ok(actual < .21 && actual > .11);
});

test('explicit reset retains playback selection while restoring a normal initial experiment', () => {
  const experiment = createExperimentController();
  experiment.advance(0);
  experiment.setRate(.5, 1000);
  experiment.setPlaying(false, 3000);
  assert.equal(experiment.timeSeconds, 2);
  experiment.reset(4000, modelA());
  assert.equal(experiment.timeSeconds, 0);
  assert.equal(experiment.playing, false);
  assert.equal(experiment.playbackRate, .5);
  assert.equal(experiment.read().snapshot.steady, true);
  assert.equal(experiment.read().snapshot.probe.interference, 'destructive');
  experiment.setPlaying(true, 5000);
  assert.equal(experiment.advance(7000), 1);
});
