import { assertLesson, validatePreset } from './validation';
import type { ExperimentPreset, LessonSpec } from './types';
export const LESSON_STORAGE_KEY = 'interference.teacher.lesson.v1';
const POSITION_KEY = 'interference.teacher.position.v1';
export interface SavedPosition { lessonId: string; revision: number; cueId: string; preset: ExperimentPreset; changed: boolean }
export function parseLesson(text: string): LessonSpec {
  if (text.length > 500_000) throw new Error('수업 파일은 500KB 이내여야 합니다.');
  const value: unknown = JSON.parse(text); assertLesson(value); return value;
}
export function saveLesson(lesson: LessonSpec, storage: Storage = localStorage) {
  assertLesson(lesson); storage.setItem(LESSON_STORAGE_KEY, JSON.stringify(lesson));
}
export function loadLesson(storage: Storage = localStorage): LessonSpec | undefined {
  const text = storage.getItem(LESSON_STORAGE_KEY); return text ? parseLesson(text) : undefined;
}
export function savePosition(position: SavedPosition, storage: Storage = localStorage) {
  storage.setItem(POSITION_KEY, JSON.stringify(position));
}
export function loadPosition(lesson: LessonSpec, storage: Storage = localStorage): SavedPosition | undefined {
  const text = storage.getItem(POSITION_KEY);
  if (!text) return;
  const value = JSON.parse(text) as SavedPosition;
  if (value?.lessonId !== lesson.id || value.revision !== lesson.revision ||
    !lesson.scenes.some(s => s.cues.some(c => c.id === value.cueId)) || validatePreset(value.preset, 'preset').length) return;
  return value;
}
export function exportLesson(lesson: LessonSpec) {
  assertLesson(lesson);
  const url = URL.createObjectURL(new Blob([JSON.stringify(lesson, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '간섭-수업-' + lesson.revision + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
