import { LIMITS } from '../model/state';
import { LAYOUT_IDS, SEMANTIC_IDS, TRANSITION_IDS, flattenLesson, type LessonSpec } from './types';

export interface LessonError { path: string; message: string; cueId?: string }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['constructor', 'prototype', '__proto__'].includes(v);
const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function keys(v: Record<string, unknown>, allowed: readonly string[], path: string, errors: LessonError[]) {
  for (const key of Object.keys(v)) if (!allowed.includes(key)) errors.push({ path: path + '.' + key, message: '지원하지 않는 항목입니다: ' + key });
}
export function validatePreset(v: unknown, path: string): LessonError[] {
  const errors: LessonError[] = [];
  if (!object(v)) return [{ path, message: '예제 조건이 객체여야 합니다.' }];
  keys(v, ['probe', 'wavelength', 'separation'], path, errors);
  if (!object(v.probe)) errors.push({ path: path + '.probe', message: 'P의 좌표가 필요합니다.' });
  else {
    keys(v.probe, ['x', 'y'], path + '.probe', errors);
    if (!finite(v.probe.x, 0, 1.2) || !finite(v.probe.y, 0, .72)) errors.push({ path: path + '.probe', message: 'P의 범위: x 0~1.2m, y 0~0.72m.' });
  }
  for (const name of ['wavelength', 'separation'] as const) {
    if (!finite(v[name], LIMITS[name][0], LIMITS[name][1])) errors.push({ path: path + '.' + name, message: name === 'wavelength' ? '파장은 0.06~0.30m입니다.' : '파원 간격은 0.06~0.54m입니다.' });
  }
  return errors;
}
export const PROTECTED_STOPS: Record<string, string> = {
  's2-both': '같은 순간에 멈추고 펼치기 전 정지', 's3-parallel': '같은 두 경로의 대응을 확인하는 정지',
  's5-endpoints': '성분을 재생하기 전 정지', 's5-components-playing': '합을 예측하고 공개하기 전 정지',
  's6-a-space': '현재 P로 공간 복귀 후 정지', 's6-b-space': '새 P의 공간 경로를 관찰하는 정지',
  's6-b-parallel': '새 두 경로의 대응을 확인하는 정지',
  's6-b-predict': '다른 P의 결과를 예측하는 정지', 's6-b-paths': '두 성분으로 합을 예측하는 정지',
  's7-b-space': '파장 변경 전 현재 경로로 공간 복귀',
  's7-a-predict': '파장 변경 전 예측', 's7-c-change': '새 파장의 공간 무늬 관찰',
  's7-b-predict': '같은 P에서 파장 두 배 예측', 's7-c-compare': '같은 경로차의 이전·지금 파장 비교',
  's7-c-parallel': '새 파장의 두 경로 대응 확인', 's7-c-fit': '새 파장의 거리 비교 시작',
  's7-c-paths': '새 파장의 성분을 재생하기 전 정지', 's7-c-components-playing': '새 파장에서 합 공개 전 정지',
};
export function validateLesson(value: unknown): LessonError[] {
  const errors: LessonError[] = [];
  const error = (path: string, message: string, cueId?: string) => errors.push({ path, message, cueId });
  if (!object(value)) return [{ path: '$', message: '수업 JSON 객체가 필요합니다.' }];
  keys(value, ['schemaVersion', 'id', 'title', 'revision', 'engineContract', 'modelProfile', 'motionSpeed', 'experiments', 'wavelengthChange', 'scenes'], '$', errors);
  if (value.schemaVersion !== 1) error('schemaVersion', '지원하는 수업 형식은 버전 1입니다.');
  if (value.engineContract !== 'wave-frame-v1' || value.modelProfile !== 'equal-phase-equal-amplitude-v1') error('modelProfile', '같은 위상·같은 진폭의 지원 모델만 사용할 수 있습니다.');
  if (!id(value.id)) error('id', '유효한 수업 ID가 필요합니다.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 300) error('title', '수업 제목은 1~300자입니다.');
  if (!Number.isInteger(value.revision) || !finite(value.revision, 1, 1000000)) error('revision', '개정 번호는 양의 정수입니다.');
  if (!['slow', 'normal', 'fast'].includes(value.motionSpeed as string)) error('motionSpeed', '연출 속도는 느리게·보통·빠르게 중 선택합니다.');
  if (!object(value.experiments) || !Object.keys(value.experiments).length || Object.keys(value.experiments).length > 50) {
    error('experiments', '예제는 1~50개가 필요합니다.'); return errors;
  }
  for (const [name, preset] of Object.entries(value.experiments)) {
    if (!id(name)) error('experiments.' + name, '유효하지 않은 예제 ID입니다.');
    errors.push(...validatePreset(preset, 'experiments.' + name));
  }
  if (value.wavelengthChange !== undefined) {
    const change = value.wavelengthChange;
    if (!object(change)) error('wavelengthChange', '파장 변경의 기준과 배율이 필요합니다.');
    else {
      keys(change, ['fromContextId', 'toContextId', 'factor'], 'wavelengthChange', errors);
      if (!id(change.fromContextId) || !id(change.toContextId) || change.fromContextId === change.toContextId ||
        !Object.hasOwn(value.experiments, change.fromContextId) || !Object.hasOwn(value.experiments, change.toContextId) ||
        !finite(change.factor, .2, 5)) error('wavelengthChange', '서로 다른 두 예제와 유효한 파장 배율이 필요합니다.');
    }
  }
  if (!Array.isArray(value.scenes) || value.scenes.length === 0 || value.scenes.length > 50) {
    error('scenes', '장면은 1~50개가 필요합니다.'); return errors;
  }
  const sceneIds = new Set<string>(), cueIds = new Set<string>();
  for (const [s, scene] of value.scenes.entries()) {
    const sp = 'scenes[' + s + ']';
    if (!object(scene)) { error(sp, '장면 객체가 필요합니다.'); continue; }
    keys(scene, ['id', 'title', 'cues'], sp, errors);
    if (!id(scene.id) || sceneIds.has(scene.id)) error(sp + '.id', '장면 ID는 유효하고 고유해야 합니다.');
    else sceneIds.add(scene.id);
    if (typeof scene.title !== 'string' || scene.title.length > 200 || !scene.title.trim()) error(sp + '.title', '장면 제목이 필요합니다.');
    if (!Array.isArray(scene.cues) || !scene.cues.length || scene.cues.length > 80) { error(sp, '장면에 1~80개의 단계가 필요합니다.'); continue; }
    for (const [c, cue] of scene.cues.entries()) {
      const cp = sp + '.cues[' + c + ']';
      if (!object(cue)) { error(cp, '단계 객체가 필요합니다.'); continue; }
      const cueId = typeof cue.id === 'string' ? cue.id : undefined;
      keys(cue, ['id', 'label', 'experimentContextId', 'layout', 'fieldMode', 'visible', 'emphasis', 'revealPolicy', 'allowedInputs', 'overrideable', 'transition', 'stop', 'nextAction', 'question', 'teacherNotes', 'showQuestion', 'waitFor'], cp, errors);
      if (!id(cue.id) || cueIds.has(cue.id)) error(cp + '.id', '단계 ID는 수업 전체에서 고유해야 합니다.', cueId);
      else cueIds.add(cue.id);
      if (!id(cue.experimentContextId) || !Object.hasOwn(value.experiments, cue.experimentContextId)) error(cp, '단계에서 참조한 예제가 없습니다.', cueId);
      if (typeof cue.label !== 'string' || !cue.label.trim() || cue.label.length > 150) error(cp, '단계 이름이 필요합니다.', cueId);
      if (!LAYOUT_IDS.includes(cue.layout as never) || !TRANSITION_IDS.includes(cue.transition as never)) error(cp, '지원하지 않는 구도 또는 전환입니다.', cueId);
      if (!['wave', 'amplitude'].includes(cue.fieldMode as string) || !['explain', 'predict-from-paths', 'predict-sum'].includes(cue.revealPolicy as string)) error(cp, '올바른 파동 보기와 공개 정책이 필요합니다.', cueId);
      if (cue.stop !== 'manual' || typeof cue.showQuestion !== 'boolean') error(cp, '모든 단계는 교사가 직접 진행하며 질문 공개 여부가 필요합니다.', cueId);
      for (const key of ['visible', 'emphasis', 'overrideable', 'allowedInputs']) {
        const list = cue[key], allowed: readonly unknown[] = key === 'allowedInputs' ? ['probe', 'wavelength', 'separation'] : SEMANTIC_IDS;
        if (!Array.isArray(list) || list.some(v => !allowed.includes(v)) || new Set(list).size !== list.length) error(cp + '.' + key, '중복 없이 지원하는 항목만 선택해 주세요.', cueId);
      }
      for (const key of ['question', 'teacherNotes']) if (cue[key] !== undefined && (typeof cue[key] !== 'string' || (cue[key] as string).length > 4000)) error(cp + '.' + key, '문장은 4000자 이내여야 합니다.', cueId);
      if (cue.nextAction !== undefined) {
        if (!object(cue.nextAction)) error(cp + '.nextAction', '다음 동작이 잘못되었습니다.', cueId);
        else {
          keys(cue.nextAction, ['label', 'clockIntent'], cp + '.nextAction', errors);
          if (typeof cue.nextAction.label !== 'string' || !cue.nextAction.label.trim() || cue.nextAction.label.length > 150 ||
            !['preserve', 'pause-explicit', 'play-explicit'].includes(cue.nextAction.clockIntent as string)) error(cp, '다음 동작 이름과 재생 의도를 확인하세요.', cueId);
        }
      }
      if (cue.waitFor !== undefined) {
        if (!object(cue.waitFor)) error(cp + '.waitFor', '공개 대기 조건이 잘못되었습니다.', cueId);
        else {
          keys(cue.waitFor, ['scope', 'holdCueId'], cp + '.waitFor', errors);
          if (!['probe-steady', 'analysis-steady'].includes(cue.waitFor.scope as string) || !id(cue.waitFor.holdCueId)) error(cp + '.waitFor', '유효한 대기 범위와 대기 단계가 필요합니다.', cueId);
        }
      }
    }
  }
  if (errors.length) return errors;
  const lesson = value as unknown as LessonSpec, positions = flattenLesson(lesson);
  // Old authored lessons keep their original prediction policy. The spatial
  // sequence is identified by its cues, not by a teacher's edit revision.
  const spatialWavelength = ['s7-b-space', 's7-c-parallel', 's7-c-components-playing'].some(id => cueIds.has(id));
  const doubledWavelength = cueIds.has('s7-b-predict');
  if (doubledWavelength && (!lesson.wavelengthChange || lesson.wavelengthChange.fromContextId !== 'B' ||
    lesson.wavelengthChange.toContextId !== 'C' || lesson.wavelengthChange.factor !== 2))
    error('wavelengthChange', '이 수업은 B의 같은 P에서 파장만 두 배로 바꾸어 C로 이어갑니다.');
  if (lesson.wavelengthChange) {
    const change = lesson.wavelengthChange, before = lesson.experiments[change.fromContextId], after = lesson.experiments[change.toContextId];
    if (before.probe.x !== after.probe.x || before.probe.y !== after.probe.y || before.separation !== after.separation ||
      Math.abs(before.wavelength * change.factor - after.wavelength) > 1e-10)
      error('wavelengthChange', '기준·변경 예제는 P·파원 간격이 같고 지정한 배율만큼 파장만 달라야 합니다.');
  }
  const requiredPolicies: Record<string, string | readonly string[]> = {
    's5-endpoints': 'predict-sum', 's5-components-playing': 'predict-sum',
    's6-b-space': ['predict-sum', 'predict-from-paths'], 's6-b-parallel': ['predict-sum', 'predict-from-paths'],
    's6-b-predict': ['predict-sum', 'predict-from-paths'], 's6-b-paths': 'predict-sum',
    's7-a-predict': spatialWavelength ? 'predict-sum' : 'predict-from-paths',
    's7-b-predict': 'predict-sum', 's7-c-compare': 'predict-sum',
    's7-c-change': spatialWavelength ? 'predict-sum' : 'predict-from-paths',
    's7-c-parallel': 'predict-sum', 's7-c-fit': 'predict-sum', 's7-c-paths': 'predict-sum', 's7-c-components-playing': 'predict-sum',
  };
  positions.forEach(({ cue }, i) => {
    if (cue.visible.includes('wavelength-comparison') && (!lesson.wavelengthChange || cue.experimentContextId !== lesson.wavelengthChange.toContextId))
      error(cue.id, '이전·지금 파장 비교에는 파장 변경 관계와 변경 후 예제가 필요합니다.', cue.id);
    if (doubledWavelength && (cue.id === 's7-b-predict' && cue.experimentContextId !== 'B' ||
      cue.id.startsWith('s7-c-') && cue.experimentContextId !== 'C'))
      error(cue.id, '파장 두 배 예측은 B, 변경 이후는 C의 조건을 사용하세요.', cue.id);
    const required = requiredPolicies[cue.id];
    if (required && !(Array.isArray(required) ? required.includes(cue.revealPolicy) : cue.revealPolicy === required))
      error(cue.id, '보호된 예측 단계의 결과 가림은 유지해야 합니다.', cue.id);
    const clock = cue.id === 's2-both' || spatialWavelength && cue.id === 's7-c-change' ? 'pause-explicit' :
      cue.id === 's5-endpoints' || spatialWavelength && ['s7-a-predict', 's7-b-predict', 's7-c-paths'].includes(cue.id) ? 'play-explicit' : undefined;
    if (clock && cue.nextAction?.clockIntent !== clock)
      error(cue.id, '멈추고 펼치기·파장 변경과 재생·재생하며 관찰의 명시적 시간 조작을 유지하세요.', cue.id);
    if (spatialWavelength && ['s7-a-predict', 's7-b-predict', 's7-c-change'].includes(cue.id) &&
      (!['field', 'spatial-paths'].includes(cue.layout) || cue.fieldMode !== 'wave' ||
        !(['field', 'path-1', 'path-2'] as const).every(id => cue.visible.includes(id))))
      error(cue.id, '파장 변경 전후에는 공간의 파동 배경과 두 경로 위 파형을 유지하세요.', cue.id);
    if (spatialWavelength && ['s7-c-parallel', 's7-c-paths', 's7-c-sum'].includes(cue.id) &&
      (cue.waitFor?.scope !== 'analysis-steady' || cue.waitFor.holdCueId !== 's7-c-change'))
      error(cue.id, '새 파장의 공간 관찰에서 정상 상태를 확인한 뒤 분석을 진행하세요.', cue.id);
    if (i < positions.length - 1 && !cue.nextAction) error(cue.id, '다음에 수행할 동작을 적어 주세요.', cue.id);
    if (cue.waitFor) {
      const h = positions.findIndex(p => p.cue.id === cue.waitFor!.holdCueId), hold = positions[h]?.cue;
      if (!hold || h >= i || hold.waitFor || hold.experimentContextId !== cue.experimentContextId) error(cue.id, '대기는 같은 예제의 앞선 단계여야 하며 중첩 대기를 가질 수 없습니다.', cue.id);
      else if (hold.visible.some(v => ['same-distance-correspondence', 'path-difference', 'wavelength-ruler', 'wavelength-comparison', 'rule', 'resultant'].includes(v))) error(cue.id, '대기 단계에 아직 확인할 수 없는 해석 정보가 있습니다.', cue.id);
    }
  });
  // The basic lesson is a constrained template, not an arbitrary animation program.
  if (positions.some(p => p.cue.id === 's7-c-change')) {
    const a = lesson.experiments.A, c = lesson.experiments.C;
    if (!doubledWavelength && (!a || !c || a.probe.x !== c.probe.x || a.probe.y !== c.probe.y || a.separation !== c.separation || Math.abs(a.wavelength / 2 - c.wavelength) > 1e-10))
      error('experiments.C', '같은 P의 파장 절반 예제: A와 C의 P·간격은 같고 C의 파장은 A의 절반이어야 합니다.', 's7-c-change');
    const ordered = [doubledWavelength ? 's7-b-predict' : 's7-a-predict', 's7-c-change', 's7-c-paths', 's7-c-sum'];
    if (ordered.some((v, i) => !cueIds.has(v) || (i > 0 && positions.findIndex(p => p.cue.id === v) <= positions.findIndex(p => p.cue.id === ordered[i - 1]))))
      error('scenes', '파장 예측 → 변경 → 성분 → 합의 보호 순서를 유지하세요.', 's7-c-change');
  }
  const groups = [['s2-both', 's3-parallel', 's4-fit'], ['s5-endpoints', 's5-components-playing', 's5-sum'],
    ['s6-b-predict', 's6-b-paths', 's6-b-sum']];
  // Older authored lessons remain valid; the new spatial sequence stays intact when present.
  if (['s6-a-space', 's6-b-space', 's6-b-parallel'].some(id => cueIds.has(id)))
    groups.push(['s5-sum', 's6-a-space', 's6-b-space', 's6-b-parallel', 's6-b-predict']);
  if (spatialWavelength)
    groups.push(['s6-b-sum', 's7-b-space', doubledWavelength ? 's7-b-predict' : 's7-a-predict', 's7-c-change', 's7-c-parallel',
      doubledWavelength ? 's7-c-compare' : 's7-c-fit', 's7-c-paths', 's7-c-components-playing', 's7-c-sum']);
  for (const group of groups) {
    if (!group.some(v => cueIds.has(v))) continue;
    const indices = group.map(v => positions.findIndex(p => p.cue.id === v));
    if (indices.some((n, i) => n < 0 || i > 0 && n <= indices[i - 1])) error('scenes', '예측과 확인의 보호된 정지 순서를 유지하세요.', group[0]);
  }
  return errors;
}
export function assertLesson(value: unknown): asserts value is LessonSpec {
  const errors = validateLesson(value);
  if (errors.length) throw new Error(errors.map(e => e.path + ': ' + e.message).join('\n'));
}
