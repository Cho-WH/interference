import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LESSON } from '../src/lesson/default-lesson';
import { flattenLesson } from '../src/lesson/types';
import { teachingCopy } from '../src/lesson/teaching-copy';

const cue = (id: string) => flattenLesson(DEFAULT_LESSON).find(p => p.cue.id === id)!.cue;

test('moving P preserves the distinct observation, unfolding and measurement prompts', () => {
  for (const id of ['s1-probe', 's2-path1', 's2-path2', 's2-both', 's3-parallel',
    's4-fit', 's4-common', 's4-extra', 's4-ruler', 's5-endpoints', 's5-components-playing', 's8-rule']) {
    assert.equal(teachingCopy(cue(id), DEFAULT_LESSON, true).question, cue(id).question, id);
  }
  assert.equal(teachingCopy(cue('s8-field'), DEFAULT_LESSON, true).notes, cue('s8-field').teacherNotes,
    'the hypothetical 1.5λ exercise is independent of the current P');
});

test('changed conditions replace preset-specific claims with relevant questions, and restore cleanly', () => {
  const prompts = new Set<string>();
  for (const id of ['s4-values', 's5-sum', 's6-b-predict', 's6-b-paths', 's6-b-sum', 's7-b-predict', 's7-c-compare', 's7-c-paths', 's7-c-sum']) {
    const original = cue(id), adapted = teachingCopy(original, DEFAULT_LESSON, true);
    assert.notEqual(adapted.question, original.question, id);
    assert.doesNotMatch(adapted.question!, /7\.5|15cm|한 파장 차|추가 반 파장|진동하지 않는|조건이 달라/);
    prompts.add(adapted.question!);
    assert.deepEqual(teachingCopy(original, DEFAULT_LESSON, false), {
      question: original.question, notes: original.teacherNotes,
    });
  }
  assert.equal(prompts.size, 9, 'each stage retains its own teaching purpose');
  assert.match(teachingCopy(cue('s4-values'), DEFAULT_LESSON, true).question!, /경로차.*파장.*위상차/);
  assert.match(teachingCopy(cue('s5-sum'), DEFAULT_LESSON, true).question!, /두 성분.*합성 진동/);
  assert.doesNotMatch(teachingCopy(cue('s5-sum'), DEFAULT_LESSON, true).notes!, /합이 계속 0|매 순간 반대/);
  assert.doesNotMatch(teachingCopy(cue('s2-path2'), DEFAULT_LESSON, true).notes!, /합이 정지/);
});

test('edited presets adapt claims while preserving general prompts and independently authored text', () => {
  const lesson = structuredClone(DEFAULT_LESSON);
  lesson.experiments.A.probe.x = .7;
  assert.equal(teachingCopy(cue('s2-path1'), lesson, false).question, cue('s2-path1').question);
  const original = cue('s4-values');
  assert.deepEqual(teachingCopy(original, lesson, false), teachingCopy(original, DEFAULT_LESSON, true));
  const authoredQuestion = { ...original, question: '새 관측점에서 두 거리를 비교해 보세요.' };
  const authoredNotes = { ...original, teacherNotes: '학생이 선택한 위치를 함께 확인합니다.' };
  for (const changed of [false, true]) {
    assert.equal(teachingCopy(authoredQuestion, lesson, changed).question, authoredQuestion.question);
    assert.notEqual(teachingCopy(authoredQuestion, lesson, changed).notes, original.teacherNotes);
    assert.equal(teachingCopy(authoredNotes, lesson, changed).notes, authoredNotes.teacherNotes);
    assert.notEqual(teachingCopy(authoredNotes, lesson, changed).question, original.question);
  }
});
