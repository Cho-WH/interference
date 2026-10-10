import { COPY, formatSettingDistance } from './copy';
import { LIMITS, sourceSeparation } from '../model/state';
import type { ModelState } from '../model/types';
import { DEFAULT_PLAYBACK_RATE, PLAYBACK_RATES } from '../model/playback';

export type AppShell = ReturnType<typeof createShell>;

/** Static, accessible composition. State and event ownership stay with the app. */
export function createShell(root: HTMLElement, initial: ModelState) {
  root.innerHTML = `
    <main class="app-shell">
      <header class="app-header">
        <div class="app-heading">
          <svg class="app-mark" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <path d="M3 22c5-17 10-17 15 0s10 17 19 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            <path d="M3 16c7 15 12 15 18 0s10-15 16 0" fill="none" stroke="currentColor" stroke-opacity=".38" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <h1>${COPY.title}</h1>
        </div>
        <div class="playback-controls" role="group" aria-label="재생 조작">
          <a class="button button-quiet lesson-entry" href="?mode=teacher">교사 수업</a>
          <button id="reset" class="button button-quiet" type="button">${COPY.reset}</button>
          <button id="play" class="button button-dark" type="button" aria-label="${COPY.pause}">${COPY.pause}</button>
        </div>
      </header>

      <section class="experiment" aria-label="두 파원의 간섭 관찰">
        <div class="experiment-toolbar">
          <div class="view-switch" role="group" aria-label="파동 보기">
            <button id="wave-mode" type="button" aria-pressed="true">${COPY.wave}</button>
            <button id="amplitude-mode" type="button" aria-pressed="false">${COPY.amplitude}</button>
          </div>
          <div class="toolbar-actions">
          <button id="comparison-toggle" class="button button-compare" type="button" aria-expanded="false" aria-controls="comparison-region"><svg class="toolbar-icon path-align-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g class="path-icon-upper"><circle cx="5" cy="7" r="1.5"/><path d="M9 7h11"/></g><g class="path-icon-lower"><circle cx="5" cy="17" r="1.5"/><path d="M9 17h7"/></g></svg><span class="comparison-label"><span class="comparison-label-size" aria-hidden="true">${COPY.comparison}</span><span data-label>${COPY.comparison}</span></span></button>
          <div id="palette-picker" class="palette-picker">
            <button id="field-legend" class="field-legend" type="button" aria-expanded="false" aria-controls="palette-options" title="파동 색상 선택">
              <span class="palette-scale" aria-hidden="true"><span class="palette-scale-labels" data-legend-label><span>−</span><span>0</span><span>+</span></span><span class="palette-swatch" data-palette-swatch></span></span>
              <svg class="toolbar-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
            </button>
            <div id="palette-options" class="palette-options" role="group" aria-label="파동 색상 프리셋" hidden></div>
          </div>
          <div id="detail-options" class="detail-options">
            <button id="detail-options-toggle" class="options-trigger" type="button" aria-expanded="false" aria-controls="detail-options-panel" aria-label="상세 옵션" title="상세 옵션"><svg class="toolbar-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3m4 0h9M4 17h9m4 0h3"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></svg><span class="options-trigger-label">상세 옵션</span></button>
            <section id="detail-options-panel" class="options-panel" aria-label="상세 옵션" hidden>
              <div class="options-heading"><strong>상세 옵션</strong><button type="button" data-options-close aria-label="상세 옵션 닫기">×</button></div>
              <div class="option-row"><button id="change-process-toggle" class="option-toggle" type="button" aria-pressed="false"><span class="toggle-track" aria-hidden="true"></span>파동 변화 과정 생략</button><button class="option-help" type="button" data-option-help aria-label="파동 변화 과정 생략 설명" aria-describedby="change-process-tip" aria-expanded="false">i</button></div>
              <div id="change-process-tip" class="option-tooltip" role="tooltip" hidden>파장과 간격을 바꿀 때 중간 과정을 생략하고 즉시 최종 상태를 보여 줘요.</div>
              <div class="option-row path-option"><button id="path-waves-toggle" class="option-toggle" type="button" aria-pressed="true"><span class="toggle-track" aria-hidden="true"></span>경로에 파형 표시</button><button class="option-help" type="button" data-option-help aria-label="경로에 파형 표시 설명" aria-describedby="path-waves-tip" aria-expanded="false">i</button></div>
              <div id="path-waves-tip" class="option-tooltip" role="tooltip" hidden>펼치기 전에도 파원에서 P까지의 파형을 보여 줘요.</div>
              <div class="playback-option">
                <div class="option-row"><label for="playback-rate">재생 속도</label><output id="playback-rate-value" for="playback-rate">${DEFAULT_PLAYBACK_RATE}×</output><button class="option-help" type="button" data-option-help aria-label="재생 속도 설명" aria-describedby="playback-rate-tip" aria-expanded="false">i</button></div>
                <input id="playback-rate" type="range" min="0" max="${PLAYBACK_RATES.length - 1}" step="1" value="${PLAYBACK_RATES.indexOf(DEFAULT_PLAYBACK_RATE)}" />
                <div class="playback-steps" aria-hidden="true">${PLAYBACK_RATES.map(rate => `<span>${rate}×</span>`).join('')}</div>
              </div>
              <div id="playback-rate-tip" class="option-tooltip" role="tooltip" hidden>파동과 파원 이동을 함께 느리게 또는 빠르게 재생해요.</div>
            </section>
          </div>
        </div>
          <div class="source-key" aria-label="파원 색상">
            <span><i class="source-dot source-one" aria-hidden="true"></i>파원 1</span>
            <span><i class="source-dot source-two" aria-hidden="true"></i>파원 2</span>
          </div>
        </div>

        <div class="workspace">
        <div class="visual-column">
        <div id="stage" class="stage">
          <div id="field" class="field">
            <canvas id="wave-field" aria-label="두 파원에서 퍼지는 파동과 간섭">두 파원에서 P까지의 경로 길이는 아래에서 확인할 수 있어요.</canvas>
            <svg id="field-overlay" class="field-overlay" role="group" aria-label="파원과 관측점 조작"></svg>
            <p id="first-use-hint" class="field-hint">${COPY.hint}</p>
            <p id="probe-boundary-hint" class="field-hint boundary-hint" aria-hidden="true">P는 점선 테두리 안에서 움직여요.</p>
          </div>
          <div id="comparison-region" class="comparison-region" aria-label="두 경로와 P에서의 진동 비교" hidden></div>
          <svg id="comparison-overlay" class="comparison-overlay" role="img" aria-label="두 경로의 길이와 도착점에서의 진동"></svg>
        </div>

        </div>
        <aside class="control-panel" aria-label="파동 조건과 관측값">
        <div class="parameter-controls" aria-label="파동 조건">
          <div class="parameter">
            <div class="parameter-label"><label for="wavelength">${COPY.wavelength}<span class="quantity-symbol">λ</span></label><output id="wavelength-value" for="wavelength">${formatSettingDistance(initial.wavelength)}</output></div>
            <input id="wavelength" type="range" min="${LIMITS.wavelength[0] * 100}" max="${LIMITS.wavelength[1] * 100}" step="0.5" value="${initial.wavelength * 100}" aria-describedby="wavelength-value" />
            <div class="range-endpoints" aria-hidden="true"><span>${formatSettingDistance(LIMITS.wavelength[0])}</span><span>${formatSettingDistance(LIMITS.wavelength[1])}</span></div>
          </div>
          <div class="parameter">
            <div class="parameter-label"><label for="separation">${COPY.separation}</label><output id="separation-value" for="separation">${formatSettingDistance(sourceSeparation(initial))}</output></div>
            <input id="separation" type="range" min="${LIMITS.separation[0] * 100}" max="${LIMITS.separation[1] * 100}" step="0.5" value="${sourceSeparation(initial) * 100}" aria-describedby="separation-value" />
            <div class="range-endpoints" aria-hidden="true"><span>${formatSettingDistance(LIMITS.separation[0])}</span><span>${formatSettingDistance(LIMITS.separation[1])}</span></div>
          </div>
        </div>
        <p id="motion-hint" class="motion-hint" hidden></p>
        <p id="field-status" class="field-status" hidden></p>
        <div class="observation-bar">
          <div class="distance-readouts" aria-label="P까지의 거리와 경로차">
            <div class="readout readout-source-one">
              <span class="readout-label">파원 1 → P</span>
              <output id="distance-1">— cm</output>
            </div>
            <div class="readout readout-source-two">
              <span class="readout-label">파원 2 → P</span>
              <output id="distance-2">— cm</output>
            </div>
            <div class="readout readout-difference">
              <span class="readout-label">경로차</span>
              <div class="path-values"><output id="path-difference">— cm</output><output id="path-ratio" class="path-ratio">— λ</output></div>
            </div>
          </div>

        </div>

        <p id="interference-condition" class="condition"></p>
        </aside>
        </div>
      </section>

      <footer class="learning-footer">
        <details class="help">
          <summary>관찰 도움말</summary>
          <div class="help-content">
            <p><strong>P를 움직여 보세요.</strong> 두 파의 합이 크게 진동하는 곳과 진동하지 않는 곳을 찾아보세요.</p>
            <p><strong>경로를 펼쳐 비교해 보세요.</strong> 두 파원이 같은 진폭·위상으로 진동하고 변화가 모두 퍼진 뒤, 경로차가 0, λ, 2λ…이면 보강 간섭, λ/2, 3λ/2…이면 상쇄 간섭이 일어나요. λ는 파장이에요.</p>
            <p><strong>한순간 변위가 0이라고 상쇄 간섭은 아니에요.</strong> P에서 두 파의 합이 계속 0인지 관찰해 보세요.</p>
            <p><strong>파장이나 파원 간격을 바꿔 보세요.</strong> 간섭무늬에서 진동하지 않는 선의 위치와 간격이 어떻게 달라지나요?</p>
            <p class="keyboard-help">Tab으로 점을 선택하고 방향키로 움직일 수 있어요.</p>
          </div>
        </details>
      </footer>
      <p id="announcement" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
    </main>
  `;

  const element = <T extends Element>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing shell element: ${selector}`);
    return found;
  };

  return {
    stage: element<HTMLElement>('#stage'),
    field: element<HTMLElement>('#field'),
    canvas: element<HTMLCanvasElement>('#wave-field'),
    overlay: element<SVGSVGElement>('#comparison-overlay'),
    fieldOverlay: element<SVGSVGElement>('#field-overlay'),
    comparisonRegion: element<HTMLElement>('#comparison-region'),
    palettePicker: element<HTMLElement>('#palette-picker'),
    detailOptions: element<HTMLElement>('#detail-options'),
    controls: {
      play: element<HTMLButtonElement>('#play'),
      playbackRate: element<HTMLInputElement>('#playback-rate'),
      reset: element<HTMLButtonElement>('#reset'),
      comparison: element<HTMLButtonElement>('#comparison-toggle'),
      pathWaves: element<HTMLButtonElement>('#path-waves-toggle'),
      changeProcess: element<HTMLButtonElement>('#change-process-toggle'),
      wave: element<HTMLButtonElement>('#wave-mode'),
      amplitude: element<HTMLButtonElement>('#amplitude-mode'),
      wavelength: element<HTMLInputElement>('#wavelength'),
      separation: element<HTMLInputElement>('#separation'),
    },
    outputs: {
      playbackRate: element<HTMLOutputElement>('#playback-rate-value'),
      wavelength: element<HTMLOutputElement>('#wavelength-value'),
      separation: element<HTMLOutputElement>('#separation-value'),
      distance1: element<HTMLElement>('#distance-1'),
      distance2: element<HTMLElement>('#distance-2'),
      pathDifference: element<HTMLElement>('#path-difference'),
      ratio: element<HTMLElement>('#path-ratio'),
      condition: element<HTMLElement>('#interference-condition'),
      hint: element<HTMLElement>('#first-use-hint'),
      probeHint: element<HTMLElement>('#probe-boundary-hint'),
      announcement: element<HTMLElement>('#announcement'),
      motionHint: element<HTMLElement>('#motion-hint'),
      fieldStatus: element<HTMLElement>('#field-status'),
    },
    destroy() { root.replaceChildren(); },
  };
}
