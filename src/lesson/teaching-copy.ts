import { DEFAULT_LESSON, EXPERIMENTS } from './default-lesson';
import { flattenLesson, type CueSpec, type LessonSpec } from './types';
import { samePreset } from './runner';

// Only prompts that assume the built-in distances or interference result need
// another wording. Keep each cue's teaching purpose without giving the answer.
const currentConditionsCopy: Record<string, { question?: string; notes?: string }> = {
  's2-path2': { notes: '두 파동이 P에 도착하는 모습과 각 성분의 진동을 관찰합니다.' },
  's4-values': {
    question: '지금의 경로차는 파장의 몇 배이며, P에서 어떤 위상차를 만들까요?',
    notes: '현재 표시된 두 거리의 차이를 파장과 비교하고, 도착 위상차와 연결합니다.',
  },
  's5-components-playing': { notes: '두 주기 이상 관찰합니다. 한순간의 변위만으로 위상 관계를 판단하지 않도록 합니다.' },
  's5-sum': {
    question: '두 성분의 변위와 P의 합성 진동은 어떻게 연결되나요?',
    notes: '같은 순간의 두 성분 변위를 더한 값과 합성점의 변위를 비교합니다. 시간에 따른 변화도 관찰합니다.',
  },
  's6-b-predict': { question: '지금의 경로차와 파장으로 P의 합성 진동을 예상해 보세요.' },
  's6-b-paths': {
    question: '지금의 경로차를 지나온 두 성분은 어떤 위상 관계인가요?',
    notes: '경로차가 파장의 몇 배인지와 두 성분의 위상 관계를 연결합니다. 합을 공개하기 전에 설명을 듣습니다.',
  },
  's6-b-sum': { question: '지금의 경로차와 파장을 합성 진동의 크기와 연결해 보세요.' },
  's7-a-predict': {
    question: 'P와 파원 간격을 유지하고 파장을 절반으로 바꾸면 어떻게 될까요?',
    notes: '현재 파장과 그 절반인 다음 파장을 구별합니다. 경로차가 파장의 몇 배가 될지 예상합니다.',
  },
  's7-c-paths': { question: '지금의 경로차에 새 파장이 몇 개 들어가나요?' },
  's7-c-sum': { question: '지금의 경로차와 파장은 P의 합성 진동과 어떻게 연결되나요?' },
};

/** Preserve stage-specific guidance and teacher-authored text after interaction.
 * Replace only built-in claims whose preset assumptions no longer apply. */
export function teachingCopy(cue: CueSpec, lesson: LessonSpec, changed: boolean) {
  const original = flattenLesson(DEFAULT_LESSON).find(p => p.cue.id === cue.id)?.cue;
  const preset = lesson.experiments[cue.experimentContextId], standard = EXPERIMENTS[cue.experimentContextId];
  const customized = original && preset && standard && !samePreset(preset, standard);
  const adapted = changed || customized ? currentConditionsCopy[cue.id] : undefined;
  return {
    question: original && cue.question === original.question ? adapted?.question ?? cue.question : cue.question,
    notes: original && cue.teacherNotes === original.teacherNotes ? adapted?.notes ?? cue.teacherNotes : cue.teacherNotes,
  };
}
