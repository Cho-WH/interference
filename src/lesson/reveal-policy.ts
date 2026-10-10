import type { CueSpec, FrameValidity, SemanticId, TeacherOverride } from './types';

const predictionMask: readonly SemanticId[] = ['field', 'path-1', 'path-2', 'component-1', 'component-2',
  'resultant', 'local-probe-result', 'same-distance-correspondence', 'endpoint-links', 'rule'];
export const analysisInformation: readonly SemanticId[] = ['same-distance-correspondence', 'path-difference', 'wavelength-ruler', 'rule'];

/** One policy feeds pixels, accessible text and readouts. Overrides never bypass it. */
export function resolveVisibility(cue: CueSpec, validity: FrameValidity, override: TeacherOverride = {}): ReadonlySet<SemanticId> {
  const result = new Set(cue.visible);
  for (const id of cue.overrideable) {
    if (override[id] === true) result.add(id);
    if (override[id] === false) result.delete(id);
  }
  if (cue.revealPolicy === 'predict-from-paths') predictionMask.forEach(id => result.delete(id));
  if (cue.revealPolicy !== 'explain') (['resultant', 'local-probe-result', 'rule', 'field'] as const).forEach(id => result.delete(id));
  if (!validity.analysisSteady) analysisInformation.forEach(id => result.delete(id));
  if (!validity.probeSteady) result.delete('rule');
  return result;
}
export function meetsValidity(cue: CueSpec, validity: FrameValidity) {
  return !cue.waitFor || (cue.waitFor.scope === 'analysis-steady' ? validity.analysisSteady : validity.probeSteady);
}
