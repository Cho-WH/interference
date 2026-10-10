import { createModel, updateModel } from '../model/state';
import type { CueSpec, ExperimentPreset, LessonSpec, SemanticId } from './types';

export const EXPERIMENTS: Record<string, ExperimentPreset> = {
  A: { probe: { x: .8491202337626307, y: .238125 }, wavelength: .15, separation: .30 },
  B: { probe: { x: .8357106264483345, y: .0975 }, wavelength: .15, separation: .30 },
  C: { probe: { x: .8491202337626307, y: .238125 }, wavelength: .075, separation: .30 },
};
export function createLessonModel(preset: ExperimentPreset = EXPERIMENTS.A) {
  let model = updateModel(createModel(), { type: 'probe', position: preset.probe });
  model = updateModel(model, { type: 'wavelength', value: preset.wavelength });
  return updateModel(model, { type: 'separation', value: preset.separation });
}
const sources: SemanticId[] = ['source-1', 'source-2', 'probe'];
const paths: SemanticId[] = [...sources, 'path-1', 'path-2'];
const parallel: SemanticId[] = [...paths, 'same-probe-label'];
const common: SemanticId[] = [...parallel, 'same-distance-correspondence'];
const extra: SemanticId[] = [...common, 'path-difference'];
const ruler: SemanticId[] = [...extra, 'wavelength-ruler'];
const values: SemanticId[] = [...ruler, 'distance-values'];
const components: SemanticId[] = [...values, 'endpoint-links', 'component-1', 'component-2'];
const prediction: SemanticId[] = [...sources, 'path-baselines', 'distance-values', 'condition-values', 'same-probe-label'];

function cue(id: string, label: string, question: string, next: string | undefined,
  options: Partial<CueSpec> = {}): CueSpec {
  return { id, label, question, experimentContextId: 'A', layout: 'path-comparison', fieldMode: 'wave',
    visible: parallel, emphasis: [], transition: 'focus', allowedInputs: ['probe', 'wavelength', 'separation'],
    overrideable: ['distance-values', 'wavelength-ruler', 'component-1', 'component-2', 'resultant'],
    revealPolicy: 'explain', stop: 'manual', showQuestion: true,
    ...(next ? { nextAction: { label: next, clockIntent: 'preserve' as const } } : {}), ...options };
}
const waiting = (holdCueId: string) => ({ scope: 'analysis-steady' as const, holdCueId });

