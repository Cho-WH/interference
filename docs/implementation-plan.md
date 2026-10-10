# 구현과 검증 상태

제품 범위는 [제품 설계](product-design.md), 계산은 [물리 모델](physics-model.md), 경계 계약은 [구조와 재사용](architecture.md), 화면은 [학생 화면과 언어](ux-language.md)를 따른다. 실행 명령은 [README](../README.md#검증)에 둔다.

## 현재 제공 범위

지연 위상 전파, 속력 제한 파원 이동, 미리보기/확정/취소, 전파 또는 즉시 정착, 과도 포락선, GPU 필드·CPU 대체·복구, 공통 축척의 경로 비교, 모바일 가로 배치, P 영역·걸림 보조, 세 팔레트와 상세 옵션을 구현했다.

계산·입력·표현·자원 경계를 분리하며, 새 엔진은 `WaveEngine`/`WaveFrame` 계약을 구현한다. 선택적 GPU 패킷과 캐시 힌트가 없어도 CPU 경로로 표시할 수 있다.

## 변경 영역별 확인

| 변경 영역 | 확인할 계약 | 관련 검사 |
| --- | --- | --- |
| 물리/이력 | 위상 연속성·도착 지연·독립 지연 해·이동 속력·보관 프레임·즉시 정착·캐시 식별 | `physics.test.ts` |
| 공통 샘플링 | 백엔드가 정한 간격·공통 거리·경로 끝값 | `sampling.test.ts` |
| 시계/품질 | 정지·재개·샘플 상한·지속 부하와 회복 | `physics.test.ts`, `cadence.test.ts`, `quality.test.ts`, `browser/cadence.spec.ts` |
| 재생 배속 | 단계 입력·속도 변경 시 시간 연속성·정지/초기화 시 선택 유지·공통 시각 | `clock.test.ts`, `browser/playback-rate.spec.ts` |
| 배치/P | 공통 축척·전환 중 길이·최대 표시 영역·P 제약 | `geometry.test.ts`, `browser/field-viewport.spec.ts`, `browser/landscape.spec.ts` |
| 펼치기 전환 | 도착 후 보조 표시·접기 전 숨김·역전·동작 감소·중단 | `comparison-transition.test.ts`, `browser/comparison-ui.spec.ts` |
| 입력/걸림 | 근처 클릭은 자유·선 통과만 걸림·연속 해제·터치·키보드·취소 | `probe-detent.test.ts`, `browser/probe-detent.spec.ts`, `browser/propagation.spec.ts` |
| 렌더링 경계 | 캐시 힌트 없는 새 프레임·불투명 키·색상만 변경 | `browser/rendering-contract.spec.ts` |
| GPU | 모든 프리셋에서 CPU 일치·긴 실행·손실/복구·미지원 대체 | `browser/gpu.spec.ts` |
| 오류/수명 | 번들 로드 실패·부분 초기화 정리·입력/렌더/비동기 예외·CPU 대체 실패·진단 복사·재시작 | `session.test.ts`, `browser/errors.spec.ts` |
| 도구/접근성 | 팝업 배치·초점·Escape·터치 도움말·옵션 유지·버튼 폭 | `browser/options.spec.ts`, `browser/landscape.spec.ts` |
| 전체 연결 | 재생·간섭 조건·P/경로/끝값/합·초기화 | `browser/app.spec.ts`, `browser/propagation.spec.ts` |

검사 경로는 `tests/` 기준이다. UI 문구·색상 수정은 해당 화면을 확인하고, 공통 경계를 바꾸면 그 소비처까지 검사한다. 통과 숫자를 문서에 누적하지 않고 완료 보고에서 실제 수행 범위를 알린다.

## 남은 범위

- PhET식 격자 엔진, 진폭 감소·장애물·회절·반사, 초파속 이동은 미구현이다.
- 실제 Android/iOS 기기·Safari와 교실 사용성은 후속 확인 대상이다.
- FHD 배율을 적용한 CSS 너비 1280/1536px, 브라우저 높이 600px부터의 데스크톱 배치·글자·펼친 영역 수용은 `browser/desktop-fit.spec.ts`에서 확인한다. 실제 OS 권장 배율은 기기 설정을 따른다.
- 공개 테스트용 실행 오류 안내와 수동 진단 복사를 제공한다. 배포 후 실제 호스팅의 파일 로드/캐시와 실제 기기의 장시간 사용은 별도로 확인한다. 원격 오류 수집은 아직 연결하지 않았다.
- CSS 창 크기 범위를 바꾸면 `sceneFieldEnvelope`와 배치 검사를 함께 검토한다. 현재는 지원 레이아웃의 극값으로 이력을 예약한다.
- 새 엔진은 성분 분리·경로 의미·정상 판정·포락선·즉시 정착·정규화를 별도로 정의해야 한다. 코드 교체 지점만으로 그 물리적 의미까지 자동 호환되는 것은 아니다.
