import '../styles.css';
import { createModel, updateModel, sourcePositionExtremes } from '../model/state';
import type { ModelAction } from '../model/state';
import type { ViewState } from '../model/types';
import { createClock } from '../runtime/clock';
import { createFrameCadence } from '../runtime/frame-cadence';
import { createRetardedEngine } from '../physics/retarded-engine';
import type { WaveEngine } from '../physics/engine';
import { createSceneTransform } from '../geometry/layout';
import { createFieldView } from '../views/field';
import { createComparisonView } from '../views/comparison';
import { COPY, formatDistance as cm, formatAmplitude } from '../ui/copy';
import { createShell } from '../ui/shell';
import { bindFieldInput } from '../ui/field-input';
import { createPalettePicker } from '../ui/palette-picker';
import type { PaletteId } from '../visual/field-palettes';

const root = document.querySelector<HTMLElement>('#app')!;
const shell = createShell(root);
const { controls, outputs } = shell;
let model = createModel();
let view: ViewState = { playing: true, fieldMode: 'wave', comparisonOpen: false, interacted: false };
const clock = createClock();
const cadence = createFrameCadence();
// The only backend selection point. Views consume WaveFrame data, not this implementation.
const engine: WaveEngine = createRetardedEngine(model);
let currentFrame = engine.read(model.probe);
let pathSamples: ReturnType<typeof currentFrame.samplePaths> | undefined;
let previewSeparation: number | null = null;
const fieldView = createFieldView(shell.canvas, shell.fieldOverlay, requestRender);
const comparisonView = createComparisonView(shell.overlay);
shell.fieldOverlay.style.pointerEvents = 'auto';
shell.fieldOverlay.style.touchAction = 'none';
let width = 0, fieldHeight = 0;
let transform = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), 1, 1);
let animationFrame = 0;
let progress = 0;
let lastAnimationTime: number | null = null;
let dirty = true;
let announcementPending = false;
let hasRenderedFrame = false;
let destroyed = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const abort = new AbortController();
const signal = abort.signal;
let selectedPalette: PaletteId = 'contrast';
const palettePicker = createPalettePicker(shell.palettePicker, id => {
  selectedPalette = id; requestRender();
});
const targetSeparation = () => model.sources[1].position.y - model.sources[0].position.y;
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
  const separation = previewSeparation ?? targetSeparation();
  controls.separation.value = String(separation * 100);
  outputs.wavelength.value = shortCm(model.wavelength);
  outputs.separation.value = shortCm(separation);
  controls.wavelength.setAttribute('aria-valuetext', outputs.wavelength.value);
  controls.separation.setAttribute('aria-valuetext', outputs.separation.value);
  outputs.hint.hidden = view.interacted;
}
function updateReadouts() {
  const { probe, steady, moving } = currentFrame.snapshot;
  outputs.distance1.textContent = cm(probe.distances[0]);
  outputs.distance2.textContent = cm(probe.distances[1]);
  outputs.pathDifference.textContent = cm(Math.abs(probe.signedPathDifference));
  const ratio = Math.abs(probe.signedPathDifference) / currentFrame.snapshot.model.wavelength;
  outputs.ratio.textContent = steady ? `${ratio.toFixed(2)}λ` : '—';
  outputs.condition.textContent = probe.interference === 'transient' ? '새 조건이 P에 도착하는 중'
    : probe.interference === 'destructive'
    ? `반대 위상 · ${COPY.cancellation}`
    : probe.interference === 'constructive'
      ? '같은 위상 · 보강 간섭'
      : `합성 진폭 ${formatAmplitude(probe.resultantAmplitude!)}`;
  const actualMode = view.fieldMode === 'amplitude' && steady ? 'amplitude' : 'wave';
  palettePicker.update(actualMode);
  const waitingForMotion = moving && !view.playing;
  outputs.hint.hidden = view.interacted || previewSeparation !== null || moving || !steady;
  outputs.motionHint.textContent = previewSeparation !== null ? '손을 떼면 점선 위치로 이동해요.'
    : waitingForMotion ? '재생하면 점선 위치로 이동해요.'
    : moving ? '파원이 점선 위치로 이동하고 있어요.'
    : !steady ? '새 조건의 파동이 퍼지고 있어요.' : '';
  outputs.motionHint.hidden = outputs.motionHint.textContent === '';
  outputs.fieldStatus.textContent = view.fieldMode === 'amplitude' && !steady ? '변화가 퍼지는 동안 파동 모습으로 관찰해요.' : '';
  outputs.fieldStatus.hidden = outputs.fieldStatus.textContent === '';
}
function announce() {
  announcementPending = true; requestRender();
}
function flushAnnouncement() {
  const { probe } = currentFrame.snapshot;
  outputs.announcement.textContent = `P까지 파원 1 ${cm(probe.distances[0])}, 파원 2 ${cm(probe.distances[1])}. 경로차 ${cm(Math.abs(probe.signedPathDifference))}. ${outputs.condition.textContent}`;
  announcementPending = false;
}
function requestRender() {
  dirty = true;
  if (!animationFrame && !document.hidden && !destroyed) animationFrame = requestAnimationFrame(render);
}
function dispatch(action: ModelAction) {
  engine.advanceTo(clock.tick(performance.now()).timeSeconds);
  model = updateModel(model, action);
  if (action.type === 'wavelength') engine.setWavelength(model.wavelength);
  if (action.type === 'separation') engine.setSourceTargets([model.sources[0].position, model.sources[1].position]);
  if (action.type === 'probe') view = { ...view, interacted: true };
  syncControls(); requestRender();
}
function render(now: number) {
  const workStart = performance.now();
  animationFrame = 0;
  if (destroyed || document.hidden || width <= 0) return;
  engine.advanceTo(clock.tick(now).timeSeconds);
  const latestFrame = engine.read(model.probe);
  const sampleDue = view.playing && cadence.shouldSample(now, latestFrame.snapshot.steady, fieldView.rate(latestFrame));
  // Inputs keep responding on RAF; all physical views share the last sampled instant.
  const refreshPhysics = sampleDue || !hasRenderedFrame || (!view.playing && dirty);
  if (refreshPhysics) { currentFrame = latestFrame; pathSamples = undefined; }
  const target = view.comparisonOpen ? 1 : 0;
  const unfolding = progress !== target;
  const delta = lastAnimationTime === null ? 0 : Math.max(0, now - lastAnimationTime);
  lastAnimationTime = now;
  if (reducedMotion.matches) progress = target;
  else if (progress !== target) progress = target > progress ? Math.min(1, progress + delta / 700) : Math.max(0, progress - delta / 700);
  const visible = view.comparisonOpen || progress > 0;
  shell.comparisonRegion.hidden = !visible;
  shell.stage.classList.toggle('comparison-open', visible);
  shell.overlay.style.display = visible ? 'block' : 'none';
  const comparisonHeight = visible ? shell.comparisonRegion.getBoundingClientRect().height : 0;
  shell.overlay.setAttribute('viewBox', `0 0 ${width} ${fieldHeight + comparisonHeight}`);
  if (dirty || refreshPhysics || unfolding) {
    const snapshot = currentFrame.snapshot;
    const actualMode = view.fieldMode === 'amplitude' && snapshot.steady ? 'amplitude' : 'wave';
    const hintSources = previewSeparation === null ? model.sources : updateModel(model, { type: 'separation', value: previewSeparation }).sources;
    fieldView.render(currentFrame, actualMode, transform, selectedPalette, view.playing,
      previewSeparation !== null || snapshot.moving ? [hintSources[0].position, hintSources[1].position] : undefined);
    hasRenderedFrame = true;
    if (visible) {
      const easedProgress = progress * progress * (3 - 2 * progress);
      pathSamples ??= currentFrame.samplePaths();
      comparisonView.render(snapshot, pathSamples, { width, fieldHeight, comparisonHeight, progress: easedProgress, fieldTransform: transform });
    }
    dirty = false;
    updateReadouts();
    if (announcementPending && refreshPhysics) flushAnnouncement();
    fieldView.presented(performance.now() - workStart);
  }
  if (view.playing || progress !== target) animationFrame = requestAnimationFrame(render);
  else lastAnimationTime = null;
}

