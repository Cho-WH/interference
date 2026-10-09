import '../styles.css';
import { createModel, updateModel, sourcePositionExtremes } from '../model/state';
import type { ModelAction } from '../model/state';
import type { ViewState, Vec2 } from '../model/types';
import { createClock } from '../runtime/clock';
import { createFrameCadence } from '../runtime/frame-cadence';
import { createRetardedEngine } from '../physics/retarded-engine';
import type { WaveEngine } from '../physics/engine';
import { COMPARISON_HEIGHT, LANDSCAPE_COMPARISON_HEIGHT, createFieldTransform, createSceneTransform, landscapeColumns, sceneFieldEnvelope, visibleFieldBounds } from '../geometry/layout';
import { createFieldView } from '../views/field';
import { createProbeRegion, containsProbe, constrainProbe, probeBoundary, type ProbeRegion } from '../geometry/probe-region';
import { createComparisonView } from '../views/comparison';
import { COPY, formatDistance as cm, formatAmplitude } from '../ui/copy';
import { createShell } from '../ui/shell';
import { bindFieldInput } from '../ui/field-input';
import { createDetailOptions } from '../ui/detail-options';
import { createPalettePicker } from '../ui/palette-picker';
import type { PaletteId } from '../visual/field-palettes';

const root = document.querySelector<HTMLElement>('#app')!;
const shell = createShell(root);
const { controls, outputs } = shell;
let model = createModel();
let view: ViewState = { playing: true, fieldMode: 'wave', changeMode: 'propagate', comparisonOpen: false, pathWaves: true, interacted: false };
const clock = createClock();
const cadence = createFrameCadence();
// The only backend selection point. Views consume WaveFrame data, not this implementation.
const engine: WaveEngine = createRetardedEngine(model, sceneFieldEnvelope(model.bounds, sourcePositionExtremes(model.bounds)));
let currentFrame = engine.read(model.probe);
let pathSamples: ReturnType<typeof currentFrame.samplePaths> | undefined;
let previewSeparation: number | null = null;
let showProbeBounds = false, boundsTimer = 0;
let probeRegion: ProbeRegion | undefined;
let regionKey = '', regionOutline: readonly Vec2[] = [];
const fieldView = createFieldView(shell.canvas, shell.fieldOverlay, requestRender);
const comparisonView = createComparisonView(shell.overlay);
shell.fieldOverlay.style.pointerEvents = 'auto';
shell.fieldOverlay.style.touchAction = 'none';
let width = 0, fieldHeight = 0;
let transform = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), 1, 1);
let animationFrame = 0;
let progress = 0;
let guideProgress = 0;
let lastAnimationTime: number | null = null;
let dirty = true;
let announcementPending = false;
let hasRenderedFrame = false;
let destroyed = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const landscape = window.matchMedia('(min-width: 560px) and (max-height: 500px) and (orientation: landscape)');
const abort = new AbortController();
const signal = abort.signal;
let selectedPalette: PaletteId = 'contrast';
const palettePicker = createPalettePicker(shell.palettePicker, id => {
  selectedPalette = id; requestRender();
});
const detailOptions = createDetailOptions(shell.detailOptions);
const targetSeparation = () => model.sources[1].position.y - model.sources[0].position.y;
const shortCm = (value: number) => `${Number((value * 100).toFixed(1))} cm`;

