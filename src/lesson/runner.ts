import type { ExperimentAction, ExperimentController } from '../app/experiment-controller';
import { createLessonModel } from './default-lesson';
import { flattenLesson, type LessonSpec, type LessonState, type SemanticId, type TeacherOverride, type ExperimentPreset } from './types';
import { assertLesson } from './validation';
import { meetsValidity, resolveVisibility } from './reveal-policy';
import { sourceSeparation } from '../model/state';

export const currentPreset = (experiment: ExperimentController): ExperimentPreset => ({
  probe: { ...experiment.model.probe }, wavelength: experiment.model.wavelength, separation: sourceSeparation(experiment.model),
});
export const samePreset = (a: ExperimentPreset, b: ExperimentPreset) => Math.abs(a.probe.x - b.probe.x) < 1e-9 &&
  Math.abs(a.probe.y - b.probe.y) < 1e-9 && Math.abs(a.wavelength - b.wavelength) < 1e-9 && Math.abs(a.separation - b.separation) < 1e-9;

export function createLessonRunner(source: LessonSpec, options: {
  experiment: ExperimentController; now: () => number;
  transitionActive?: () => boolean; finishTransition?: () => void; replayTransition?: () => void;
  beforeChange?: () => void; onChange?: (state: LessonState) => void;
  initialCueId?: string; initialPreset?: ExperimentPreset;
}) {
  assertLesson(source);
  // Execution owns a detached copy. Editing never silently changes this run.
  const lesson: LessonSpec = structuredClone(source), positions = flattenLesson(lesson);
  const experiment = options.experiment;
  let index = Math.max(0, positions.findIndex(p => p.cue.id === options.initialCueId));
  let runId = 1, contextEntryId = 0, blackOut = false, exploring = false, disposed = false;
  let override: TeacherOverride = {};
  let returnPoint: { index: number; preset: ExperimentPreset } | undefined;
  const operations = new Set<string>();
  const entries: { id: number; context: string; skipped: boolean }[] = [];
  const validity = () => experiment.readBundle().validity;
  const state = (): LessonState => ({ ...positions[index], index, total: positions.length,
    canPrevious: index > 0 && !exploring,
    canNext: index < positions.length - 1 && !exploring && (positions[index + 1].cue.experimentContextId !== positions[index].cue.experimentContextId || meetsValidity(positions[index + 1].cue, validity())),
  });
  function notify() { if (!disposed) options.onChange?.(state()); }
  function applyEntry(context: string, reset = false, preset = lesson.experiments[context]) {
    const entry = ++contextEntryId;
    const key = runId + ':' + entry + ':apply-preset';
    if (operations.has(key)) return;
    operations.add(key);
    if (reset) experiment.reset(options.now(), createLessonModel(preset));
    else experiment.applyPreset(preset, options.now());
    entries.push({ id: entry, context, skipped: false });
  }
  function move(nextIndex: number, forward = false) {
    if (disposed || exploring || nextIndex < 0 || nextIndex >= positions.length || nextIndex === index) return false;
    const from = positions[index].cue, target = positions[nextIndex].cue;
    const crossing = from.experimentContextId !== target.experimentContextId;
    if (forward && !crossing && !meetsValidity(target, validity())) return false;
    options.beforeChange?.();
    // Clear all temporary disclosure before the single atomic experiment command.
    override = {};
    index = nextIndex;
    if (forward) {
      const intent = from.nextAction?.clockIntent;
      if (intent && intent !== 'preserve') experiment.setPlaying(intent === 'play-explicit', options.now());
    }
    if (crossing) applyEntry(target.experimentContextId);
    if (!meetsValidity(target, validity())) index = positions.findIndex(p => p.cue.id === target.waitFor!.holdCueId);
    notify();
    return true;
  }
  applyEntry(positions[index].cue.experimentContextId, true, options.initialPreset);
  experiment.setRate(1, options.now());
  experiment.setPlaying(true, options.now());
  return {
    lesson,
    get state() { return state(); },
    get blackOut() { return blackOut; },
    get exploring() { return exploring; },
    get teacherOverride() { return override; },
    get runId() { return runId; },
    get contextEntryId() { return contextEntryId; },
    get entries() { return entries.map(entry => ({ ...entry })); },
    get changedConditions() { return !samePreset(currentPreset(experiment), lesson.experiments[positions[index].cue.experimentContextId]); },
    get visible() { return resolveVisibility(positions[index].cue, validity(), override); },
    get nextLabel() {
      const next = positions[index + 1]?.cue;
      const label = positions[index].cue.nextAction?.label ?? '수업 마침';
      if (!next || next.experimentContextId === positions[index].cue.experimentContextId || label.includes('조건')) return label;
      return label + ' · 조건 ' + next.experimentContextId;
    },
    get previousLabel() {
      const prev = positions[index - 1]?.cue;
      return prev && prev.experimentContextId !== positions[index].cue.experimentContextId ? '이전 · 조건 ' + prev.experimentContextId + '로' : '이전';
    },
    next() {
      if (options.transitionActive?.()) { options.finishTransition?.(); notify(); return false; }
      return move(index + 1, true);
    },
    previous: () => move(index - 1),
    goTo(sceneId: string, cueId: string) { return move(positions.findIndex(p => p.scene.id === sceneId && p.cue.id === cueId)); },
    finishTransition() { options.finishTransition?.(); notify(); },
    replayTransition() { options.beforeChange?.(); options.replayTransition?.(); notify(); },
    setOverride(id: SemanticId, value: boolean) {
      if (positions[index].cue.overrideable.includes(id)) { override = { ...override, [id]: value }; notify(); }
    },
    toggleBlackOut() { blackOut = !blackOut; notify(); },
    manual(action: ExperimentAction) {
      if (disposed || options.transitionActive?.()) return false;
      const accepted = experiment.dispatch(action, options.now(), {
        allowedInputs: exploring ? ['probe', 'wavelength', 'separation'] : positions[index].cue.allowedInputs,
        changeMode: 'propagate',
        constrainProbe: point => ({ x: Math.min(1.2, Math.max(0, point.x)), y: Math.min(.72, Math.max(0, point.y)) }),
      });
      if (accepted) notify();
      return accepted;
    },
    explore() {
      if (exploring) return;
      options.beforeChange?.(); options.finishTransition?.();
      returnPoint = { index, preset: currentPreset(experiment) };
      exploring = true; override = {}; notify();
    },
    returnToLesson(restore = false) {
      if (!returnPoint) return;
      options.beforeChange?.(); index = returnPoint.index; exploring = false; override = {};
      if (restore) applyEntry(positions[index].cue.experimentContextId);
      returnPoint = undefined; notify();
    },
    restoreLessonConditions() {
      options.beforeChange?.(); override = {};
      applyEntry(positions[index].cue.experimentContextId); notify();
    },
    skipPropagation() {
      experiment.settle(options.now());
      if (entries.length) entries[entries.length - 1].skipped = true;
      notify();
    },
    restart(currentExample = false) {
      options.beforeChange?.(); options.finishTransition?.();
      if (!currentExample) index = 0;
      runId++; contextEntryId = 0; operations.clear(); entries.length = 0;
      override = {}; exploring = false; returnPoint = undefined;
      applyEntry(positions[index].cue.experimentContextId, true);
      experiment.setRate(1, options.now()); experiment.setPlaying(true, options.now()); notify();
    },
    dispose() { disposed = true; operations.clear(); },
  };
}
export type LessonRunner = ReturnType<typeof createLessonRunner>;