controls.play.addEventListener('click', () => {
  view = { ...view, playing: !view.playing };
  engine.advanceTo(clock.setPlaying(view.playing, performance.now()).timeSeconds);
  cadence.reset();
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
function preview(value: number | null) {
  previewSeparation = value === null ? null : Math.max(.06, Math.min(.54, value));
  syncControls(); requestRender();
}
controls.separation.addEventListener('input', () => preview(Number(controls.separation.value) / 100), { signal });
controls.wavelength.addEventListener('change', announce, { signal });
controls.separation.addEventListener('change', () => {
  const value = Number(controls.separation.value) / 100;
  previewSeparation = null; dispatch({ type: 'separation', value }); announce();
}, { signal });
controls.separation.addEventListener('pointercancel', () => preview(null), { signal });
controls.separation.addEventListener('keydown', event => { if (event.key === 'Escape') preview(null); }, { signal });
controls.reset.addEventListener('click', () => {
  fieldInput.cancel();
  model = createModel();
  // Reset the experiment while retaining the student's chosen playback and view.
  clock.reset(performance.now());
  cadence.reset(); pathSamples = undefined;
  engine.reset(model); previewSeparation = null; currentFrame = engine.read(model.probe); hasRenderedFrame = false;
  view = { ...view, interacted: false };
  syncControls(); updateReadouts(); announce(); requestRender();
}, { signal });
const fieldInput = bindFieldInput(shell.fieldOverlay, {
  getTransform: () => transform,
  // Repeated P input accumulates immediately, even between sampled display frames.
  getModel: () => ({ ...currentFrame.snapshot.model, probe: model.probe }),
  moveProbe: (position) => dispatch({ type: 'probe', position }),
  setSeparation: (value) => dispatch({ type: 'separation', value }),
  getTargetSeparation: targetSeparation, previewSeparation: preview, announce,
});
const resizeObserver = new ResizeObserver(() => {
  const rect = shell.field.getBoundingClientRect();
  width = rect.width; fieldHeight = rect.height;
  transform = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), width, fieldHeight);
  requestRender();
});
resizeObserver.observe(shell.field);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    engine.advanceTo(clock.setPlaying(false, performance.now()).timeSeconds);
    fieldInput.cancel();
    cancelAnimationFrame(animationFrame); animationFrame = 0; lastAnimationTime = null;
  } else {
    cadence.reset();
    clock.setPlaying(view.playing, performance.now()); requestRender();
  }
}, { signal });
window.addEventListener('pagehide', () => {
  engine.advanceTo(clock.setPlaying(false, performance.now()).timeSeconds);
  cancelAnimationFrame(animationFrame); animationFrame = 0;
}, { signal });
window.addEventListener('pageshow', () => {
  cadence.reset();
  clock.setPlaying(view.playing, performance.now()); requestRender();
}, { signal });
reducedMotion.addEventListener('change', requestRender, { signal });
syncControls(); updateReadouts(); requestRender();

// Vite tears down the same owned resources before mounting a development replacement.
if (import.meta.hot) import.meta.hot.dispose(() => {
  destroyed = true; cancelAnimationFrame(animationFrame); abort.abort();
  resizeObserver.disconnect(); fieldInput.destroy(); palettePicker.destroy(); fieldView.destroy(); comparisonView.destroy(); shell.destroy();
});
