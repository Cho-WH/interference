import type { AppSession } from './session';
import { createModel, updateModel, sourcePositionExtremes, sourceSeparation, normalizeParameter } from '../model/state';
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
import { createObservationPanel } from '../ui/observation-panel';
import { createComparisonTransition } from '../runtime/comparison-transition';
import { createShell } from '../ui/shell';
import { bindFieldInput } from '../ui/field-input';
import { createDetailOptions } from '../ui/detail-options';
import { createPalettePicker } from '../ui/palette-picker';
import { DEFAULT_PALETTE, type PaletteId } from '../visual/field-palettes';
import { DEFAULT_PLAYBACK_RATE, PLAYBACK_RATES } from '../model/playback';

export function mountApp(root: HTMLElement, session: AppSession) {
  let animationFrame = 0, boundsTimer = 0;
  let destroyed = false;
  const abort = new AbortController();
  const signal = abort.signal;
  session.onDispose(() => {
    destroyed = true; clearTimeout(boundsTimer); cancelAnimationFrame(animationFrame); abort.abort();
  });
  let model = createModel();
  const shell = createShell(root, model);
  session.onDispose(() => shell.destroy());
  const { controls } = shell;
  const observationPanel = createObservationPanel(shell);
  const transition = createComparisonTransition();
  let view: ViewState = { playing: true, playbackRate: DEFAULT_PLAYBACK_RATE, fieldMode: 'wave', changeMode: 'propagate', comparisonOpen: false, pathWaves: true, interacted: false };
  const clock = createClock();
  const cadence = createFrameCadence();
  // The only backend selection point. Views consume WaveFrame data, not this implementation.
  const engine: WaveEngine = createRetardedEngine(model, sceneFieldEnvelope(model.bounds, sourcePositionExtremes(model.bounds)));
  let currentFrame = engine.read(model.probe);
  let pathSamples: ReturnType<typeof currentFrame.samplePaths> | undefined;
  let previewSeparation: number | null = null;
  let showProbeBounds = false;
  let probeRegion: ProbeRegion | undefined;
  let regionKey = '', regionOutline: readonly Vec2[] = [];
  const fieldView = createFieldView(shell.canvas, shell.fieldOverlay, requestRender, session.record);
  session.onDispose(() => fieldView.destroy());
  const comparisonView = createComparisonView(shell.overlay);
  session.onDispose(() => comparisonView.destroy());
  let width = 0, fieldHeight = 0;
  let transform = createSceneTransform(model.bounds, sourcePositionExtremes(model.bounds), 1, 1);
  let dirty = true;
  let announcementPending = false;
  let hasRenderedFrame = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const landscape = window.matchMedia('(min-width: 560px) and (max-height: 500px) and (orientation: landscape)');
  let selectedPalette: PaletteId = DEFAULT_PALETTE;
  const palettePicker = createPalettePicker(shell.palettePicker, id => {
    selectedPalette = id; requestRender();
  });
  session.onDispose(() => palettePicker.destroy());
  const detailOptions = createDetailOptions(shell.detailOptions);
  session.onDispose(() => detailOptions.destroy());
  session.describeWith(() => ({
    model, view, previewSeparation, selectedPalette,
    timeSeconds: currentFrame.snapshot.clock.timeSeconds,
    steady: currentFrame.snapshot.steady,
    rendering: { ...shell.field.querySelector<HTMLCanvasElement>('canvas')?.dataset },
  }));
  const targetSeparation = () => sourceSeparation(model);
  function syncControls() { observationPanel.controls(model, view, previewSeparation); }
  function updateReadouts() {
    observationPanel.readouts(currentFrame.snapshot, view, previewSeparation !== null, showProbeBounds);
    palettePicker.update(view.fieldMode, currentFrame.snapshot.steady);
  }
  function announce() { announcementPending = true; requestRender(); }
  function flushAnnouncement() { observationPanel.announce(currentFrame.snapshot); announcementPending = false; }
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
    const animation = transition.step(now, reducedMotion.matches);
    const easedProgress = animation.progress;
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
    const refreshPhysics = sampleDue || !hasRenderedFrame || (dirty && (!view.playing || view.changeMode === 'instant')) || (side && animation.pathsChanging);
    if (refreshPhysics) { currentFrame = latestFrame; pathSamples = undefined; }
    const visible = animation.visible;
    const showPaths = visible || view.pathWaves;
    shell.comparisonRegion.hidden = !visible;
    shell.stage.classList.toggle('comparison-open', visible);
    shell.overlay.style.display = showPaths ? 'block' : 'none';
    shell.comparisonRegion.style.height = `${side ? 0 : comparisonHeight * easedProgress}px`;
    // Keep SVG coordinates fixed while the containing stage reveals/clips its height.
    // Changing the SVG scale here would stretch the wave during expansion.
    shell.overlay.style.height = `${side ? fieldHeight : fieldHeight + comparisonHeight}px`;
    shell.overlay.setAttribute('viewBox', `0 0 ${width} ${side ? fieldHeight : fieldHeight + comparisonHeight}`);
    if (dirty || refreshPhysics || animation.changed) {
      const snapshot = currentFrame.snapshot;
      fieldView.render(currentFrame, view.fieldMode, transform, selectedPalette, view.playing,
        view.changeMode === 'propagate' && (previewSeparation !== null || snapshot.moving) ? [hintSources[0].position, hintSources[1].position] : undefined, showProbeBounds ? regionOutline : undefined);
      hasRenderedFrame = true;
      if (showPaths) {
        pathSamples ??= currentFrame.samplePaths();
        comparisonView.render(snapshot, pathSamples, { width: side ? columns.comparisonWidth : width, fieldHeight: side ? (fieldHeight - comparisonHeight) / 2 : fieldHeight, offsetX: side ? columns.fieldWidth : 0, comparisonHeight, progress: easedProgress, guideOpacity: animation.guideOpacity, fieldTransform: transform });
      }
      dirty = false;
      updateReadouts();
      if (announcementPending && refreshPhysics) flushAnnouncement();
      fieldView.presented(performance.now() - workStart);
    }
    if (view.playing || animation.active) animationFrame = requestAnimationFrame(render);
  }

  controls.play.addEventListener('click', () => {
    view = { ...view, playing: !view.playing };
    engine.advanceTo(clock.setPlaying(view.playing, performance.now()).timeSeconds);
    cadence.reset();
    syncControls(); requestRender();
  }, { signal });
  controls.playbackRate.addEventListener('input', () => {
    const playbackRate = PLAYBACK_RATES[Number(controls.playbackRate.value)];
    engine.advanceTo(clock.setRate(playbackRate, performance.now()).timeSeconds);
    view = { ...view, playbackRate };
    cadence.reset(); hasRenderedFrame = false;
    syncControls(); requestRender();
  }, { signal });
  controls.comparison.addEventListener('click', () => {
    view = { ...view, comparisonOpen: !view.comparisonOpen };
    transition.setOpen(view.comparisonOpen, performance.now());
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
    previewSeparation = value === null ? null : normalizeParameter('separation', value, targetSeparation());
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
  session.onDispose(() => fieldInput.destroy());
  const resizeObserver = new ResizeObserver(() => {
    const rect = shell.field.getBoundingClientRect();
    width = shell.stage.getBoundingClientRect().width; fieldHeight = rect.height;
    hasRenderedFrame = false;
    requestRender();
  });
  session.onDispose(() => resizeObserver.disconnect());
  resizeObserver.observe(shell.field);
  resizeObserver.observe(shell.stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      engine.advanceTo(clock.setPlaying(false, performance.now()).timeSeconds);
      fieldInput.cancel();
      cancelAnimationFrame(animationFrame); animationFrame = 0; transition.suspend();
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

}
