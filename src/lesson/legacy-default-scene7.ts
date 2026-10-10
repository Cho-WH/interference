import type { SceneSpec } from './types';

// Frozen scenes, used only to recognize untouched saved defaults.
export const LEGACY_WAVELENGTH_SCENES: Record<number, SceneSpec> = {
  "6": {
    "id": "scene-7",
    "title": "같은 P, 다른 파장",
    "cues": [
      {
        "id": "s7-a-predict",
        "label": "파장 변경 예측",
        "question": "같은 경로차 7.5cm에서 파장을 절반으로 바꾸면?",
        "experimentContextId": "A",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-baselines",
          "distance-values",
          "condition-values",
          "same-probe-label"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-from-paths",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "파장 절반으로",
          "clockIntent": "preserve"
        },
        "teacherNotes": "현재 파장 15cm, 다음 파장 7.5cm를 구별합니다. P와 파원 간격은 유지합니다."
      },
      {
        "id": "s7-c-change",
        "label": "새 조건의 도착 대기",
        "question": "P는 그대로입니다. 새 파장이 도착하기를 기다려 보세요.",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-baselines",
          "distance-values",
          "condition-values",
          "same-probe-label"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-from-paths",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "결과 확인",
          "clockIntent": "preserve"
        },
        "teacherNotes": "정지 중에는 변화도 도착하지 않습니다. 재생하거나 변화 과정 생략을 명시적으로 선택합니다. 도착해도 자동 공개하지 않습니다."
      },
      {
        "id": "s7-c-paths",
        "label": "바뀐 파장과 성분",
        "question": "같은 7.5cm에 이제 몇 파장이 들어가나요?",
        "experimentContextId": "C",
        "layout": "endpoint-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values",
          "endpoint-links",
          "component-1",
          "component-2"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "합 공개",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-sum",
        "label": "같은 P의 새로운 합",
        "question": "거리차가 같아도 결과가 달라진 이유는 무엇인가요?",
        "experimentContextId": "C",
        "layout": "endpoint-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values",
          "endpoint-links",
          "component-1",
          "component-2",
          "resultant"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "explain",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "전체로 돌아가기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      }
    ]
  },
  "7": {
    "id": "scene-7",
    "title": "같은 P, 다른 파장",
    "cues": [
      {
        "id": "s7-b-space",
        "label": "파장 변경 전 공간 복귀",
        "question": "지금 비교한 경로를 접고 파동 무늬를 다시 볼까요?",
        "experimentContextId": "B",
        "layout": "field",
        "fieldMode": "wave",
        "visible": [
          "field",
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "local-probe-result"
        ],
        "emphasis": [],
        "transition": "fold-to-field",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "explain",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "조건 A로 · 파장 변경 예측",
          "clockIntent": "preserve"
        },
        "teacherNotes": "현재 B의 조건과 재생 상태를 유지한 채 접습니다. 공간으로 돌아온 다음에만 A의 P로 옮깁니다."
      },
      {
        "id": "s7-a-predict",
        "label": "파장 변경 예측",
        "question": "같은 경로차 7.5cm에서 파장을 절반으로 바꾸면?",
        "experimentContextId": "A",
        "layout": "field",
        "fieldMode": "wave",
        "visible": [
          "field",
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "condition-values"
        ],
        "emphasis": [],
        "transition": "move-probe",
        "allowedInputs": [],
        "overrideable": [],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "파장 절반으로 · 재생",
          "clockIntent": "play-explicit"
        },
        "teacherNotes": "파장 15cm의 공간 무늬를 유지하며 예측을 기다립니다. 다음 동작에서만 P·파원 간격은 그대로 두고 파장을 7.5cm로 바꾸며 재생합니다."
      },
      {
        "id": "s7-c-change",
        "label": "새 파장의 공간 무늬",
        "question": "P는 그대로입니다. 새 파장이 퍼지면 마디선과 보강되는 곳은 어떻게 달라지나요?",
        "experimentContextId": "C",
        "layout": "field",
        "fieldMode": "wave",
        "visible": [
          "field",
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "condition-values"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "멈추고 펼치기",
          "clockIntent": "pause-explicit"
        },
        "teacherNotes": "배경과 두 경로 위 파형으로 새 파장이 퍼지는 과정을 관찰합니다. 해석 범위에 새 조건이 도착하면 펼치기가 가능해집니다. 자동 진행하지 않으므로 바뀐 무늬를 충분히 관찰한 뒤 멈추고 펼칩니다."
      },
      {
        "id": "s7-c-parallel",
        "label": "새 파장의 두 경로 펼치기",
        "question": "방금 본 같은 P의 두 경로를 나란히 비교해 보세요.",
        "experimentContextId": "C",
        "layout": "parallel",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label"
        ],
        "emphasis": [],
        "transition": "unfold-in-place",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "나란히 비교하기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-fit",
        "label": "새 파장 나란히 비교",
        "question": "두 파동은 어디까지 같은 거리를 이동했나요?",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label"
        ],
        "emphasis": [],
        "transition": "fit-paths",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "같은 거리 짚기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-common",
        "label": "새 파장 같은 거리",
        "question": "같은 거리까지의 파형은 어떤 관계인가요?",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "남는 길이 보기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-extra",
        "label": "새 파장 추가 경로",
        "question": "경로차는 그대로인데, 남는 구간의 파형은 어떻게 달라졌나요?",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "파장 눈금 보기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-ruler",
        "label": "새 파장 눈금",
        "question": "같은 추가 길이에 새 파장이 몇 개 들어가나요?",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "거리 수치 확인",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-values",
        "label": "새 파장 거리 수치",
        "question": "같은 7.5cm가 이제 한 파장이면, P에서 어떤 위상차가 생길까요?",
        "experimentContextId": "C",
        "layout": "path-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "도착점 보기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-paths",
        "label": "바뀐 파장과 성분",
        "question": "새 파장으로 P에 도착한 두 성분은 어떤 관계인가요?",
        "experimentContextId": "C",
        "layout": "endpoint-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values",
          "endpoint-links",
          "component-1",
          "component-2"
        ],
        "emphasis": [],
        "transition": "focus-endpoints",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "재생하며 관찰",
          "clockIntent": "play-explicit"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-components-playing",
        "label": "새 파장 성분 재생",
        "question": "두 성분의 변위를 매 순간 더하면 어떻게 될까요?",
        "experimentContextId": "C",
        "layout": "endpoint-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values",
          "endpoint-links",
          "component-1",
          "component-2"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "predict-sum",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "합 공개",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      },
      {
        "id": "s7-c-sum",
        "label": "같은 P의 새로운 합",
        "question": "거리차가 같아도 결과가 달라진 이유는 무엇인가요?",
        "experimentContextId": "C",
        "layout": "endpoint-comparison",
        "fieldMode": "wave",
        "visible": [
          "source-1",
          "source-2",
          "probe",
          "path-1",
          "path-2",
          "same-probe-label",
          "same-distance-correspondence",
          "path-difference",
          "wavelength-ruler",
          "distance-values",
          "endpoint-links",
          "component-1",
          "component-2",
          "resultant"
        ],
        "emphasis": [],
        "transition": "focus",
        "allowedInputs": [
          "probe",
          "wavelength",
          "separation"
        ],
        "overrideable": [
          "distance-values",
          "wavelength-ruler",
          "component-1",
          "component-2",
          "resultant"
        ],
        "revealPolicy": "explain",
        "stop": "manual",
        "showQuestion": true,
        "nextAction": {
          "label": "전체로 돌아가기",
          "clockIntent": "preserve"
        },
        "waitFor": {
          "scope": "analysis-steady",
          "holdCueId": "s7-c-change"
        }
      }
    ]
  }
};
