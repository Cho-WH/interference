import type { CueSpec, LessonSpec } from './types';
import { flattenLesson } from './types';
import { PROTECTED_STOPS, validateLesson, type LessonError } from './validation';

export function createLessonDraft(initial: LessonSpec) {
  let draft = structuredClone(initial), undo: LessonSpec[] = [], redo: LessonSpec[] = [];
  let operationErrors: LessonError[] = [];
  function change(edit: (copy: LessonSpec) => void, strict = false) {
    const next = structuredClone(draft); edit(next); next.revision = draft.revision + 1;
    const errors = validateLesson(next);
    if (strict && errors.length) { operationErrors = errors; return false; }
    undo.push(draft); if (undo.length > 60) undo.shift();
    draft = next; redo = []; operationErrors = []; return true;
  }
  function patchCue(cueId: string, patch: Partial<CueSpec>) {
    return change(copy => {
      const cue = flattenLesson(copy).find(p => p.cue.id === cueId)?.cue;
      if (cue) Object.assign(cue, patch);
    });
  }
  function relink(copy: LessonSpec) {
    const cues = flattenLesson(copy).map(p => p.cue);
    cues.forEach((cue, i) => {
      cue.nextAction = cues[i + 1] ? { label: cues[i + 1].label,
        clockIntent: cue.nextAction?.clockIntent ?? 'preserve' } : undefined;
    });
  }
  return {
    get value() { return structuredClone(draft); },
    get errors() { return [...operationErrors, ...validateLesson(draft)]; },
    get valid() { return validateLesson(draft).length === 0; },
    get canUndo() { return undo.length > 0; }, get canRedo() { return redo.length > 0; },
    change, patchCue,
    replace(value: LessonSpec) { return change(copy => { for (const key of Object.keys(copy)) delete (copy as unknown as Record<string, unknown>)[key]; Object.assign(copy, structuredClone(value)); }, true); },
    moveScene(sceneId: string, direction: -1 | 1) {
      const index = draft.scenes.findIndex(s => s.id === sceneId), target = index + direction;
      if (index < 0 || target < 0 || target >= draft.scenes.length) return false;
      return change(copy => {
        const scenes = [...copy.scenes]; [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
        copy.scenes = scenes; relink(copy);
      }, true);
    },
    move(cueId: string, direction: -1 | 1) {
      const current = flattenLesson(draft).find(p => p.cue.id === cueId);
      if (!current) return false;
      const adjacent = current.scene.cues[current.cueIndex + direction];
      if (!adjacent) return false;
      if (PROTECTED_STOPS[cueId] || PROTECTED_STOPS[adjacent.id]) {
        operationErrors = [{ path: cueId, cueId, message: PROTECTED_STOPS[cueId] ?? PROTECTED_STOPS[adjacent.id] }]; return false;
      }
      return change(copy => {
        const scene = copy.scenes[current.sceneIndex], cues = [...scene.cues];
        [cues[current.cueIndex], cues[current.cueIndex + direction]] = [cues[current.cueIndex + direction], cues[current.cueIndex]];
        scene.cues = cues;
        relink(copy);
      }, true);
    },
    mergePrevious(cueId: string) {
      const current = flattenLesson(draft).find(p => p.cue.id === cueId);
      if (!current || !current.cueIndex) return false;
      const previous = current.scene.cues[current.cueIndex - 1];
      if (PROTECTED_STOPS[cueId] || PROTECTED_STOPS[previous.id] || previous.id === 's4-fit' ||
        previous.experimentContextId !== current.cue.experimentContextId || previous.revealPolicy !== current.cue.revealPolicy) {
        operationErrors = [{ path: cueId, cueId, message: '예측·결과 공개·회전 후의 보호된 정지는 묶을 수 없습니다.' }]; return false;
      }
      return change(copy => {
        const scene = copy.scenes[current.sceneIndex], cues = [...scene.cues];
        Object.assign(cues[current.cueIndex - 1], { visible: [...new Set([...previous.visible, ...current.cue.visible])],
          nextAction: current.cue.nextAction, question: current.cue.question });
        cues.splice(current.cueIndex, 1); scene.cues = cues;
      }, true);
    },
    undo() { const previous = undo.pop(); if (!previous) return; redo.push(draft); draft = previous; operationErrors = []; },
    redo() { const next = redo.pop(); if (!next) return; undo.push(draft); draft = next; operationErrors = []; },
  };
}
