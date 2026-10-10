import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonRunner } from '../src/lesson/runner';
import { createExperimentController } from '../src/app/experiment-controller';
import { DEFAULT_LESSON, EXPERIMENTS } from '../src/lesson/default-lesson';
import { flattenLesson } from '../src/lesson/types';
import { resolveVisibility } from '../src/lesson/reveal-policy';

function setup() {
  let now = 0, moving = false;
  const experiment = createExperimentController();
  const runner = createLessonRunner(DEFAULT_LESSON, { experiment, now: () => now,
    transitionActive: () => moving, finishTransition: () => { moving = false; } });
  return { experiment, runner, time(value: number) { now = value; experiment.advance(value); },
    transition() { moving = true; }, jump(id: string) {
      const p = flattenLesson(DEFAULT_LESSON).find(p => p.cue.id === id)!; return runner.goTo(p.scene.id, id);
    } };
}
test('forward consumes explicit clock intent; previous, jump and replay preserve time and play state', () => {
  const s = setup();
  s.jump('s2-both'); s.time(1000); s.runner.next();
  assert.equal(s.runner.state.cue.id, 's3-parallel'); assert.equal(s.experiment.playing, false);
  s.time(4000); assert.equal(s.experiment.timeSeconds, 1);
  s.runner.previous(); s.jump('s5-endpoints'); assert.equal(s.experiment.playing, false);
  s.runner.next(); assert.equal(s.experiment.playing, true);
  s.time(5000); assert.equal(s.experiment.timeSeconds, 2);
  s.jump('s3-parallel'); assert.equal(s.experiment.playing, true);
  s.transition(); s.runner.next(); assert.equal(s.runner.state.cue.id, 's3-parallel');
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's4-fit');
});
test('same-context movement preserves manual inputs, crossings apply one new entry at current time', () => {
  const s = setup(); s.time(1000);
  s.runner.manual({ type: 'probe', position: { x: .7, y: .3 } });
  const entry = s.runner.contextEntryId;
  s.jump('s4-fit'); s.runner.previous();
  assert.deepEqual(s.experiment.model.probe, { x: .7, y: .3 }); assert.equal(s.runner.contextEntryId, entry);
  s.jump('s6-b-predict'); assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.B.probe);
  s.jump('s2-both'); assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.A.probe);
  assert.equal(s.runner.contextEntryId, entry + 2); assert.equal(s.experiment.timeSeconds, 1);
  const generation = s.experiment.generation; s.runner.replayTransition(); s.runner.finishTransition();
  assert.equal(s.experiment.generation, generation);
});
test('direct C result jump lands on safe hold; readiness never automatically reveals or queues clicks', () => {
  const s = setup(); s.experiment.setPlaying(false, 0);
  s.jump('s7-c-sum');
  assert.equal(s.experiment.model.wavelength, .30); assert.equal(s.runner.state.cue.id, 's7-c-change');
  assert.equal(s.runner.state.canNext, false);
  for (let i = 0; i < 5; i++) assert.equal(s.runner.next(), false);
  s.time(20000); assert.equal(s.runner.state.canNext, false, 'paused wall-clock time cannot finish propagation');
  s.experiment.setPlaying(true, 20000); s.time(40000);
  assert.equal(s.runner.state.canNext, true); assert.equal(s.runner.state.cue.id, 's7-c-change');
  for (const cue of ['s7-c-parallel', 's7-c-compare', 's7-c-paths', 's7-c-components-playing']) {
    s.runner.next(); assert.equal(s.runner.state.cue.id, cue);
    assert.equal(s.runner.visible.has('resultant'), false);
  }
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's7-c-sum');
  assert.equal(s.runner.visible.has('resultant'), true);
  s.jump('s7-b-predict'); assert.equal(s.experiment.model.wavelength, .15);
  s.runner.next(); assert.equal(s.experiment.model.wavelength, .30); assert.equal(s.runner.state.cue.id, 's7-c-change');
});
test('blackout persists across navigation; override clears; locked input cannot change prediction', () => {
  const s = setup(); s.runner.toggleBlackOut(); s.runner.setOverride('resultant', true);
  s.runner.next(); assert.equal(s.runner.blackOut, true); assert.deepEqual(s.runner.teacherOverride, {});
  s.jump('s7-b-predict'); const preset = s.experiment.model;
  assert.equal(s.runner.manual({ type: 'wavelength', value: .2 }), false);
  assert.equal(s.experiment.model, preset);
  s.runner.setOverride('resultant', true); s.runner.setOverride('component-1', true);
  for (const id of ['resultant', 'component-1', 'same-distance-correspondence'] as const)
    assert.equal(s.runner.visible.has(id), false);
  for (const id of ['field', 'path-1', 'path-2'] as const) assert.equal(s.runner.visible.has(id), true);
  s.runner.toggleBlackOut(); assert.equal(s.runner.state.cue.id, 's7-b-predict');
});

