import '../styles.css';
import { createModel, updateModel } from '../model/state';
import type { ModelAction } from '../model/state';
import type { FieldGrid, ViewState } from '../model/types';
import { createClock } from '../runtime/clock';
import { createSnapshot, createFieldSampler, samplePaths } from '../physics/waves';
import { createFieldTransform } from '../geometry/layout';
import { createFieldView } from '../views/field';
import { createComparisonView } from '../views/comparison';
import { COPY, formatDistance as cm, formatAmplitude } from '../ui/copy';
import { createShell } from '../ui/shell';
import { bindFieldInput } from '../ui/field-input';

const root = document.querySelector<HTMLElement>('#app')!;
const shell = createShell(root);
const { controls, outputs } = shell;
let model = createModel();
let view: ViewState = { playing: true, fieldMode: 'wave', comparisonOpen: false, interacted: false };
const clock = createClock();
const sampleField = createFieldSampler();
const fieldView = createFieldView(shell.canvas, shell.fieldOverlay);
const comparisonView = createComparisonView(shell.overlay);
shell.fieldOverlay.style.pointerEvents = 'auto';
shell.fieldOverlay.style.touchAction = 'none';
let width = 0, fieldHeight = 0;
let transform = createFieldTransform(model.bounds, 1, 1);
let animationFrame = 0;
let progress = 0;
let lastAnimationTime: number | null = null;
let dirty = true;
let grid: FieldGrid | undefined;
let fieldKey = '';
let destroyed = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const abort = new AbortController();
const signal = abort.signal;
const frequency = () => model.speed / model.wavelength;
const shortCm = (value: number) => `${Number((value * 100).toFixed(1))} cm`;

function syncControls() {
  controls.play.textContent = view.playing ? `Ⅱ ${COPY.pause}` : `▶ ${COPY.play}`;
  controls.play.setAttribute('aria-label', view.playing ? COPY.pause : COPY.play);
  controls.comparison.setAttribute('aria-expanded', String(view.comparisonOpen));
  controls.comparison.classList.toggle('is-active', view.comparisonOpen);
  controls.comparison.querySelector('[data-label]')!.textContent = view.comparisonOpen ? COPY.collapse : COPY.comparison;
  controls.wave.setAttribute('aria-pressed', String(view.fieldMode === 'wave'));
  controls.amplitude.setAttribute('aria-pressed', String(view.fieldMode === 'amplitude'));
  controls.wave.classList.toggle('is-active', view.fieldMode === 'wave');
  controls.amplitude.classList.toggle('is-active', view.fieldMode === 'amplitude');
  controls.wavelength.value = String(model.wavelength * 100);
  controls.separation.value = String((model.sources[1].position.y - model.sources[0].position.y) * 100);
  outputs.wavelength.value = shortCm(model.wavelength);
  outputs.separation.value = shortCm(model.sources[1].position.y - model.sources[0].position.y);
  controls.wavelength.setAttribute('aria-valuetext', outputs.wavelength.value);
  controls.separation.setAttribute('aria-valuetext', outputs.separation.value);
  outputs.hint.hidden = view.interacted;
  outputs.legend.textContent = view.fieldMode === 'wave' ? '순간 변위  - ← 0 → +' : '합성 진폭  0 → 최대';
  outputs.legend.dataset.mode = view.fieldMode;
}
function updateReadouts() {
  const { probe } = createSnapshot(model, clock.getFrame());
  outputs.distance1.textContent = cm(probe.distances[0]);
  outputs.distance2.textContent = cm(probe.distances[1]);
  outputs.pathDifference.textContent = cm(Math.abs(probe.signedPathDifference));
  const ratio = Math.abs(probe.signedPathDifference) / model.wavelength;
  outputs.ratio.textContent = `${ratio.toFixed(2)}λ`;
  outputs.condition.textContent = probe.interference === 'destructive'
    ? `반대 위상 · ${COPY.cancellation}`
    : probe.interference === 'constructive'
      ? '같은 위상 · 보강 간섭'
      : `합성 진폭 ${formatAmplitude(probe.resultantAmplitude)}`;
}
function announce() {
  const { probe } = createSnapshot(model, clock.getFrame());
  outputs.announcement.textContent = `P까지 파원 1 ${cm(probe.distances[0])}, 파원 2 ${cm(probe.distances[1])}. 경로차 ${cm(Math.abs(probe.signedPathDifference))}. ${outputs.condition.textContent}`;
}
function requestRender() {
  dirty = true;
  if (!animationFrame && !document.hidden && !destroyed) animationFrame = requestAnimationFrame(render);
}
function dispatch(action: ModelAction) {
  clock.tick(performance.now(), frequency());
  model = updateModel(model, action);
  if (action.type === 'probe') view = { ...view, interacted: true };
  syncControls(); updateReadouts(); requestRender();
}
function render(now: number) {
  animationFrame = 0;
  if (destroyed || document.hidden || width <= 0) return;
  const frame = clock.tick(now, frequency());
  const target = view.comparisonOpen ? 1 : 0;
  const delta = lastAnimationTime === null ? 0 : Math.max(0, now - lastAnimationTime);
  lastAnimationTime = now;
  if (reducedMotion.matches) progress = target;
  else if (progress !== target) progress = target > progress ? Math.min(1, progress + delta / 700) : Math.max(0, progress - delta / 700);
  const visible = view.comparisonOpen || progress > 0;
  shell.comparisonRegion.hidden = !visible;
  shell.stage.classList.toggle('comparison-open', visible);
  shell.overlay.style.display = visible ? 'block' : 'none';
  shell.overlay.setAttribute('viewBox', `0 0 ${width} ${fieldHeight + (visible ? 340 : 0)}`);
  if (dirty || view.playing || progress !== target || visible) {
    const snapshot = createSnapshot(model, frame);
    const columns = Math.min(420, Math.max(160, Math.round(model.bounds.width * transform.scale / 2)));
    const rows = Math.round(columns * model.bounds.height / model.bounds.width);
    const nextFieldKey = `${model.wavelength}:${model.sources[0].position.y}:${columns}:${view.fieldMode}`;
    if (!grid || nextFieldKey !== fieldKey || (view.fieldMode === 'wave' && (view.playing || dirty))) {
      grid = sampleField(snapshot, columns, rows, view.fieldMode);
      fieldKey = nextFieldKey;
    }
    fieldView.render(snapshot, grid, view.fieldMode, transform);
    if (visible) {
      const comparisonHeight = shell.comparisonRegion.getBoundingClientRect().height || 340;
      const easedProgress = progress * progress * (3 - 2 * progress);
      comparisonView.render(snapshot, samplePaths(snapshot), { width, fieldHeight, comparisonHeight, progress: easedProgress, fieldTransform: transform });
    }
    dirty = false;
  }
  if (view.playing || progress !== target) animationFrame = requestAnimationFrame(render);
  else lastAnimationTime = null;
}

