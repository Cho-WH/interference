import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LESSON } from '../src/lesson/default-lesson';
import { validateLesson } from '../src/lesson/validation';
import { parseLesson, saveLesson, loadLesson } from '../src/lesson/storage';
import { createLessonDraft } from '../src/lesson/editor-model';
import { flattenLesson } from '../src/lesson/types';
import { teachingCopy } from '../src/lesson/teaching-copy';

test('full lesson roundtrips without runtime state, scripts or unsupported fields', () => {
  assert.deepEqual(validateLesson(DEFAULT_LESSON), []);
  assert.deepEqual(parseLesson(JSON.stringify(DEFAULT_LESSON)), DEFAULT_LESSON);
  for (const edit of [(v: any) => { v.schemaVersion = 999; }, (v: any) => { v.experiments.A.speed = .8; },
    (v: any) => { v.experiments.A.probe.x = 1.3; }, (v: any) => { v.scenes[0].cues[0].onEnter = 'alert(1)'; },
    (v: any) => { v.scenes[0].cues[1].id = v.scenes[0].cues[0].id; }]) {
    const draft = structuredClone(DEFAULT_LESSON); edit(draft);
    assert.throws(() => parseLesson(JSON.stringify(draft)));
  }
});
test('unsafe holds, ordering and half-wavelength prerequisites are rejected', () => {
  for (const edit of [
    (v: any) => { v.scenes[6].cues[2].waitFor.holdCueId = 's7-c-sum'; },
    (v: any) => { v.scenes[6].cues[1].waitFor = { scope: 'analysis-steady', holdCueId: 's7-c-paths' }; },
    (v: any) => { v.experiments.C.probe.x = .5; },
    (v: any) => { v.scenes[5].cues.reverse(); },
    (v: any) => { v.scenes[5].cues.find((c: any) => c.id === 's6-b-space').revealPolicy = 'explain'; },
    (v: any) => { v.scenes[1].cues[2].nextAction.clockIntent = 'preserve'; },
  ]) {
    const draft = structuredClone(DEFAULT_LESSON); edit(draft);
    assert.ok(validateLesson(draft).length > 0);
  }
});

test('edited presets cannot retain built-in numerical claims, but teacher-authored questions survive', () => {
  const lesson = structuredClone(DEFAULT_LESSON), cue = lesson.scenes[3].cues[4];
  assert.equal(teachingCopy(cue, lesson, false).question, cue.question);
  lesson.experiments.A.probe.x = .7;
  assert.notEqual(teachingCopy(cue, lesson, false).question, cue.question);
  cue.question = '교사가 새 조건에 맞춰 작성한 질문';
  assert.equal(teachingCopy(cue, lesson, false).question, cue.question);
  assert.match(teachingCopy(cue, lesson, true).question!, /조건이 달라/);
});

test('scene moves retain protected ordering and relink the following action', () => {
  const draft = createLessonDraft(DEFAULT_LESSON), before = draft.value;
  assert.equal(draft.moveScene('scene-3', -1), false);
  assert.deepEqual(draft.value, before);
  assert.equal(draft.moveScene('scene-5', 1), false, 'return to space follows the preceding sum');
  assert.equal(draft.moveScene('scene-8', -1), true);
  assert.equal(draft.valid, true);
  const positions = flattenLesson(draft.value);
  positions.slice(0, -1).forEach((p, i) => assert.equal(p.cue.nextAction?.label, positions[i + 1].cue.label));
  draft.undo(); assert.deepEqual(draft.value, before);
});
test('draft edits have undo/redo, protected stops and cannot mutate an execution source', () => {
  const draft = createLessonDraft(DEFAULT_LESSON), source = JSON.stringify(DEFAULT_LESSON);
  draft.patchCue('s1-field', { question: '수정한 질문' });
  assert.equal(flattenLesson(draft.value)[0].cue.question, '수정한 질문');
  draft.undo(); assert.equal(JSON.stringify(draft.value), source);
  draft.redo(); assert.equal(flattenLesson(draft.value)[0].cue.question, '수정한 질문');
  const before = draft.value;
  assert.equal(draft.move('s6-b-paths', -1), false);
  assert.deepEqual(draft.value, before); assert.ok(draft.errors.length > 0);
  assert.equal(draft.mergePrevious('s3-parallel'), false);
  assert.equal(JSON.stringify(DEFAULT_LESSON), source);
});
test('failed import/storage validation preserves a previous saved lesson', () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value) } as unknown as Storage;
  saveLesson(DEFAULT_LESSON, storage);
  assert.throws(() => saveLesson({ ...DEFAULT_LESSON, schemaVersion: 2 } as any, storage));
  assert.deepEqual(loadLesson(storage), DEFAULT_LESSON);
});
