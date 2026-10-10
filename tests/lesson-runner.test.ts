import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonRunner } from '../src/lesson/runner';
import { createExperimentController } from '../src/app/experiment-controller';
import { DEFAULT_LESSON, EXPERIMENTS } from '../src/lesson/default-lesson';
import { flattenLesson } from '../src/lesson/types';

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
  assert.equal(s.experiment.model.wavelength, .075); assert.equal(s.runner.state.cue.id, 's7-c-change');
  assert.equal(s.runner.state.canNext, false);
  for (let i = 0; i < 5; i++) assert.equal(s.runner.next(), false);
  s.time(20000); assert.equal(s.runner.state.canNext, false, 'paused wall-clock time cannot finish propagation');
  s.experiment.setPlaying(true, 20000); s.time(40000);
  assert.equal(s.runner.state.canNext, true); assert.equal(s.runner.state.cue.id, 's7-c-change');
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's7-c-paths');
  assert.equal(s.runner.visible.has('resultant'), false);
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's7-c-sum');
  assert.equal(s.runner.visible.has('resultant'), true);
  s.jump('s7-a-predict'); assert.equal(s.experiment.model.wavelength, .15);
  s.runner.next(); assert.equal(s.experiment.model.wavelength, .075); assert.equal(s.runner.state.cue.id, 's7-c-change');
});
test('blackout persists across navigation; override clears; locked input cannot change prediction', () => {
  const s = setup(); s.runner.toggleBlackOut(); s.runner.setOverride('resultant', true);
  s.runner.next(); assert.equal(s.runner.blackOut, true); assert.deepEqual(s.runner.teacherOverride, {});
  s.jump('s6-b-predict'); const preset = s.experiment.model;
  assert.equal(s.runner.manual({ type: 'wavelength', value: .2 }), false);
  assert.equal(s.experiment.model, preset);
  s.runner.setOverride('resultant', true); s.runner.setOverride('component-1', true);
  for (const id of ['resultant', 'component-1', 'field', 'path-1', 'same-distance-correspondence'] as const)
    assert.equal(s.runner.visible.has(id), false);
  s.runner.toggleBlackOut(); assert.equal(s.runner.state.cue.id, 's6-b-predict');
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
    for (const answer of ['field', 'path-1', 'component-1', 'resultant'] as const) {
      s.runner.setOverride(answer, true); assert.equal(s.runner.visible.has(answer), false);
    }
    s.runner.next(); assert.equal(s.runner.state.cue.id, next);
    assert.equal(s.experiment.generation, bGeneration); assert.equal(s.experiment.playing, false);
    assert.equal(s.experiment.timeSeconds, 1);
  }
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's6-b-paths');
  assert.equal(s.runner.visible.has('resultant'), false);
  s.runner.next(); assert.equal(s.runner.state.cue.id, 's6-b-sum');
  assert.equal(s.runner.visible.has('resultant'), true);
});