controls.play.addEventListener('click', () => {
  view = { ...view, playing: !view.playing };
  clock.setPlaying(view.playing, performance.now(), frequency());
  syncControls(); requestRender();
}, { signal });
controls.comparison.addEventListener('click', () => {
  view = { ...view, comparisonOpen: !view.comparisonOpen };
  lastAnimationTime = performance.now();
  syncControls(); requestRender();
}, { signal });
for (const [control, mode] of [[controls.wave, 'wave'], [controls.amplitude, 'amplitude']] as const) {
  control.addEventListener('click', () => { view = { ...view, fieldMode: mode }; syncControls(); requestRender(); }, { signal });
}
controls.wavelength.addEventListener('input', () => dispatch({ type: 'wavelength', value: Number(controls.wavelength.value) / 100 }), { signal });
controls.separation.addEventListener('input', () => dispatch({ type: 'separation', value: Number(controls.separation.value) / 100 }), { signal });
controls.wavelength.addEventListener('change', announce, { signal });
controls.separation.addEventListener('change', announce, { signal });
controls.reset.addEventListener('click', () => {
  model = createModel();
  // Reset the experiment while retaining the student's chosen playback and view.
  clock.reset(performance.now());
  view = { ...view, interacted: false };
  syncControls(); updateReadouts(); announce(); requestRender();
}, { signal });
const unbindInput = bindFieldInput(shell.fieldOverlay, {
  getTransform: () => transform, getModel: () => model,
  moveProbe: (position) => dispatch({ type: 'probe', position }),
  setSeparation: (value) => dispatch({ type: 'separation', value }), announce,
});
const resizeObserver = new ResizeObserver(() => {
  const rect = shell.field.getBoundingClientRect();
  width = rect.width; fieldHeight = rect.height;
  transform = createFieldTransform(model.bounds, width, fieldHeight);
  requestRender();
});
resizeObserver.observe(shell.field);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clock.setPlaying(false, performance.now(), frequency());
    cancelAnimationFrame(animationFrame); animationFrame = 0; lastAnimationTime = null;
  } else {
    clock.setPlaying(view.playing, performance.now(), frequency()); requestRender();
  }
}, { signal });
window.addEventListener('pagehide', () => {
  clock.setPlaying(false, performance.now(), frequency());
  cancelAnimationFrame(animationFrame); animationFrame = 0;
}, { signal });
window.addEventListener('pageshow', () => {
  clock.setPlaying(view.playing, performance.now(), frequency()); requestRender();
}, { signal });
reducedMotion.addEventListener('change', requestRender, { signal });
syncControls(); updateReadouts(); requestRender();

// Vite tears down the same owned resources before mounting a development replacement.
if (import.meta.hot) import.meta.hot.dispose(() => {
  destroyed = true; cancelAnimationFrame(animationFrame); abort.abort();
  resizeObserver.disconnect(); unbindInput(); fieldView.destroy(); comparisonView.destroy(); shell.destroy();
});