test('double-wavelength lesson keeps B in space, waits for prediction, then plays the visible propagation', () => {
  const s = setup(); s.time(1000); s.experiment.setPlaying(false, 1000);
  s.jump('s6-b-sum');
  const generation = s.experiment.generation;
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's7-b-space');
  assert.equal(s.experiment.generation, generation);
  assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.B.probe);
  assert.equal(s.runner.state.cue.transition, 'fold-to-field');
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's7-b-predict');
  assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.B.probe);
  assert.equal(s.experiment.model.wavelength, .15);
  assert.equal(s.experiment.playing, false);
  const before = s.experiment.read().snapshot.probe.distances;
  s.time(9000);
  assert.equal(s.experiment.timeSeconds, 1, 'prediction waits without changing the physical time');
  s.runner.next();
  assert.equal(s.runner.state.cue.id, 's7-c-change');
  assert.equal(s.experiment.model.wavelength, .30);
  assert.equal(s.experiment.playing, true, 'the labelled change action explicitly starts playback');
  assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.B.probe);
  assert.deepEqual(s.experiment.read().snapshot.probe.distances, before);
  for (const id of ['field', 'path-1', 'path-2'] as const) assert.equal(s.runner.visible.has(id), true);
  assert.equal(s.runner.state.canNext, false);
  assert.equal(s.runner.next(), false, 'cannot pause into analysis before the new condition arrives');
  assert.equal(s.experiment.playing, true);
  s.time(29000);
  assert.equal(s.runner.state.cue.id, 's7-c-change', 'arrival does not auto-unfold');
  assert.equal(s.runner.state.canNext, true);
  s.runner.next();
  assert.equal(s.runner.state.cue.id, 's7-c-parallel');
  assert.equal(s.experiment.playing, false);
  assert.equal(s.runner.visible.has('field'), false);
  for (const id of ['path-1', 'path-2'] as const) assert.equal(s.runner.visible.has(id), true);
  s.runner.previous(); assert.equal(s.experiment.playing, false, 'backwards navigation does not restart playback');
  assert.equal(s.runner.visible.has('field'), true);
  assert.equal(s.experiment.model.wavelength, .30);
  s.jump('s7-b-predict');
  assert.equal(s.experiment.playing, false); assert.equal(s.experiment.model.wavelength, .15);
});
test('exploration return defaults to retaining inputs; restore propagates; reset alone restarts time', () => {
  const s = setup(); s.jump('s5-sum'); s.time(1000);
  s.runner.explore(); s.runner.manual({ type: 'probe', position: { x: 2, y: -1 } });
  assert.deepEqual(s.experiment.model.probe, { x: 1.2, y: 0 });
  s.runner.returnToLesson();
  assert.deepEqual(s.experiment.model.probe, { x: 1.2, y: 0 });
  assert.equal(s.runner.changedConditions, true); assert.equal(s.runner.state.cue.id, 's5-sum');
  s.runner.restoreLessonConditions(); assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.A.probe);
  assert.equal(s.experiment.timeSeconds, 1);
  s.runner.restart(true); assert.equal(s.experiment.timeSeconds, 0);
});

test('doubling uses the actual B inputs and retains its reference through reverse navigation and resume', () => {
  const s = setup(); s.jump('s6-b-sum');
  s.runner.manual({ type: 'probe', position: { x: .78, y: .14 } });
  s.runner.manual({ type: 'wavelength', value: .12 });
  s.runner.manual({ type: 'separation', value: .24 });
  s.runner.skipPropagation();
  const before = { probe: { ...s.experiment.model.probe }, wavelength: .12, separation: .24 };
  s.jump('s7-b-predict'); s.runner.next();
  assert.deepEqual(s.experiment.model.probe, before.probe);
  assert.equal(s.experiment.model.wavelength, .24);
  assert.deepEqual(s.runner.wavelengthReference, before);
  assert.deepEqual(s.runner.lesson, DEFAULT_LESSON, 'running inputs never rewrite the authored lesson');
  s.runner.previous();
  assert.equal(s.experiment.model.wavelength, .12);
  assert.deepEqual(s.experiment.model.probe, before.probe);
  s.runner.next(); assert.equal(s.experiment.model.wavelength, .24, 'does not double a second time');
  const resumed = createLessonRunner(DEFAULT_LESSON, { experiment: createExperimentController(), now: () => 0,
    initialCueId: 's7-c-change', initialPreset: { ...before, wavelength: .24 }, initialWavelengthReference: before });
  assert.deepEqual(resumed.wavelengthReference, before);
  resumed.previous(); assert.equal(resumed.state.cue.id, 's7-b-predict');
  assert.equal(resumed.changedConditions, true);
});