function syncControls() {
  controls.play.textContent = view.playing ? `Ⅱ ${COPY.pause}` : `▶ ${COPY.play}`;
  controls.play.setAttribute('aria-label', view.playing ? COPY.pause : COPY.play);
  controls.comparison.setAttribute('aria-expanded', String(view.comparisonOpen));
  controls.changeProcess.setAttribute('aria-pressed', String(view.changeMode === 'instant'));
  controls.pathWaves.setAttribute('aria-pressed', String(view.pathWaves));
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
  palettePicker.update(view.fieldMode, steady);
  const waitingForMotion = moving && !view.playing;
  outputs.hint.hidden = showProbeBounds || view.interacted || previewSeparation !== null || moving || !steady;
  outputs.probeHint.setAttribute('aria-hidden', String(!showProbeBounds));
  outputs.motionHint.textContent = view.changeMode === 'instant' ? (previewSeparation !== null ? '손을 떼면 이 위치로 확정해요.' : '')
    : previewSeparation !== null ? '손을 떼면 점선 위치로 이동해요.'
    : waitingForMotion ? '재생하면 점선 위치로 이동해요.'
    : moving ? '파원이 점선 위치로 이동하고 있어요.'
    : !steady ? '새 조건의 파동이 퍼지고 있어요.' : '';
  outputs.motionHint.hidden = outputs.motionHint.textContent === '';
  outputs.fieldStatus.textContent = view.fieldMode === 'amplitude' && !steady ? '변화 중 · 도착 위상으로 본 간섭무늬' : '';
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
  if (action.type === 'probe' && probeRegion) {
    const position = updateModel(model, action).probe;
    if (!containsProbe(probeRegion, position)) {
      showProbeBounds = true; clearTimeout(boundsTimer);
      boundsTimer = window.setTimeout(() => { showProbeBounds = false; requestRender(); }, 1400);
    }
    action = { type: 'probe', position: constrainProbe(probeRegion, position) };
  }
  engine.advanceTo(clock.tick(performance.now()).timeSeconds);
  model = updateModel(model, action);
  if (action.type === 'wavelength') engine.setWavelength(model.wavelength);
  if (action.type === 'separation') engine.setSourceTargets([model.sources[0].position, model.sources[1].position]);
  if (view.changeMode === 'instant' && (action.type === 'wavelength' || action.type === 'separation')) engine.settle();
  if (action.type === 'probe') view = { ...view, interacted: true };
  syncControls(); requestRender();
}
function render(now: number) {
  const workStart = performance.now();
  animationFrame = 0;
  if (destroyed || document.hidden) return;
  // Media queries can switch before ResizeObserver runs during rotation.
  // Read the current layout as one unit so old dimensions never enter the new camera.
  width = shell.stage.getBoundingClientRect().width;
  fieldHeight = shell.field.getBoundingClientRect().height;
  if (width <= 0) return;
  const target = view.comparisonOpen ? 1 : 0;
  const unfolding = progress !== target;
  const delta = lastAnimationTime === null ? 0 : Math.max(0, now - lastAnimationTime);
  lastAnimationTime = now;
  // Fade correspondence guides out before the paths leave their aligned rows.
  if (reducedMotion.matches) progress = target;
  else if (progress !== target && (view.comparisonOpen || guideProgress === 0)) progress = target > progress ? Math.min(1, progress + delta / 1400) : Math.max(0, progress - delta / 1100);
  const guideTarget = view.comparisonOpen && progress === 1 ? 1 : 0;
  const fading = guideProgress !== guideTarget;
  if (reducedMotion.matches) guideProgress = guideTarget;
  else guideProgress = guideTarget > guideProgress ? Math.min(1, guideProgress + delta / 320) : Math.max(0, guideProgress - delta / 180);
  const easedProgress = progress ** 3 * (progress * (progress * 6 - 15) + 10);
  const side = landscape.matches;
  const columns = landscapeColumns(width);
  const comparisonHeight = side ? LANDSCAPE_COMPARISON_HEIGHT : COMPARISON_HEIGHT;
  const fieldWidth = side ? width - columns.comparisonWidth * easedProgress : width;
  shell.field.style.width = `${fieldWidth}px`;
  const scale = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), side ? columns.fieldWidth : width, fieldHeight, side ? columns.comparisonWidth : width).scale;
  transform = createFieldTransform(model.bounds, fieldWidth, fieldHeight, scale);
  // Reserve the final camera so opening comparison never relocates P or changes scale.
  const nextRegionKey = `${width}:${fieldHeight}:${side}:${scale}`;
  if (regionKey !== nextRegionKey) {
    regionKey = nextRegionKey;
    probeRegion = createProbeRegion(createFieldTransform(model.bounds, side ? columns.fieldWidth : width, fieldHeight, scale),
      side ? columns.comparisonWidth : width, sourcePositionExtremes(model.bounds));
    regionOutline = probeBoundary(probeRegion);
    const position = constrainProbe(probeRegion, model.probe);
    if (position !== model.probe) model = updateModel(model, { type: 'probe', position });
    hasRenderedFrame = false;
  }
  engine.advanceTo(clock.tick(now).timeSeconds);
  const hintSources = previewSeparation === null ? model.sources : updateModel(model, { type: 'separation', value: previewSeparation }).sources;
  const latestFrame = engine.read(model.probe, visibleFieldBounds(transform), view.changeMode === 'instant' && previewSeparation !== null
    ? { equilibriumSources: [hintSources[0].position, hintSources[1].position] } : undefined);
  const sampleDue = view.playing && cadence.shouldSample(now, latestFrame.snapshot.steady, fieldView.rate(latestFrame));
  const refreshPhysics = sampleDue || !hasRenderedFrame || (dirty && (!view.playing || view.changeMode === 'instant')) || (side && unfolding);
  if (refreshPhysics) { currentFrame = latestFrame; pathSamples = undefined; }
  const visible = view.comparisonOpen || progress > 0;
  const showPaths = visible || view.pathWaves;
  shell.comparisonRegion.hidden = !visible;
  shell.stage.classList.toggle('comparison-open', visible);
  shell.overlay.style.display = showPaths ? 'block' : 'none';
  shell.comparisonRegion.style.height = `${side ? 0 : comparisonHeight * easedProgress}px`;
  // Keep SVG coordinates fixed while the containing stage reveals/clips its height.
  // Changing the SVG scale here would stretch the wave during expansion.
  shell.overlay.style.height = `${side ? fieldHeight : fieldHeight + comparisonHeight}px`;
  shell.overlay.setAttribute('viewBox', `0 0 ${width} ${side ? fieldHeight : fieldHeight + comparisonHeight}`);
  if (dirty || refreshPhysics || unfolding || fading) {
    const snapshot = currentFrame.snapshot;
    fieldView.render(currentFrame, view.fieldMode, transform, selectedPalette, view.playing,
      view.changeMode === 'propagate' && (previewSeparation !== null || snapshot.moving) ? [hintSources[0].position, hintSources[1].position] : undefined, showProbeBounds ? regionOutline : undefined);
    hasRenderedFrame = true;
    if (showPaths) {
      pathSamples ??= currentFrame.samplePaths();
      comparisonView.render(snapshot, pathSamples, { width: side ? columns.comparisonWidth : width, fieldHeight: side ? (fieldHeight - comparisonHeight) / 2 : fieldHeight, offsetX: side ? columns.fieldWidth : 0, comparisonHeight, progress: easedProgress, guideOpacity: guideProgress * guideProgress * (3 - 2 * guideProgress), fieldTransform: transform });
    }
    dirty = false;
    updateReadouts();
    if (announcementPending && refreshPhysics) flushAnnouncement();
    fieldView.presented(performance.now() - workStart);
  }
  if (view.playing || progress !== target || guideProgress !== guideTarget) animationFrame = requestAnimationFrame(render);
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
controls.pathWaves.addEventListener('click', () => {
  view = { ...view, pathWaves: !view.pathWaves };
  syncControls(); requestRender();
}, { signal });
controls.changeProcess.addEventListener('click', () => {
  const changeMode = view.changeMode === 'propagate' ? 'instant' : 'propagate';
  fieldInput.cancel(); previewSeparation = null;
  engine.advanceTo(clock.tick(performance.now()).timeSeconds);
  if (changeMode === 'instant') engine.settle();
  view = { ...view, changeMode };
  cadence.reset(); hasRenderedFrame = false; syncControls(); requestRender();
}, { signal });
for (const [control, mode] of [[controls.wave, 'wave'], [controls.amplitude, 'amplitude']] as const) {
  control.addEventListener('click', () => {
    fieldInput.cancel();
    engine.advanceTo(clock.tick(performance.now()).timeSeconds);
    view = { ...view, fieldMode: mode }; hasRenderedFrame = false; syncControls(); requestRender();
  }, { signal });
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
  clearTimeout(boundsTimer); showProbeBounds = false;
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
  getProbeGuide: () => {
    const frame = engine.read(model.probe, visibleFieldBounds(transform));
    if (!frame.snapshot.steady || previewSeparation !== null || !probeRegion) return undefined;
    const region = probeRegion;
    return {
      key: JSON.stringify([frame.snapshot.model.wavelength, frame.snapshot.model.sources]),
      phaseAt: (point: Vec2) => frame.samplePoint(point).phaseDifference,
      contains: (point: Vec2) => containsProbe(region, point),
    };
  },
  moveProbe: (position) => dispatch({ type: 'probe', position }),
  setSeparation: (value) => dispatch({ type: 'separation', value }),
  getTargetSeparation: targetSeparation, previewSeparation: preview, announce,
});
const resizeObserver = new ResizeObserver(() => {
  const rect = shell.field.getBoundingClientRect();
  width = shell.stage.getBoundingClientRect().width; fieldHeight = rect.height;
  hasRenderedFrame = false;
  requestRender();
});
resizeObserver.observe(shell.field);
resizeObserver.observe(shell.stage);
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
landscape.addEventListener('change', () => { fieldInput.cancel(); hasRenderedFrame = false; requestRender(); }, { signal });
syncControls(); updateReadouts(); requestRender();

// Vite tears down the same owned resources before mounting a development replacement.
if (import.meta.hot) import.meta.hot.dispose(() => {
  clearTimeout(boundsTimer);
  destroyed = true; cancelAnimationFrame(animationFrame); abort.abort();
  resizeObserver.disconnect(); fieldInput.destroy(); palettePicker.destroy(); detailOptions.destroy(); fieldView.destroy(); comparisonView.destroy(); shell.destroy();
});
