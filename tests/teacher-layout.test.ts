import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLessonModel, EXPERIMENTS } from '../src/lesson/default-lesson';
import { createRetardedEngine } from '../src/physics/retarded-engine';
import { placePathPoint, visibleFieldBounds, toScreen, type PathPlacement } from '../src/geometry/layout';
import { teacherCorrespondence, teacherCorrespondenceFits, teacherFieldEnvelope, teacherFieldTransform, teacherPose, type TeacherPose } from '../src/presentation/layout';
import { createPresentationAnimator, interpolateTeacherPose } from '../src/presentation/animator';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
const model = createLessonModel();
const engine = createRetardedEngine(model, teacherFieldEnvelope(model.bounds));
const frame = engine.read(model.probe);
const frozenPaths = frame.samplePaths();

// Undo only rigid placement and the shared distance zoom. A second, independent
// y zoom would change these coordinates and the wavelength/amplitude ratio.
function normalizedWave(placement: PathPlacement, index: number) {
  return frozenPaths[index].distances.map((distance, sample) => {
    const point = placePathPoint(distance, frozenPaths[index].displacements[sample], placement);
    const x = point.x - placement.origin.x, y = point.y - placement.origin.y;
    return [(x * Math.cos(placement.angle) + y * Math.sin(placement.angle)) / placement.distanceScale,
      (-x * Math.sin(placement.angle) + y * Math.cos(placement.angle)) / placement.distanceScale];
  });
}

function sameWave(reference: TeacherPose, actual: TeacherPose) {
  const zoom = actual.layout.distanceScale / reference.layout.distanceScale;
  close(actual.magnification / reference.magnification, zoom);
  close(actual.layout.displacementScale / reference.layout.displacementScale, zoom);
  close(actual.layout.componentAmplitudePx / reference.layout.componentAmplitudePx, zoom);
  actual.placements.forEach((placement, index) => {
    close(placement.distanceScale / reference.placements[index].distanceScale, zoom);
    close(placement.displacementScale / reference.placements[index].displacementScale, zoom);
    const before = normalizedWave(reference.placements[index], index);
    normalizedWave(placement, index).forEach((point, sample) => {
      close(point[0], before[sample][0]); close(point[1], before[sample][1]);
    });
  });
}

test('teacher cameras fit supported extremes without altering P or exceeding the reservation', () => {
  const envelope = teacherFieldEnvelope(model.bounds);
  for (const [w, h] of [[1280, 600], [1024, 630], [1280, 490], [390, 600], [280, 1080], [1920, 360]]) {
    const transform = teacherFieldTransform(model, w, h), bounds = visibleFieldBounds(transform);
    const p = toScreen(model.probe, transform);
    assert.ok(p.x > 0 && p.x < w && p.y > 90 && p.y < h);
    assert.ok(bounds.x >= envelope.x && bounds.y >= envelope.y);
    assert.ok(bounds.x + bounds.width <= envelope.x + envelope.width);
    assert.ok(bounds.y + bounds.height <= envelope.y + envelope.height);
    assert.deepEqual(frame.snapshot.model.probe, model.probe);
  }
});

test('reduced-motion simultaneous diagrams use the same path and displacement scales', () => {
  const { spatial, parallel } = teacherCorrespondence(frame.snapshot, 1280, 600);
  const original = teacherPose(frame.snapshot, 1280, 600, 'spatial-paths');
  sameWave(original, spatial);
  sameWave(original, parallel);
  close(spatial.layout.distanceScale, original.layout.distanceScale);
  close(parallel.layout.displacementScale, original.layout.displacementScale);
  assert.equal(teacherCorrespondenceFits(frame.snapshot, 1280, 600), true);
  assert.equal(teacherCorrespondenceFits(frame.snapshot, 390, 600), false);
  for (const i of [0, 1]) {
    close(spatial.placements[i].distanceScale, parallel.placements[i].distanceScale);
    close(spatial.placements[i].displacementScale, parallel.placements[i].displacementScale);
    for (const pose of [spatial, parallel]) {
      const a = placePathPoint(0, 0, pose.placements[i]);
      const b = placePathPoint(frame.snapshot.probe.distances[i], 0, pose.placements[i]);
      close(Math.hypot(b.x-a.x,b.y-a.y), frame.snapshot.probe.distances[i]*parallel.layout.distanceScale);
    }
  }
});

