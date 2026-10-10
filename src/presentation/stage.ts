import type { CueSpec, FrameValidity, MotionSpeed, SemanticId } from '../lesson/types';
import type { ModelState, PathSample, PhysicsSnapshot, SourcePair } from '../model/types';
import type { WaveFrame } from '../physics/engine';
import { placePathPoint, visibleFieldBounds } from '../geometry/layout';
import { createFieldView } from '../views/field';
import { createComparisonView, type ComparisonDisplay } from '../views/comparison';
import { svgElement, svgText, setAttributes } from '../visual/svg';
import { teacherCorrespondence, teacherFieldTransform, teacherPose, updatePoseGeometry, type TeacherPose } from './layout';
import { createPresentationAnimator } from './animator';
import { resolveVisibility } from '../lesson/reveal-policy';
import { DEFAULT_PALETTE, type PaletteId } from '../visual/field-palettes';
import { createProbeMarker } from '../visual/point-markers';
import { formatSettingDistance } from '../ui/copy';
import './teacher.css';

export { teacherFieldEnvelope } from './layout';
interface StageState {
  now: number; playing: boolean; reducedMotion?: boolean; motionSpeed?: MotionSpeed;
  visible?: ReadonlySet<SemanticId>; validity?: FrameValidity; question?: string;
  allowedInputs?: readonly string[];
  palette?: PaletteId;
}
export function createTeacherStage(container: HTMLElement, options: {
  invalidate: () => void; report?: (event: string, error?: unknown) => void;
}) {
  const abort = new AbortController();
  container.classList.add('teacher-stage');
  const background = document.createElement('div'); background.className = 'teacher-background';
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); background.append(canvas);
  const fieldSvg = svgElement('svg', { class: 'teacher-field-overlay', role: 'group', 'aria-label': '관측점과 파원' });
  const pathsSvg = svgElement('svg', { class: 'teacher-path-overlay', 'aria-hidden': 'true' });
  const counterpart = svgElement('svg', { class: 'teacher-correspondence-overlay', 'aria-hidden': 'true' });
  const question = document.createElement('h2'); question.className = 'teacher-question';
  const note = document.createElement('p'); note.className = 'teacher-correspondence-note';
  const representation = document.createElement('p'); representation.className = 'teacher-representation-label';
  const splitTitle = document.createElement('div'); splitTitle.className = 'teacher-correspondence-titles';
  splitTitle.innerHTML = '<span>공간 속 경로</span><span>같은 경로를 펼친 표현</span>';
  const reducedToggle = document.createElement('button'); reducedToggle.className = 'teacher-reduced-toggle'; reducedToggle.type = 'button';
  const fullPaths = document.createElement('button'); fullPaths.className = 'teacher-full-paths'; fullPaths.type = 'button'; fullPaths.textContent = '전체 경로';
  const rule = document.createElement('div'); rule.className = 'teacher-rule'; rule.dataset.semantic = 'rule';
  rule.innerHTML = '<p>경로차를 파장과 비교하기</p><strong>Δr = mλ <span>보강</span></strong><strong>Δr = (m + ½)λ <span>완전 상쇄</span></strong><small>Δr = |r₂ − r₁| · m = 0, 1, 2, …<br>같은 진동수 · 같은 초기 위상 · 같은 도착 진폭 · 정상 상태</small>';
  const conditions = document.createElement('p'); conditions.className = 'teacher-condition-values';
  const legend = document.createElement('p'); legend.className = 'teacher-model-legend'; legend.textContent = '같은 진동수 · 같은 초기 위상 · 같은 도착 진폭';
  const cuts = svgElement('g', { 'data-path-cuts': '', display: 'none' }, pathsSvg);
  const cutMarks = [0, 1].map(() => svgText(cuts, '∕∕', { 'font-size': 24, fill: '#526979' }));
  container.append(background, fieldSvg, pathsSvg, counterpart, question, note, representation, splitTitle, reducedToggle, fullPaths, rule, conditions, legend);
  const field = createFieldView(canvas, fieldSvg, options.invalidate, options.report);
  const comparison = createComparisonView(pathsSvg), correspondenceView = createComparisonView(counterpart);
  const fixedProbe = svgElement('g', { 'data-fixed-probe': '', display: 'none' }, counterpart);
  createProbeMarker(fixedProbe, '#5f497f');
  const animator = createPresentationAnimator();
  let width = 0, height = 0, cueId = '', sizeKey = '', reduced = false, currentPose: TeacherPose | undefined;
  let lastLayout: CueSpec['layout'] | undefined, previousPose: TeacherPose | undefined, lastTransition: CueSpec['transition'] = 'none';
  let reducedSpatial = false, full = false, lastNow = 0, lastSpeed: MotionSpeed = 'normal';
  let fieldWasVisible = false, unfoldFromVisibleField = false;
  function measure() {
    width = Math.max(280, container.clientWidth || 1280); height = Math.max(400, container.clientHeight || 664);
    container.style.setProperty('--stage-width', width + 'px');
  }
  reducedToggle.addEventListener('click', () => { reducedSpatial = !reducedSpatial; options.invalidate(); }, { signal: abort.signal });
  fullPaths.addEventListener('click', () => { full = !full; sizeKey = ''; options.invalidate(); }, { signal: abort.signal });
  function prepare(snapshot: PhysicsSnapshot, cue: CueSpec, state: StageState) {
    measure(); lastNow = state.now; lastSpeed = state.motionSpeed ?? 'normal';
    const resized = sizeKey !== width + ':' + height, nextReduced = Boolean(state.reducedMotion), changed = cue.id !== cueId;
    if (changed) { reducedSpatial = false; full = false; unfoldFromVisibleField = fieldWasVisible; }
    const kind = full ? 'path-comparison' : cue.layout;
    if (changed || resized || reduced !== nextReduced) {
      const target = teacherPose(snapshot, width, height, kind);
      const returning = ['field', 'spatial-paths'].includes(kind) && lastLayout && !['field', 'spatial-paths'].includes(lastLayout);
      // A reveal within the same layout keeps its current camera and row scale.
      const sameLayout = !resized && lastLayout === kind && currentPose && cue.transition !== 'move-probe';
      const destination = sameLayout ? updatePoseGeometry({ ...currentPose!, backgroundOpacity: target.backgroundOpacity }, snapshot, kind) : target;
      previousPose = animator.sample(state.now);
      lastTransition = returning ? 'fold-to-field' : cue.transition;
      animator.setTarget(destination, lastTransition, state.now, resized || nextReduced || !cueId, state.motionSpeed);
      cueId = cue.id; sizeKey = width + ':' + height; reduced = nextReduced; lastLayout = kind;
    }
    currentPose = animator.sample(state.now)!;
    if (!animator.active()) {
      if (['field', 'spatial-paths'].includes(kind)) currentPose = { ...currentPose, camera: teacherFieldTransform(snapshot.model, width, height) };
      currentPose = updatePoseGeometry(currentPose, snapshot, kind);
      // Keep the current pose as the next transition's exact source.
      animator.setTarget(currentPose, 'none', state.now, true);
    }
    return visibleFieldBounds(currentPose.camera);
  }
  return {
    fieldSvg,
    getTransform: () => currentPose!.camera,
    prepare,
    getObservationProbe: () => lastTransition === 'move-probe' && animator.active() ? currentPose?.observationProbe : undefined,
    getFieldBounds(model: ModelState) { measure(); return visibleFieldBounds(currentPose?.camera ?? teacherFieldTransform(model, width, height)); },
    render(frame: WaveFrame, paths: SourcePair<PathSample>, cue: CueSpec, state: StageState) {
      const start = performance.now();
      prepare(frame.snapshot, cue, state);
      let pose = currentPose!;
      const transitioning = animator.active();
      const movingProbe = transitioning && lastTransition === 'move-probe';
      // Distances, ray angles and the displayed P all come from one engine frame.
      if (movingProbe) pose = updatePoseGeometry(pose, frame.snapshot, cue.layout);
      const staticCorrespondence = reduced && cue.layout === 'parallel';
      const split = staticCorrespondence && width >= 900;
      const diagram = split ? teacherCorrespondence(frame.snapshot, width, height) : undefined;
      if (diagram) pose = diagram.parallel;
      else if (staticCorrespondence && reducedSpatial) pose = { ...teacherPose(frame.snapshot, width, height, 'spatial-paths'), backgroundOpacity: 0 };
      const validity = state.validity ?? { generation: 0, timeSeconds: frame.snapshot.clock.timeSeconds,
        analysisSteady: frame.snapshot.steady, probeSteady: frame.snapshot.probe.interference !== 'transient' };
      const visible = state.visible ?? resolveVisibility(cue, validity);
      const prediction = cue.revealPolicy !== 'explain';
      // Only a previously observed wave field may withdraw during unfolding;
      // jumping into a prediction still masks the old field immediately.
      const withdrawingField = transitioning && lastTransition === 'unfold-in-place' &&
        unfoldFromVisibleField && cue.revealPolicy === 'predict-sum' && cue.fieldMode === 'wave';
      const showBackground = pose.backgroundOpacity > .001 &&
        (visible.has('field') || (!prediction && transitioning) || withdrawingField);
      fieldWasVisible = showBackground;
      background.hidden = !showBackground;
      background.style.opacity = String(showBackground ? pose.backgroundOpacity : 0);
      background.style.transform = 'translateY(' + pose.backgroundLift + 'px)';
      // Avoid a full-stage blur on a CPU fallback; opacity still conveys withdrawal.
      background.style.filter = canvas.dataset.renderer !== 'cpu' && pose.backgroundBlur > .1 ? 'blur(' + pose.backgroundBlur + 'px)' : '';
      const transform = { width, height, scale: width / frame.fieldBounds.width,
        offsetX: -frame.fieldBounds.x * width / frame.fieldBounds.width, offsetY: -frame.fieldBounds.y * width / frame.fieldBounds.width };
      const spatial = ['field', 'spatial-paths'].includes(cue.layout) && (!transitioning || movingProbe);
      fieldSvg.style.pointerEvents = spatial ? 'auto' : 'none';
      fieldSvg.setAttribute('aria-hidden', String(!spatial));
      fieldSvg.style.opacity = transitioning && !movingProbe ? String(Math.min(1, pose.backgroundOpacity * 3)) : '1';
      field.render(frame, cue.fieldMode, transform, state.palette ?? DEFAULT_PALETTE, state.playing, undefined, undefined, {
        surface: showBackground, paths: visible.has('spatial-paths'), distances: false, scale: false,
        sources: spatial && visible.has('source-1'), probe: spatial && visible.has('probe'),
        inputEnabled: spatial && !transitioning && !!state.allowedInputs?.length,
        probeInput: state.allowedInputs?.includes('probe') ?? false, sourceInput: state.allowedInputs?.includes('separation') ?? false,
        localProbeResult: visible.has('local-probe-result') && spatial,
        displacementScale: pose.layout.displacementScale,
        pathSourceBadges: [visible.has('path-1') || visible.has('path-baselines'), visible.has('path-2') || visible.has('path-baselines')],
      });
      const ready = !transitioning, baselines = visible.has('path-baselines');
      const display: ComparisonDisplay = {
        paths: [visible.has('path-1') || baselines, visible.has('path-2') || baselines],
        waves: [visible.has('path-1'), visible.has('path-2')], endpoints: !baselines,
        distances: ready && visible.has('distance-values'),
        commonDistance: ready && visible.has('same-distance-correspondence'),
        extraPath: ready && visible.has('path-difference'), ruler: ready && visible.has('wavelength-ruler'),
        values: ready && visible.has('distance-values'), ratio: cue.revealPolicy !== 'predict-from-paths',
        components: [ready && visible.has('component-1'), ready && visible.has('component-2')],
        resultant: ready && visible.has('resultant'), links: ready && visible.has('endpoint-links'),
        sourceLabels: false, sameProbe: false,
      };
      setAttributes(pathsSvg, { viewBox: '0 0 ' + width + ' ' + height });
      comparison.render(frame.snapshot, paths, {
        width, fieldHeight: 0, comparisonHeight: height - 12, progress: 1, guideOpacity: 1,
        fieldTransform: transform, layout: pose.layout, placements: pose.placements, display,
        presentation: true, presentationScale: pose.magnification, analysisSteady: validity.analysisSteady,
      });
      counterpart.style.display = split ? '' : 'none';
      if (diagram) {
        setAttributes(counterpart, { viewBox: '0 0 ' + width + ' ' + height });
        correspondenceView.render(frame.snapshot, paths, { width, fieldHeight: 0, comparisonHeight: height - 12,
          progress: 1, guideOpacity: 1, fieldTransform: transform, layout: diagram.spatial.layout,
          placements: diagram.spatial.placements, display, presentation: true, presentationScale: diagram.spatial.magnification,
          analysisSteady: validity.analysisSteady });
      }
      const staticSpatial = diagram?.spatial ?? (staticCorrespondence && reducedSpatial ? pose : undefined);
      if (staticSpatial) {
        const parent = diagram ? counterpart : pathsSvg;
        if (fixedProbe.parentNode !== parent) parent.append(fixedProbe);
        const p = placePathPoint(frame.snapshot.probe.distances[0], 0, staticSpatial.placements[0]);
        setAttributes(fixedProbe, { display: null, transform: 'translate(' + p.x + ',' + p.y + ')' });
      } else setAttributes(fixedProbe, { display: 'none' });
      const rowClipped = pose.placements.map((p, i) => !spatial && !transitioning && !staticCorrespondence &&
        (p.origin.x < 24 || placePathPoint(frame.snapshot.probe.distances[i], 0, p).x > width - 32));
      const clipped = rowClipped.some(Boolean);
      setAttributes(cuts, { display: clipped ? null : 'none' });
      cutMarks.forEach((mark, i) => setAttributes(mark, { display: rowClipped[i] ? null : 'none',
        x: pose.placements[i].origin.x < 24 ? 24 : width - 40, y: pose.placements[i].origin.y + 8 }));
      fullPaths.hidden = !(clipped || full);
      fullPaths.textContent = full ? '도착점 상세' : '전체 경로';
      splitTitle.hidden = !split; reducedToggle.hidden = !staticCorrespondence || split;
      reducedToggle.textContent = reducedSpatial ? '같은 축척으로 펼친 경로 보기' : '같은 축척으로 공간 경로 보기';
      question.textContent = cue.showQuestion ? state.question ?? cue.question ?? '' : '';
      question.hidden = !question.textContent;
      note.textContent = split ? '같은 P의 두 성분 · 두 표현은 같은 축척' : '같은 P의 두 성분';
      note.hidden = !visible.has('same-probe-label');
      representation.textContent = '가로: 경로를 따라간 거리 · 세로: 변위  /  ' + (state.playing ? '재생 중' : '정지한 순간');
      representation.hidden = !visible.has('same-probe-label') || transitioning;
      rule.hidden = !visible.has('rule');
      conditions.hidden = !visible.has('condition-values');
      conditions.textContent = '파장 λ ' + formatSettingDistance(frame.snapshot.model.wavelength) +
        (cue.id.endsWith('s7-a-predict') ? '  →  다음 파장 ' + formatSettingDistance(frame.snapshot.model.wavelength / 2) : '');
      legend.hidden = !cue.id.endsWith('s1-field');
      container.dataset.layout = cue.layout; container.dataset.cue = cue.id;
      container.dataset.fieldVisible = String(showBackground && pose.backgroundOpacity > .65);
      container.dataset.transitioning = String(transitioning);
      container.dataset.distanceScale = String(pose.layout.distanceScale);
      container.dataset.displacementScale = String(pose.layout.displacementScale);
      container.dataset.presentationScale = String(pose.magnification);
      container.dataset.timeSeconds = String(frame.snapshot.clock.timeSeconds);
      container.dataset.observationX = String(frame.snapshot.model.probe.x);
      container.dataset.observationY = String(frame.snapshot.model.probe.y);
      container.dataset.reducedMotion = String(reduced);
      field.presented(performance.now() - start);
      return { transitioning };
    },
    rate: field.rate,
    finishTransition() { animator.finish(); },
    transitionActive: animator.active,
    replayTransition() {
      const to = animator.capture();
      if (previousPose && to) {
        animator.setTarget(previousPose, 'none', lastNow, true);
        animator.setTarget(to, lastTransition, performance.now(), reduced, lastSpeed);
      }
    },
    suspend: animator.suspend, resume: animator.resume,
    destroy() { abort.abort(); animator.dispose(); correspondenceView.destroy(); comparison.destroy(); field.destroy(); container.replaceChildren(); },
  };
}
