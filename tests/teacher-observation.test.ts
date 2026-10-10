import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonModel, EXPERIMENTS } from '../src/lesson/default-lesson';
import { createExperimentController } from '../src/app/experiment-controller';
import { teacherPose, updatePoseGeometry } from '../src/presentation/layout';
import { createPresentationAnimator } from '../src/presentation/animator';
import { placePathPoint, toScreen } from '../src/geometry/layout';

test('lesson A has a half-wavelength difference and stays cancelled over two complete periods', () => {
  const model = createLessonModel();
  const experiment = createExperimentController({ model });
  experiment.advance(0);
  const period = model.wavelength / model.speed;
  let maximumComponent = 0;
  for (let step = 0; step <= 64; step++) {
    experiment.advance(step / 32 * period * 1000);
    const { probe } = experiment.read().snapshot;
    assert.ok(Math.abs(probe.distances[0] - .45) < 1e-12);
    assert.ok(Math.abs(probe.distances[1] - .525) < 1e-12);
    assert.ok(Math.abs(Math.abs(probe.signedPathDifference) / model.wavelength - .5) < 1e-12);
    assert.equal(probe.interference, 'destructive');
    assert.ok(Math.abs(probe.resultantDisplacement) < 1e-12);
    assert.ok(Math.abs(probe.componentDisplacements[0] + probe.componentDisplacements[1]) < 1e-12);
    maximumComponent = Math.max(maximumComponent, Math.abs(probe.componentDisplacements[0]));
  }
  assert.ok(maximumComponent > .0099, 'each contribution vibrates even though the sum remains zero');
});

for (const id of ['B', 'C']) test('lesson ' + id + ' arrives in phase over two complete periods', () => {
  const model = createLessonModel(EXPERIMENTS[id]), experiment = createExperimentController({ model });
  experiment.advance(0);
  let peak = 0;
  for (let step = 0; step <= 64; step++) {
    experiment.advance(step / 32 * model.wavelength / model.speed * 1000);
    const { probe } = experiment.read().snapshot;
    assert.ok(Math.abs(Math.abs(probe.signedPathDifference) / model.wavelength - 1) < 1e-12);
    assert.equal(probe.interference, 'constructive');
    assert.ok(Math.abs(probe.componentDisplacements[0] - probe.componentDisplacements[1]) < 1e-12);
    assert.ok(Math.abs(probe.resultantDisplacement - 2 * probe.componentDisplacements[0]) < 1e-12);
    peak = Math.max(peak, Math.abs(probe.resultantDisplacement));
  }
  assert.ok(peak > .0199);
});

test('animated observation reuses engine distances, phase and endpoints without mutating time or preset', () => {
  const experiment = createExperimentController({ model: createLessonModel() });
  experiment.setPlaying(false, 0);
  const animator = createPresentationAnimator();
  animator.setTarget(teacherPose(experiment.read().snapshot, 1280, 600, 'spatial-paths'), 'none', 0, true);
  experiment.applyPreset(EXPERIMENTS.B, 0);
  animator.setTarget(teacherPose(experiment.read().snapshot, 1280, 600, 'spatial-paths'), 'move-probe', 0);
  const generation = experiment.generation;
  const seen: number[] = [];
  for (const now of [0, 300, 600, 900, 1200]) {
    const pose = animator.sample(now)!;
    const { frame, validity } = experiment.readBundle(undefined, pose.observationProbe);
    const snapshot = frame.snapshot;
    const geometry = updatePoseGeometry(pose, snapshot, 'spatial-paths');
    const target = toScreen(snapshot.model.probe, pose.camera);
    snapshot.probe.distances.forEach((distance, i) => {
      const origin = snapshot.probe.origins[i];
      assert.ok(Math.abs(distance - Math.hypot(pose.observationProbe.x - origin.x, pose.observationProbe.y - origin.y)) < 1e-12);
      const end = placePathPoint(distance, 0, geometry.placements[i]);
      assert.ok(Math.hypot(end.x - target.x, end.y - target.y) < 1e-9);
      const path = frame.samplePaths()[i];
      assert.ok(Math.abs(path.displacements.at(-1)! - snapshot.probe.componentDisplacements[i]) < 1e-12);
    });
    assert.ok(Math.abs(snapshot.probe.phaseDifference! + 2 * Math.PI * snapshot.probe.signedPathDifference / .15) < 1e-10);
    seen.push(pose.observationProbe.y);
    assert.equal(validity.timeSeconds, 0); assert.equal(validity.generation, generation);
    assert.deepEqual(experiment.model.probe, EXPERIMENTS.B.probe);
  }
  assert.equal(seen[0], EXPERIMENTS.A.probe.y); assert.equal(seen.at(-1), EXPERIMENTS.B.probe.y);
  assert.ok(seen.slice(1).every((y, i) => y < seen[i]));
  animator.setTarget(teacherPose(experiment.read().snapshot, 1280, 600, 'spatial-paths'), 'move-probe', 1300, true);
  assert.equal(animator.active(), false);
});