test('unfolding preserves each physical path and wavelength at every intermediate pose', () => {
  for (const [w, h] of [[1280, 600], [1024, 630], [390, 500]]) {
    const from = teacherPose(frame.snapshot, w, h, 'spatial-paths');
    const to = teacherPose(frame.snapshot, w, h, 'parallel');
    for (const p of [0, .1, .4, .7, 1]) {
      const pose = interpolateTeacherPose(from, to, p);
      pose.placements.forEach((placement, i) => {
        close(placement.origin.x, from.placements[i].origin.x);
        close(placement.origin.y, from.placements[i].origin.y);
        const a = placePathPoint(0, 0, placement), b = placePathPoint(frame.snapshot.probe.distances[i], 0, placement);
        close(Math.hypot(b.x - a.x, b.y - a.y), frame.snapshot.probe.distances[i] * from.layout.distanceScale);
        close(placement.distanceScale, pose.placements[1 - i].distanceScale);
      });
    }
  }
});

test('comparison rows fit full wave amplitudes and endpoints keep the same displacement scale', () => {
  const from = teacherPose(frame.snapshot, 1280, 600, 'parallel');
  const to = teacherPose(frame.snapshot, 1280, 600, 'path-comparison');
  assert.ok(to.layout.rowZeros[1] - to.layout.rowZeros[0] > 2 * to.layout.componentAmplitudePx);
  for (const p of [0, .25, .5, .75, 1]) {
    const pose = interpolateTeacherPose(from, to, p);
    pose.placements.forEach((placement, i) => {
      close(placement.distanceScale, pose.layout.distanceScale);
      close(placement.displacementScale, pose.layout.displacementScale);
      const end = placePathPoint(frame.snapshot.probe.distances[i], frame.snapshot.probe.componentDisplacements[i], placement);
      close(end.y, placement.origin.y - frame.snapshot.probe.componentDisplacements[i] * pose.layout.displacementScale);
    });
  }
});

test('all teacher layouts keep the original wave size through analysis and endpoint disclosures', () => {
  const kinds = ['field', 'spatial-paths', 'parallel', 'path-comparison', 'endpoint-comparison'] as const;
  const presets = [...Object.values(EXPERIMENTS), { probe: { x: 1.2, y: 0 }, wavelength: .15, separation: .54 }];
  for (const [width, height] of [[320, 568], [390, 744], [699, 844], [390, 400], [1280, 600], [1920, 980], [1024, 500]]) {
    const original = teacherPose(frame.snapshot, width, height, 'spatial-paths');
    for (const preset of presets) {
      const experiment = createLessonModel(preset);
      const snapshot = createRetardedEngine(experiment, teacherFieldEnvelope(experiment.bounds)).read(experiment.probe).snapshot;
      const poses = kinds.map(kind => teacherPose(snapshot, width, height, kind));
      const unchangedScale = (pose: TeacherPose) => {
        close(pose.layout.distanceScale, original.layout.distanceScale);
        close(pose.layout.displacementScale, original.layout.displacementScale);
        close(pose.layout.componentAmplitudePx, original.layout.componentAmplitudePx);
        close(pose.magnification, original.magnification);
        close(pose.camera.scale, original.camera.scale);
        pose.placements.forEach(placement => {
          close(placement.distanceScale, original.layout.distanceScale);
          close(placement.displacementScale, original.layout.displacementScale);
        });
      };
      poses.forEach(unchangedScale);
      for (const pose of poses.slice(3)) pose.placements.forEach((placement, i) => {
        const end = placePathPoint(snapshot.probe.distances[i], 0, placement);
        assert.ok(end.x <= pose.layout.pointX, 'endpoint links must point forward to their component column');
      });
      for (let i = 1; i < poses.length; i += 1) {
        for (const p of [.2, .5, .8]) {
          unchangedScale(interpolateTeacherPose(poses[i - 1], poses[i], p));
          unchangedScale(interpolateTeacherPose(poses[i], poses[i - 1], p));
        }
      }
    }
  }
});