export const DEFAULT_LESSON: LessonSpec = {
  schemaVersion: 1, id: 'path-difference-lesson', revision: 3,
  engineContract: 'wave-frame-v1', modelProfile: 'equal-phase-equal-amplitude-v1',
  title: '두 파동이 모두 도착하는데, 왜 P는 진동하지 않을까?',
  motionSpeed: 'normal', experiments: EXPERIMENTS,
  scenes: [
    { id: 'scene-1', title: '전체 현상', cues: [
      cue('s1-field', '겹치는 두 파동', '두 파동이 겹치면 모든 곳이 더 크게 진동할까요?', 'P의 진동 보기',
        { layout: 'field', visible: ['field', ...sources], transition: 'none',
          teacherNotes: '같은 진동수·초기 위상, 같은 도착 진폭의 모델입니다. 전체 무늬를 관찰한 뒤 한 점에 주목합니다.' }),
      cue('s1-probe', 'P의 진동', '주변에는 변화가 있는데, P의 합은 시간이 지나도 어떨까요?', '첫 번째 경로 보기',
        { layout: 'field', visible: ['field', ...sources, 'local-probe-result'],
          teacherNotes: 'P는 관측 위치입니다. 옆의 보라색 점이 그곳의 순간 변위를 나타냅니다. 두 주기 이상 관찰합니다.' }),
    ] },
    { id: 'scene-2', title: 'P까지의 두 경로', cues: [
      cue('s2-path1', '파원 1의 기여', '파원 1의 파동은 P에서 어떻게 진동하나요?', '두 번째 경로 보기',
        { layout: 'spatial-paths', visible: ['field', ...sources, 'path-1'], emphasis: ['path-1'],
          teacherNotes: '다른 파원을 끄는 조작이 아닙니다. 두 파원은 계속 작동하고 표시만 강조합니다.' }),
      cue('s2-path2', '파원 2의 기여', '파원 2의 파동도 P에 도착하고 있나요?', '두 경로 함께 보기',
        { layout: 'spatial-paths', visible: ['field', ...sources, 'path-2'], emphasis: ['path-2'],
          teacherNotes: '도착한 두 성분은 각각 진동합니다. 도착하지 않아서 합이 정지한 것인지 질문합니다.' }),
      cue('s2-both', '두 경로 함께', '두 경로의 길이와 끝의 진동을 어떻게 비교할까요?', '멈추고 펼치기',
        { layout: 'spatial-paths', visible: ['field', ...paths],
          nextAction: { label: '멈추고 펼치기', clockIntent: 'pause-explicit' },
          teacherNotes: '누른 순간의 파형을 멈춘 뒤 각 파원을 중심으로 경로를 회전합니다.' }),
    ] },
    { id: 'scene-3', title: '같은 두 경로 펼치기', cues: [
      cue('s3-parallel', '제자리 펼침', '거리를 바꾼 걸까요, 같은 경로를 펼친 걸까요?', '크게 비교하기',
        { layout: 'parallel', transition: 'unfold-in-place',
          teacherNotes: '두 끝은 같은 P의 두 성분입니다. 길이와 파형은 그대로입니다. 여기서 충분히 기다립니다.' }),
    ] },
    { id: 'scene-4', title: '경로차와 파장', cues: [
      cue('s4-fit', '크게 비교', '두 파동은 어디까지 같은 거리를 이동했나요?', '같은 거리 짚기',
        { transition: 'fit-paths', teacherNotes: '행 사이 간격은 화면 배치입니다. 실제 파원 간격을 바꾸지 않았습니다.' }),
      cue('s4-common', '같은 거리', '같은 거리까지의 파형은 어떤 관계인가요?', '남는 길이 보기',
        { visible: common, waitFor: waiting('s4-fit'),
          teacherNotes: '속빈 점은 긴 경로 위 같은 거리의 표식입니다. 새로운 P가 아닙니다. 같은 초기 위상의 두 파원이라는 전제를 연결합니다.' }),
      cue('s4-extra', '추가 경로', '남는 구간에서 진동 단계는 얼마나 달라졌나요?', '파장 눈금 보기',
        { visible: extra, waitFor: waiting('s4-fit'), teacherNotes: '정지한 단면 위의 추가 길이를 짚습니다. 물 입자가 이동한 궤적이 아닙니다.' }),
      cue('s4-ruler', '파장으로 비교', '추가 길이는 한 파장의 얼마인가요?', '거리 수치 확인',
        { visible: ruler, waitFor: waiting('s4-fit'), teacherNotes: '숫자를 먼저 알려 주지 말고 눈금에서 읽게 합니다.' }),
      cue('s4-values', '거리 수치', '추가 반 파장은 P에서 어떤 위상차를 만들까요?', '도착점 보기',
        { visible: values, waitFor: waiting('s4-fit'), teacherNotes: 'A: 45cm, 52.5cm, 차 7.5cm. 파장 15cm의 절반이 한 주기의 절반 차이를 만듭니다.' }),
    ] },
    { id: 'scene-5', title: '같은 P에서 더하기', cues: [
      cue('s5-endpoints', '끝점 연결', '같은 P에 도착한 두 성분은 어떻게 움직일까요?', '재생하며 관찰',
        { layout: 'endpoint-comparison', transition: 'focus-endpoints', visible: components, revealPolicy: 'predict-sum',
          nextAction: { label: '재생하며 관찰', clockIntent: 'play-explicit' },
          teacherNotes: '각 점은 자기 0선에서 읽습니다. 화면의 절대 높이를 비교하지 않습니다.' }),
      cue('s5-components-playing', '성분 재생', '두 성분의 변위를 매 순간 더하면 어떻게 될까요?', '합 공개',
        { layout: 'endpoint-comparison', visible: components, revealPolicy: 'predict-sum',
          teacherNotes: '두 주기 이상 관찰합니다. 한순간 둘 다 0인 것과 항상 반대 위상인 것을 구별합니다.' }),
      cue('s5-sum', '합성 진동', '두 파동이 도착해도 P가 진동하지 않는 이유는 무엇인가요?', '공간으로 돌아가기',
        { layout: 'endpoint-comparison', visible: [...components, 'resultant'],
          teacherNotes: '같은 진폭으로 도착한 두 성분이 매 순간 반대여서 합이 계속 0입니다.' }),
    ] },
    { id: 'scene-6', title: '다른 P에서 예측', cues: [
      cue('s6-a-space', '현재 P로 공간 복귀', '지금 비교한 두 경로를 공간에서 다시 찾아볼까요?', '조건 B로 · P 옮기기',
        { layout: 'spatial-paths', transition: 'fold-to-field', visible: ['field', ...paths, 'local-probe-result'],
          teacherNotes: '교사가 옮긴 P도 그대로 유지하며 접어 돌아갑니다. 다음 동작에서만 조건 B를 불러옵니다.' }),
      cue('s6-b-space', 'P를 B로 이동', 'P를 옮기면 두 경로의 길이는 어떻게 바뀌나요?', '새 경로 펼치기',
        { experimentContextId: 'B', layout: 'spatial-paths', transition: 'move-probe',
          visible: [...sources, 'path-baselines'], revealPolicy: 'predict-from-paths', allowedInputs: [],
          teacherNotes: '간섭무늬·파형·성분·합을 가린 뒤 P의 이동과 두 경로를 관찰합니다. 이동이 끝나도 자동으로 펼치지 않습니다.' }),
      cue('s6-b-parallel', 'B의 두 경로 펼치기', '방금 본 두 경로를 같은 축척으로 비교해 보세요.', '거리와 파장 비교',
        { experimentContextId: 'B', layout: 'parallel', transition: 'unfold-in-place',
          visible: [...sources, 'path-baselines', 'same-probe-label'], revealPolicy: 'predict-from-paths', allowedInputs: [],
          teacherNotes: '두 길이를 바꾸지 않고 회전·이동만 합니다. 다음 동작에서 확대하고 거리·파장을 공개합니다.' }),
      cue('s6-b-predict', '한 파장 차이 예측', '한 파장 차이면, 더 많이 상쇄될까요?', '경로와 성분 확인',
        { experimentContextId: 'B', transition: 'fit-paths', visible: prediction, revealPolicy: 'predict-from-paths', allowedInputs: [],
          teacherNotes: '거리와 λ를 근거로 먼저 예상합니다. 필드·파형·성분·합은 가립니다.' }),
      cue('s6-b-paths', '경로와 성분 확인', '한 주기를 더 온 두 성분은 어떤 관계인가요?', '합 공개',
        { experimentContextId: 'B', layout: 'endpoint-comparison', visible: components, revealPolicy: 'predict-sum',
          waitFor: waiting('s6-b-predict'), teacherNotes: '추가 한 파장은 한 주기입니다. 합을 공개하기 전에 설명을 듣습니다.' }),
      cue('s6-b-sum', '예측 확인', '경로차 한 파장과 큰 합성 진동을 연결해 보세요.', '조건 A로 · 파장 변경 예측',
        { experimentContextId: 'B', layout: 'endpoint-comparison', visible: [...components, 'resultant'],
          waitFor: waiting('s6-b-predict') }),
    ] },
    { id: 'scene-7', title: '같은 P, 다른 파장', cues: [
      cue('s7-a-predict', '파장 변경 예측', '같은 경로차 7.5cm에서 파장을 절반으로 바꾸면?', '파장 절반으로',
        { visible: prediction, revealPolicy: 'predict-from-paths', allowedInputs: [],
          teacherNotes: '현재 파장 15cm, 다음 파장 7.5cm를 구별합니다. P와 파원 간격은 유지합니다.' }),
      cue('s7-c-change', '새 조건의 도착 대기', 'P는 그대로입니다. 새 파장이 도착하기를 기다려 보세요.', '결과 확인',
        { experimentContextId: 'C', visible: prediction, revealPolicy: 'predict-from-paths', allowedInputs: [],
          teacherNotes: '정지 중에는 변화도 도착하지 않습니다. 재생하거나 변화 과정 생략을 명시적으로 선택합니다. 도착해도 자동 공개하지 않습니다.' }),
      cue('s7-c-paths', '바뀐 파장과 성분', '같은 7.5cm에 이제 몇 파장이 들어가나요?', '합 공개',
        { experimentContextId: 'C', layout: 'endpoint-comparison', visible: components, revealPolicy: 'predict-sum',
          waitFor: waiting('s7-c-change') }),
      cue('s7-c-sum', '같은 P의 새로운 합', '거리차가 같아도 결과가 달라진 이유는 무엇인가요?', '전체로 돌아가기',
        { experimentContextId: 'C', layout: 'endpoint-comparison', visible: [...components, 'resultant'],
          waitFor: waiting('s7-c-change') }),
    ] },
    { id: 'scene-8', title: '전체 현상으로 돌아가기', cues: [
      cue('s8-field', '같은 공간으로', '처음 보는 점의 진동을 무엇으로 예상할 수 있을까요?', '간섭 조건 정리',
        { experimentContextId: 'C', layout: 'spatial-paths', transition: 'fold-to-field',
          visible: ['field', ...paths, 'local-probe-result'], teacherNotes: '1.5λ를 한 주기와 반 주기로 나누어 설명하게 합니다. 이 구두 문제는 실험을 바꾸지 않습니다.' }),
      cue('s8-rule', '간섭 조건 정리', '경로차를 파장과 비교하면, P의 진동을 설명할 수 있어요.', undefined,
        { experimentContextId: 'C', layout: 'field', visible: ['field', ...sources, 'rule'],
          waitFor: waiting('s8-field'), teacherNotes: '같은 진동수·같은 초기 위상·같은 도착 진폭·정상 상태라는 전제 아래의 조건입니다.' }),
    ] },
  ],
};
