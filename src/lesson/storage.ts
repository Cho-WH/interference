import { assertLesson, validatePreset } from './validation';
import type { ExperimentPreset, LessonSpec } from './types';
import { DEFAULT_LESSON } from './default-lesson';
import { LEGACY_WAVELENGTH_SCENES } from './legacy-default-scene7';
export const LESSON_STORAGE_KEY = 'interference.teacher.lesson.v1';
const POSITION_KEY = 'interference.teacher.position.v1';
export interface SavedPosition { lessonId: string; revision: number; cueId: string; preset: ExperimentPreset; changed: boolean; wavelengthReference?: ExperimentPreset }
export function parseLesson(text: string): LessonSpec {
  if (text.length > 500_000) throw new Error('수업 파일은 500KB 이내여야 합니다.');
  const value: unknown = JSON.parse(text); assertLesson(value); return value;
}
export function saveLesson(lesson: LessonSpec, storage: Storage = localStorage) {
  assertLesson(lesson); storage.setItem(LESSON_STORAGE_KEY, JSON.stringify(lesson));
}
export function loadLesson(storage: Storage = localStorage): LessonSpec | undefined {
  const text = storage.getItem(LESSON_STORAGE_KEY);
  if (!text) return;
  const lesson = parseLesson(text);
  // Upgrade only an untouched built-in revision. Never replace teacher edits.
  if (lesson.id === DEFAULT_LESSON.id && [4, 5, 6, 7].includes(lesson.revision)) {
    const previous = structuredClone(DEFAULT_LESSON); previous.revision = lesson.revision;
    delete previous.wavelengthChange;
    previous.experiments = { ...previous.experiments, C: { probe: { x: .8491202337626307, y: .238125 }, wavelength: .075, separation: .30 } };
    previous.scenes = previous.scenes.map(scene => scene.id === 'scene-7' ? structuredClone(LEGACY_WAVELENGTH_SCENES[lesson.revision === 7 ? 7 : 6]) : scene);
    if (lesson.revision === 7) return JSON.stringify(lesson) === JSON.stringify(previous) ? structuredClone(DEFAULT_LESSON) : lesson;
    previous.scenes[5].cues[5].nextAction = { label: '조건 A로 · 파장 변경 예측', clockIntent: 'preserve' };
    if (lesson.revision === 6) return JSON.stringify(lesson) === JSON.stringify(previous) ? structuredClone(DEFAULT_LESSON) : lesson;
    previous.scenes[2].cues[0].nextAction = { ...previous.scenes[2].cues[0].nextAction!, label: '크게 비교하기' };
    previous.scenes[3].cues[0].label = '크게 비교';
    previous.scenes[5].cues[2].teacherNotes = '두 길이를 바꾸지 않고 회전·이동만 합니다. 다음 동작에서 확대하고 거리·파장을 공개합니다.';
    if (JSON.stringify(lesson) === JSON.stringify(previous)) return structuredClone(DEFAULT_LESSON);
    if (lesson.revision !== 4) return lesson;
    const b = previous.scenes[5].cues[1];
    b.visible = b.visible.filter(id => id !== 'field');
    b.teacherNotes = 'P를 옮겨도 두 경로 위 파형을 유지합니다. 합성 진동과 간섭무늬는 가리고, 이동이 끝나면 관찰할 시간을 둡니다.';
    for (const note of [previous.scenes[0].cues[1].teacherNotes,
      'P는 관측 위치입니다. 옆의 보라색 점이 그곳의 순간 변위를 나타냅니다. 두 주기 이상 관찰합니다.']) {
      previous.scenes[0].cues[1].teacherNotes = note;
      if (JSON.stringify(lesson) === JSON.stringify(previous)) return structuredClone(DEFAULT_LESSON);
    }
  }
  return lesson;
}
export function savePosition(position: SavedPosition, storage: Storage = localStorage) {
  storage.setItem(POSITION_KEY, JSON.stringify(position));
}
export function loadPosition(lesson: LessonSpec, storage: Storage = localStorage): SavedPosition | undefined {
  const text = storage.getItem(POSITION_KEY);
  if (!text) return;
  const value = JSON.parse(text) as SavedPosition;
  if (value?.lessonId !== lesson.id || value.revision !== lesson.revision ||
    !lesson.scenes.some(s => s.cues.some(c => c.id === value.cueId)) || validatePreset(value.preset, 'preset').length ||
    value.wavelengthReference !== undefined && validatePreset(value.wavelengthReference, 'wavelengthReference').length) return;
  return value;
}
export function exportLesson(lesson: LessonSpec) {
  assertLesson(lesson);
  const url = URL.createObjectURL(new Blob([JSON.stringify(lesson, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '간섭-수업-' + lesson.revision + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