test('reversing an unfinished zoom preserves the current waveform and one shared scale', () => {
  const spatial = teacherPose(frame.snapshot, 1280, 600, 'spatial-paths');
  const parallel = teacherPose(frame.snapshot, 1280, 600, 'parallel');
  const enlarged = teacherPose(frame.snapshot, 1280, 600, 'path-comparison');
  const animator = createPresentationAnimator();
  animator.setTarget(parallel, 'none', 0, true);
  animator.setTarget(enlarged, 'fit-paths', 0);
  const moving = animator.sample(150)!;
  assert.notEqual(moving.placements[0].origin.x, parallel.placements[0].origin.x);
  close(moving.magnification, parallel.magnification);
  sameWave(spatial, moving);
  const middle = animator.sample(390)!;
  close(middle.layout.distanceScale, parallel.layout.distanceScale);
  close(middle.layout.distanceScale, enlarged.layout.distanceScale);
  animator.setTarget(spatial, 'fold-to-field', 390);
  const reversed = animator.sample(390)!;
  assert.deepEqual(reversed.placements, middle.placements);
  close(reversed.magnification, middle.magnification);
  for (const now of [390, 540, 960, 1500, 1750]) sameWave(spatial, animator.sample(now)!);
  animator.setTarget(enlarged, 'fit-paths', 2000, true);
  assert.equal(animator.active(), false);
  sameWave(spatial, animator.sample(2000)!);
});

test('presentation interruption preserves the current pose and hidden-tab time does not complete the transition', () => {
  const spatial = teacherPose(frame.snapshot, 1280, 600, 'spatial-paths'), parallel = teacherPose(frame.snapshot, 1280, 600, 'parallel');
  const animator = createPresentationAnimator();
  animator.setTarget(spatial, 'none', 0, true);
  animator.setTarget(parallel, 'unfold-in-place', 0);
  const halfway = animator.sample(600)!;
  animator.setTarget(spatial, 'fold-to-field', 600);
  close(animator.sample(600)!.placements[1].angle, halfway.placements[1].angle);
  animator.suspend(700); const before = animator.sample(700)!;
  animator.resume(10700); const after = animator.sample(10700)!;
  close(before.placements[1].angle, after.placements[1].angle);
  assert.equal(animator.active(), true);
  animator.finish(); assert.equal(animator.active(), false);
  close(animator.sample(11000)!.placements[1].angle, spatial.placements[1].angle);
});

test('folding finishes spatial geometry before any field background reappears', () => {
  const spatial = teacherPose(frame.snapshot, 1280, 560, 'spatial-paths');
  for (const layout of ['parallel', 'path-comparison', 'endpoint-comparison'] as const) {
    const animator = createPresentationAnimator();
    animator.setTarget(teacherPose(frame.snapshot, 1280, 560, layout), 'none', 0, true);
    animator.setTarget(spatial, 'fold-to-field', 0);
    for (const p of [.5, .85, .87, .9, .95, 1]) {
      const pose = animator.sample(p * 1360)!;
      if (pose.backgroundOpacity > 0) pose.placements.forEach((placement, i) => {
        close(placement.distanceScale, spatial.placements[i].distanceScale);
        close(placement.origin.x, spatial.placements[i].origin.x);
        close(placement.origin.y, spatial.placements[i].origin.y);
        close(placement.angle, spatial.placements[i].angle);
      });
    }
  }
});
