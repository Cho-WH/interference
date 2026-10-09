import { COPY } from './copy';

export type AppShell = ReturnType<typeof createShell>;

/** Static, accessible composition. State and event ownership stay with the app. */
export function createShell(root: HTMLElement) {
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
          <button id="comparison-toggle" class="button button-compare" type="button" aria-expanded="false" aria-controls="comparison-region"><span data-label>${COPY.comparison}</span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
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

          </div>
          <div id="comparison-region" class="comparison-region" aria-label="두 경로와 P에서의 진동 비교" hidden></div>
          <svg id="comparison-overlay" class="comparison-overlay" role="img" aria-label="두 경로의 길이와 도착점에서의 진동"></svg>
        </div>

        <div class="field-footer">
          <div id="field-legend" class="field-legend" aria-label="파동 색상의 의미">${COPY.waveLegend}</div>
          <span class="probe-key"><span class="probe-key-marker" aria-hidden="true">P</span>관측점</span>
        </div>

        </div>
        <aside class="control-panel" aria-label="파동 조건과 관측값">
        <div class="parameter-controls" aria-label="파동 조건">
          <div class="parameter">
            <div class="parameter-label"><label for="wavelength">${COPY.wavelength}<span class="quantity-symbol">λ</span></label><output id="wavelength-value" for="wavelength">16.0 cm</output></div>
            <input id="wavelength" type="range" min="6" max="30" step="0.5" value="16" aria-describedby="wavelength-value" />
            <div class="range-endpoints" aria-hidden="true"><span>6 cm</span><span>30 cm</span></div>
          </div>
          <div class="parameter">
            <div class="parameter-label"><label for="separation">${COPY.separation}</label><output id="separation-value" for="separation">24.0 cm</output></div>
            <input id="separation" type="range" min="6" max="54" step="0.5" value="24" aria-describedby="separation-value" />
            <div class="range-endpoints" aria-hidden="true"><span>6 cm</span><span>54 cm</span></div>
          </div>
        </div>
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
            <p><strong>파동 모습</strong>은 각 위치의 순간 변위예요. <strong>간섭무늬</strong>는 진동하는 크기인 합성 진폭을 보여 줘요.</p>
            <p><strong>경로 비교</strong>를 열면 두 파원에서 P까지의 길이와 P에서의 진동을 함께 볼 수 있어요. λ는 파장을 뜻해요.</p>
            <p>두 파원은 같은 진폭, 같은 위상으로 진동해요. 이 화면에서는 거리에 따른 진폭 감소를 생략했어요.</p>
            <p class="keyboard-help">키보드로 점을 선택한 뒤 방향키로 움직일 수 있어요. Shift를 함께 누르면 더 크게 움직여요.</p>
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
    controls: {
      play: element<HTMLButtonElement>('#play'),
      reset: element<HTMLButtonElement>('#reset'),
      comparison: element<HTMLButtonElement>('#comparison-toggle'),
      wave: element<HTMLButtonElement>('#wave-mode'),
      amplitude: element<HTMLButtonElement>('#amplitude-mode'),
      wavelength: element<HTMLInputElement>('#wavelength'),
      separation: element<HTMLInputElement>('#separation'),
    },
    outputs: {
      wavelength: element<HTMLOutputElement>('#wavelength-value'),
      separation: element<HTMLOutputElement>('#separation-value'),
      distance1: element<HTMLElement>('#distance-1'),
      distance2: element<HTMLElement>('#distance-2'),
      pathDifference: element<HTMLElement>('#path-difference'),
      ratio: element<HTMLElement>('#path-ratio'),
      condition: element<HTMLElement>('#interference-condition'),
      legend: element<HTMLElement>('#field-legend'),
      hint: element<HTMLElement>('#first-use-hint'),
      announcement: element<HTMLElement>('#announcement'),
    },
    destroy() { root.replaceChildren(); },
  };
}
