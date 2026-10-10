import type { FieldMode } from '../model/types';

export const SEMANTIC_IDS = [
  'field', 'source-1', 'source-2', 'probe', 'local-probe-result', 'path-1', 'path-2',
  'component-1', 'component-2', 'resultant', 'same-distance-correspondence',
  'path-difference', 'wavelength-ruler', 'distance-values', 'endpoint-links',
  'same-probe-label', 'spatial-paths', 'path-baselines', 'condition-values', 'wavelength-comparison', 'rule',
] as const;
export type SemanticId = typeof SEMANTIC_IDS[number];
export const LAYOUT_IDS = ['field', 'spatial-paths', 'parallel', 'path-comparison', 'endpoint-comparison'] as const;
export type LayoutId = typeof LAYOUT_IDS[number];
export const TRANSITION_IDS = ['none', 'focus', 'unfold-in-place', 'fit-paths', 'focus-endpoints', 'fold-to-field', 'move-probe'] as const;
export type TransitionId = typeof TRANSITION_IDS[number];
export type ClockIntent = 'preserve' | 'pause-explicit' | 'play-explicit';
export type InputId = 'probe' | 'wavelength' | 'separation';
export type RevealPolicyId = 'explain' | 'predict-from-paths' | 'predict-sum';
export type MotionSpeed = 'slow' | 'normal' | 'fast';
export type ValidityScope = 'probe-steady' | 'analysis-steady';
export interface ExperimentPreset { probe: { x: number; y: number }; wavelength: number; separation: number }
export interface WavelengthChange { fromContextId: string; toContextId: string; factor: number }
export interface CueSpec {
  id: string; label: string; experimentContextId: string; layout: LayoutId; fieldMode: FieldMode;
  visible: readonly SemanticId[]; emphasis: readonly SemanticId[];
  revealPolicy: RevealPolicyId; allowedInputs: readonly InputId[]; overrideable: readonly SemanticId[];
  transition: TransitionId; stop: 'manual';
  nextAction?: Readonly<{ label: string; clockIntent: ClockIntent }>;
  question?: string; teacherNotes?: string; showQuestion: boolean;
  waitFor?: Readonly<{ scope: ValidityScope; holdCueId: string }>;
}
export interface SceneSpec { id: string; title: string; cues: readonly CueSpec[] }
export interface LessonSpec {
  schemaVersion: 1; id: string; title: string; revision: number;
  engineContract: 'wave-frame-v1'; modelProfile: 'equal-phase-equal-amplitude-v1';
  motionSpeed: MotionSpeed; experiments: Readonly<Record<string, ExperimentPreset>>;
  /** Continue the preceding experiment, changing only its wavelength. */
  wavelengthChange?: WavelengthChange;
  scenes: readonly SceneSpec[];
}
export interface LessonState {
  readonly scene: SceneSpec; readonly cue: CueSpec; readonly sceneIndex: number;
  readonly cueIndex: number; readonly index: number; readonly total: number;
  readonly canNext: boolean; readonly canPrevious: boolean;
}
export interface FrameValidity { timeSeconds: number; generation: number; probeSteady: boolean; analysisSteady: boolean }
export type TeacherOverride = Partial<Record<SemanticId, boolean>>;
export const flattenLesson = (lesson: LessonSpec) => lesson.scenes.flatMap((scene, sceneIndex) =>
  scene.cues.map((cue, cueIndex) => ({ scene, cue, sceneIndex, cueIndex })));
