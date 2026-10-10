import { DEFAULT_LESSON, EXPERIMENTS } from './default-lesson';
import { flattenLesson, type CueSpec, type LessonSpec } from './types';
import { samePreset } from './runner';

/** Default numerical claims apply to the built-in example only. Teacher-authored
 * questions remain authoritative when that teacher edits the example preset. */
export function teachingCopy(cue: CueSpec, lesson: LessonSpec, changed: boolean) {
  if (changed) return {
    question: '조건이 달라졌습니다. 지금의 경로차와 파장으로 다시 설명해 보세요.',
    notes: '조건이 변경되었습니다. 현재 값으로 질문을 조정해 주세요.',
  };
  const original = flattenLesson(DEFAULT_LESSON).find(p => p.cue.id === cue.id)?.cue;
  const preset = lesson.experiments[cue.experimentContextId], standard = EXPERIMENTS[cue.experimentContextId];
  const customized = original && preset && standard && !samePreset(preset, standard);
  return {
    question: customized && cue.question === original.question
      ? '현재 경로차는 파장의 몇 배이며, P의 두 성분은 어떤 관계일까요?' : cue.question,
    notes: customized && cue.teacherNotes === original.teacherNotes
      ? '이 예제의 입력 조건이 편집되었습니다. 현재 거리와 파장으로 질문을 조정해 주세요.' : cue.teacherNotes,
  };
}
