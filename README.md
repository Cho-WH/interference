# Interference

두 파원의 간섭을 **공간의 경로 → 경로차 → 도착 위상차 → 같은 P의 합성 진동**으로 연결하는 중고등학교 수업용 웹 시뮬레이터다.

관측점 P를 움직이고 두 경로를 같은 축척으로 펼쳐 길이와 진동을 비교한다. 현재는 일정 진폭의 지연 위상 엔진을 사용한다. 엄밀한 2차원 수면 시뮬레이션은 아니며 진폭 감소·반사·장애물·회절은 생략한다.

공개 사이트: **[파동의 간섭](https://cho-wh.github.io/interference/)**

`main`에 푸시하면 GitHub Actions에서 타입 검사·빌드·최소 실행 확인만 수행하고, 통과한 `dist/`를 GitHub Pages에 배포한다. 최소 실행 확인은 빌드된 일반·교사 화면이 열리고 파동 프레임이 진행되는지 확인하는 2개 항목이다. PR과 수동 재배포에도 같은 범위를 적용한다. 단위 검사와 세부 브라우저 검사는 푸시 때 자동 실행하지 않는다. 수동 재배포는 Actions의 `Verify and deploy Pages`에서 실행할 수 있다.

## 실행

Node.js 22.12 이상에서 실행한다.

```sh
npm ci
npm run dev
```

터미널에 표시된 주소를 연다. `npm run build`는 타입 검사 후 `dist/`를 생성하고, `npm run preview`는 빌드 결과를 표시한다. 상대 경로로 빌드하므로 `/interference/` 같은 하위 경로에도 배포할 수 있다.

## 조작

- P를 누르거나 끌어 관측점을 바꾼다. 정상 상태에서는 간섭선을 통과할 때 잠깐 걸려 정확한 배치를 돕는다.
- 파원 손잡이·간격 슬라이더는 목표 미리보기 후 놓아서 확정한다. Escape로 취소한다. 기본 설정에서는 새 조건이 유한한 속력으로 퍼진다.
- `경로 펼치기 / 경로 접기`로 길이와 도착 진동을 비교한다. 경로 끝값·성분·합은 같은 시각의 값이다.
- 버튼 옆 색상바에서 세 프리셋을 선택한다. `상세 옵션`의 `파동 변화 과정 생략`은 기본 꺼짐, `경로에 파형 표시`는 기본 켜짐이다.
- `파동 모습`은 순간 변위, `간섭무늬`는 도착 위상 포락선이다. 정상 상태에서는 포락선이 합성 진폭과 같다.
- Tab과 방향키로 점을 움직이고 Shift로 큰 간격을 이동한다. `일시 정지`는 물리 시간을 멈춘다. `처음으로`는 실험을 초기화하며 재생·보기·옵션·색상 선택은 유지한다.
- `교사 수업`에서 경로를 단계적으로 펼치고 거리·파장·성분·합을 공개한다. 같은 주소에 `?mode=teacher`를 붙여 직접 진입할 수 있다. 8장면·26개 정지 지점에서 A/B/C의 관찰·예측·확인을 진행한다. B는 공간으로 복귀한 뒤 P 이동·새 경로 펼침·예측을 차례로 진행한다. P·파장 조작, 자유 조작과 복귀, 수업 편집·리허설, JSON 및 브라우저 저장을 제공한다.

## 구조와 문서

TypeScript·Vite를 사용하며 외부 런타임 라이브러리는 없다. WebGL2 필드 표시와 CPU/Canvas 대체 경로, SVG 조작점·비교부, HTML 조절기로 구성한다. 품질 조절은 해상도·표시 빈도만 바꾸고 물리 시간에는 영향을 주지 않는다. 실제 Android/iOS·Safari 확인은 아직 남아 있다.

| 문서 | 관리하는 정의 |
| --- | --- |
| [개발 지침](AGENTS.md) | 재사용·UX·언어·검증 원칙 |
| [교사 수업 구현](docs/teacher-mode.md) | v2 수업·시간·공개·편집·저장 계약 |
| [제품 설계](docs/product-design.md) | 목표·범위·수업 활동·후보 기능 |
| [학생 화면과 언어](docs/ux-language.md) | 현재 조작·화면 규격·문구 |
| [물리 모델](docs/physics-model.md) | 단위·계산·전파·간섭 판정 |
| [구조와 재사용](docs/architecture.md) | 코드 책임·엔진/표현 경계·수명 계약 |
| [구현과 검증 상태](docs/implementation-plan.md) | 검사 대상·관련 테스트·남은 확인 |

백엔드 선택은 `src/app/experiment-controller.ts` 한 곳이며 공개 계약은 `src/physics/engine.ts`다. 모듈별 책임은 구조 문서를 따른다. 격자 파동방정식 엔진은 아직 구현하지 않았다.

## 검증

배포 시 자동으로 수행하는 범위:

```sh
npm run build
npx playwright install chromium
npm run test:smoke
```

`build`에 타입 검사가 포함된다. `test:smoke`는 `dist/`를 별도 미리보기 서버에서 열며, 개발 서버나 세부 검사 폴더를 사용하지 않는다.

기능을 수정할 때는 [변경 영역별 확인](docs/implementation-plan.md#변경-영역별-확인)에서 해당 기능과 직접 영향을 받는 검사만 선택한다. 예를 들어 파원 이동을 수정했다면:

```sh
node --import tsx --test tests/physics.test.ts
npm run test:browser -- tests/browser/propagation.spec.ts
```

특정 동작만 확인할 때는 `--grep`으로 더 좁힐 수 있다. 변경하지 않은 안정된 모듈의 검사는 반복 실행하지 않는다. `npm test`와 인자 없는 `npm run test:browser`는 각각 전체 검사를 실행하므로 기본 확인 절차로 사용하지 않는다. GPU 픽셀 읽기는 테스트에서만 수행한다.

## 개발 시작과 참고

`AGENTS.md`와 해당 기능의 설계 문서를 먼저 읽는다. 공통 정의를 수정할 때는 소비하는 화면·계산의 계약을 함께 확인한다.

출발점은 [E2 Innovations의 Wave Interference](https://e2innovations.ai/labs/lab-wave-interference-accessible.html#instructions)다. 참고 표현과 본 설계의 선택은 [제품 설계의 참고 자료](docs/product-design.md#7-참고-자료)에 정리했다.