test('an out-of-range double wavelength is blocked without changing P, time, or playback', () => {
  const s = setup(); s.jump('s7-b-space');
  s.runner.manual({ type: 'wavelength', value: .2 }); s.runner.skipPropagation();
  s.experiment.setPlaying(false, 0); s.runner.next();
  const generation = s.experiment.generation;
  assert.equal(s.runner.state.canNext, false);
  assert.match(s.runner.blockedReason!, /파장/);
  assert.equal(s.runner.next(), false);
  assert.equal(s.experiment.model.wavelength, .2); assert.equal(s.experiment.generation, generation);
  assert.equal(s.experiment.playing, false);
});
test('fixed analysis validity is independent of camera and is invalidated by new commands', () => {
  const s = setup();
  s.runner.manual({ type: 'wavelength', value: .075 });
  const generation = s.experiment.generation; s.time(9000);
  const normal = s.experiment.readBundle({ x: 0, y: 0, width: 1.2, height: .72 });
  assert.equal(normal.validity.generation, generation);
  assert.equal(normal.validity.probeSteady, true); assert.equal(normal.validity.analysisSteady, true);
  s.runner.manual({ type: 'wavelength', value: .15 });
  assert.equal(s.experiment.readBundle().validity.analysisSteady, false);
  assert.ok(s.experiment.generation > generation);
});

test('spatial prediction permits wave observation but never the amplitude map or dedicated sum', () => {
  const cue = DEFAULT_LESSON.scenes[5].cues[1];
  const validity = { generation: 0, timeSeconds: 0, analysisSteady: true, probeSteady: true };
  const override = { field: true, resultant: true, 'local-probe-result': true };
  assert.equal(resolveVisibility(cue, validity, override).has('field'), true);
  assert.equal(resolveVisibility({ ...cue, fieldMode: 'amplitude' }, validity, override).has('field'), false);
  assert.equal(resolveVisibility({ ...cue, layout: 'parallel' }, validity, override).has('field'), false);
  for (const id of ['resultant', 'local-probe-result'] as const)
    assert.equal(resolveVisibility(cue, validity, override).has(id), false);
});

test('B starts after folding the current manual P and stops before unfolding and prediction', () => {
  const s = setup(); s.time(1000); s.experiment.setPlaying(false, 1000);
  const manualP = { x: .73, y: .32 };
  s.runner.manual({ type: 'probe', position: manualP }); s.jump('s5-sum');
  const entry = s.runner.contextEntryId, generation = s.experiment.generation;
  s.runner.next();
  assert.equal(s.runner.state.cue.id, 's6-a-space');
  assert.deepEqual(s.experiment.model.probe, manualP);
  assert.equal(s.runner.contextEntryId, entry); assert.equal(s.experiment.generation, generation);
  s.runner.next();
  assert.equal(s.runner.state.cue.id, 's6-b-space');
  assert.deepEqual(s.experiment.model.probe, EXPERIMENTS.B.probe);
  assert.equal(s.runner.contextEntryId, entry + 1);
  const bGeneration = s.experiment.generation;
  s.transition(); s.runner.next();
  assert.equal(s.runner.state.cue.id, 's6-b-space', 'next completes only the moving P');
  for (const next of ['s6-b-parallel', 's6-b-predict']) {
    assert.equal(s.runner.visible.has('field'), next === 's6-b-parallel', 'keep the spatial background until unfolding');
    for (const answer of ['local-probe-result', 'resultant'] as const) {
      s.runner.setOverride(answer, true); assert.equal(s.runner.visible.has(answer), false);
    }
    assert.equal(s.runner.visible.has('path-1'), true);
    assert.equal(s.runner.visible.has('path-2'), true);
    s.runner.next(); assert.equal(s.runner.state.cue.id, next);
    assert.equal(s.experiment.generation, bGeneration); assert.equal(s.experiment.playing, false);
    assert.equal(s.experiment.timeSeconds, 1);
  }
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's6-b-paths');
  assert.equal(s.runner.visible.has('resultant'), false);
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's6-b-sum');
  assert.equal(s.runner.visible.has('resultant'), true);
});
