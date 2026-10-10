import type { AppSession } from './session';
import { createExperimentController } from './experiment-controller';
import { createLessonModel, DEFAULT_LESSON } from '../lesson/default-lesson';
import { createLessonRunner, currentPreset, type LessonRunner } from '../lesson/runner';
import { SEMANTIC_IDS, type CueSpec, type ExperimentPreset, type LessonSpec, type MotionSpeed } from '../lesson/types';
import { resolveVisibility } from '../lesson/reveal-policy';
import { teachingCopy } from '../lesson/teaching-copy';
import { loadLesson, loadPosition, savePosition, type SavedPosition } from '../lesson/storage';
import { createFrameCadence } from '../runtime/frame-cadence';
import { createTeacherStage, teacherFieldEnvelope } from '../presentation/stage';
import { createPresenterControls, type PresenterAction } from '../ui/presenter-controls';
import { createLessonEditor } from '../ui/lesson-editor';
import { bindFieldInput } from '../ui/field-input';
import { createFrameProbeGuide } from './probe-guide';
import { sourceSeparation } from '../model/state';
import { DEFAULT_PALETTE, type PaletteId } from '../visual/field-palettes';

export function mountApp(root: HTMLElement, session: AppSession) {
  const abort = new AbortController(), signal = abort.signal;
  let destroyed = false, animationFrame = 0, refreshPhysics = true, cuePending = false;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches, resumePlaying = true, suspended = false;
  let laser = false, speed: MotionSpeed = 'normal', freeUnfolded = false, notice = '';
  let palette: PaletteId = DEFAULT_PALETTE;
  let editor: ReturnType<typeof createLessonEditor> | undefined, preview: { lesson: LessonSpec; cue: CueSpec } | undefined;
  let rehearsing = false, savedRun: { lesson: LessonSpec; cueId: string; preset: ExperimentPreset } | undefined;
  let rehearsalPreset: ExperimentPreset | undefined, bookmark: SavedPosition | undefined;
  let initial = DEFAULT_LESSON;
  try { initial = loadLesson() ?? DEFAULT_LESSON; bookmark = loadPosition(initial); }
  catch { notice = '저장한 수업을 읽지 못해 기본 수업을 열었습니다. 기존 저장 내용은 유지됩니다.'; }
  speed = initial.motionSpeed;
  session.onDispose(() => { destroyed = true; cancelAnimationFrame(animationFrame); abort.abort(); });
  root.innerHTML = '<main class="teacher-shell" aria-label="교사 수업"><div class="teacher-stage-slot"><section class="teacher-stage" aria-label="수업 관찰 무대"></section></div><div class="teacher-status-strip" role="status"></div><nav class="teacher-controls" aria-label="수업 진행"></nav><div class="teacher-blackout" hidden><p>화면을 가렸습니다</p><button>가림 해제 · B</button></div><div class="teacher-laser" hidden></div><p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-lesson-announcement></p></main><div class="lesson-editor-host" hidden></div>';
  session.onDispose(() => root.replaceChildren());
  const shell = root.querySelector<HTMLElement>('.teacher-shell')!, slot = root.querySelector<HTMLElement>('.teacher-stage-slot')!;
  const stageElement = root.querySelector<HTMLElement>('.teacher-stage')!, announcement = root.querySelector<HTMLElement>('[data-lesson-announcement]')!;
  const nav = root.querySelector<HTMLElement>('.teacher-controls')!, status = root.querySelector<HTMLElement>('.teacher-status-strip')!;
  const black = root.querySelector<HTMLElement>('.teacher-blackout')!, pointer = root.querySelector<HTMLElement>('.teacher-laser')!;
  const editorHost = root.querySelector<HTMLElement>('.lesson-editor-host')!;
  const model = createLessonModel(initial.experiments[initial.scenes[0].cues[0].experimentContextId]);
  const experiment = createExperimentController({ model, fieldEnvelope: teacherFieldEnvelope(model.bounds) });
  const stage = createTeacherStage(stageElement, { invalidate: () => { refreshPhysics = true; requestRender(); }, report: session.record });
  session.onDispose(() => stage.destroy());
  const cadence = createFrameCadence();
  let bundle = experiment.readBundle(stage.getFieldBounds(model)), frame = bundle.frame, paths = frame.samplePaths();
  let frameBounds = JSON.stringify(frame.fieldBounds), runner: LessonRunner;
  let fieldInput: ReturnType<typeof bindFieldInput> | undefined;

  function requestRender() {
    if (!destroyed && !document.hidden && !animationFrame) animationFrame = requestAnimationFrame(render);
  }
  function beforeChange() { fieldInput?.cancel(); cuePending = true; refreshPhysics = true; }
  function changed() {
    refreshPhysics = true;
    if (!preview && !rehearsing && runner) {
      try { savePosition({ lessonId: runner.lesson.id, revision: runner.lesson.revision, cueId: runner.state.cue.id,
        preset: currentPreset(experiment), changed: runner.changedConditions }); }
      catch { notice = '이 브라우저에 위치를 저장할 수 없습니다. 수업은 계속할 수 있습니다.'; }
    }
    requestRender();
  }
  function createRun(lesson: LessonSpec, cueId?: string, preset?: ExperimentPreset) {
    runner?.dispose(); preview = undefined;
    runner = createLessonRunner(lesson, { experiment, now: () => performance.now(), initialCueId: cueId, initialPreset: preset,
      beforeChange, onChange: changed, transitionActive: stage.transitionActive,
      finishTransition: stage.finishTransition, replayTransition: stage.replayTransition });
    speed = lesson.motionSpeed; refreshPhysics = true; cuePending = true; cadence.reset(); requestRender();
  }
  createRun(initial);

  function showEditor(lesson = runner.lesson) {
    if (!editor) {
      savedRun = { lesson: runner.lesson, cueId: runner.state.cue.id, preset: currentPreset(experiment) };
      editor = createLessonEditor(editorHost, lesson, {
        preview(lesson, cue) {
          preview = { lesson, cue }; speed = lesson.motionSpeed;
          const now = performance.now(); experiment.reset(now, createLessonModel(lesson.experiments[cue.experimentContextId]));
          experiment.setPlaying(false, now); stage.finishTransition(); refreshPhysics = true; requestRender();
        },
        rehearse(lesson, cueId) {
          editorHost.hidden = true; shell.hidden = false; slot.append(stageElement); preview = undefined; rehearsing = true;
          createRun(lesson, cueId);
        },
        start(lesson) {
          closeEditorDom(); rehearsing = false; savedRun = undefined; rehearsalPreset = undefined; createRun(lesson);
        },
        close() {
          const saved = savedRun!; closeEditorDom(); rehearsing = false; rehearsalPreset = undefined; savedRun = undefined;
          createRun(saved.lesson, saved.cueId, saved.preset); notice = '편집 전 입력 조건에서 새 실험을 시작했습니다.';
        },
        currentPreset: () => rehearsalPreset ?? currentPreset(experiment),
      });
    }
    fieldInput?.cancel(); stage.finishTransition(); shell.hidden = true; editorHost.hidden = false;
    editor.previewHost.append(stageElement); editor.render(); requestRender();
  }
  function closeEditorDom() { slot.append(stageElement); editor?.destroy(); editor = undefined; editorHost.hidden = true; shell.hidden = false; preview = undefined; }
  session.onDispose(() => { editor?.destroy(); runner.dispose(); });

  function action(action: PresenterAction) {
    if (action === 'next') { if (!cuePending) runner.next(); }
    else if (action === 'previous') runner.previous();
    else if (action === 'play') { experiment.setPlaying(!experiment.playing, performance.now()); refreshPhysics = true; }
    else if (action === 'restart') runner.restart();
    else if (action === 'restartExample') runner.restart(true);
    else if (action === 'replay') runner.replayTransition();
    else if (action === 'explore') { freeUnfolded = false; runner.explore(); }
    else if (action === 'return' || action === 'restoreReturn') runner.returnToLesson(action === 'restoreReturn');
    else if (action === 'restore') runner.restoreLessonConditions();
    else if (action === 'settle') { runner.skipPropagation(); notice = '변화 과정을 생략했습니다.'; }
    else if (action === 'blackout') runner.toggleBlackOut();
    else if (action === 'fullscreen') {
      const promise = document.fullscreenElement ? document.exitFullscreen() : shell.requestFullscreen();
      promise.catch(() => { notice = '전체 화면을 열 수 없습니다. 브라우저의 전체 화면 기능을 사용해 주세요.'; requestRender(); });
    }
    else if (action === 'laser') { laser = !laser; if (!laser) pointer.hidden = true; fieldInput?.cancel(); }
    else if (action === 'reduced') { reducedMotion = !reducedMotion; refreshPhysics = true; }
    else if (action === 'editor') showEditor();
    else if (action === 'rehearsalEnd' && editor) {
      rehearsalPreset = currentPreset(experiment); rehearsing = false;
      const cueId = editor.cueId; showEditor(); editor.select(cueId);
    }
    else if (action === 'freeLayout') { freeUnfolded = !freeUnfolded; refreshPhysics = true; }
    else if (action === 'resume' && bookmark) { createRun(runner.lesson, bookmark.cueId, bookmark.preset); notice = '저장한 입력 조건에서 새 실험을 시작했습니다.'; bookmark = undefined; }
    else if (action === 'exit') { const url = new URL(location.href); url.searchParams.delete('mode'); location.assign(url.href); }
    requestRender();
  }
  const controls = createPresenterControls(nav, {
    action, goTo: (sceneId, cueId) => runner.goTo(sceneId, cueId),
    input(id, value) {
      if (id === 'probe' && typeof value !== 'number') runner.manual({ type: 'probe', position: value });
      else if (id !== 'probe' && typeof value === 'number') runner.manual({ type: id, value });
    },
    rate(value) { experiment.setRate(value, performance.now()); refreshPhysics = true; requestRender(); },
    speed(value) { speed = value; requestRender(); },
    palette(value) { palette = value; requestRender(); },
    override(id, visible) { runner.setOverride(id, visible); },
  });
  session.onDispose(() => controls.destroy());
  black.querySelector('button')!.addEventListener('click', () => action('blackout'), { signal });

  function activeCue(): CueSpec {
    if (preview) return { ...preview.cue, id: 'preview-' + preview.cue.id };
    const cue = runner.state.cue;
    if (!runner.exploring) return cue;
    return { ...cue, id: 'explore-' + cue.id + (freeUnfolded ? '-parallel' : '-space'),
      layout: freeUnfolded ? 'path-comparison' : 'spatial-paths', transition: freeUnfolded ? 'unfold-in-place' : 'fold-to-field',
      visible: SEMANTIC_IDS.filter(id => id !== 'rule' && id !== 'path-baselines' && id !== 'condition-values'),
      revealPolicy: 'explain', showQuestion: true, question: 'P와 파장을 바꾸며 경로차와 진동을 관찰해 보세요.',
      allowedInputs: ['probe', 'wavelength', 'separation'] };
  }
  function canInput(target: string) {
    const cue = activeCue();
    return !laser && !runner.blackOut && !preview && !stage.transitionActive() &&
      ['field', 'spatial-paths'].includes(cue.layout) && cue.allowedInputs.includes(target === 'probe' ? 'probe' : 'separation');
  }
  fieldInput = bindFieldInput(stage.fieldSvg, {
    getTransform: stage.getTransform, getModel: () => ({ ...frame.snapshot.model, probe: experiment.model.probe }),
    getProbeGuide: () => {
      // Free exploration has an explain cue; prediction cues never reveal a line through touch.
      if (!canInput('probe') || activeCue().revealPolicy !== 'explain') return undefined;
      const bounds = experiment.model.bounds;
      return createFrameProbeGuide(experiment.read({ x: 0, y: 0, ...bounds }),
        point => point.x >= 0 && point.x <= bounds.width && point.y >= 0 && point.y <= bounds.height);
    },
    getTargetSeparation: () => sourceSeparation(experiment.model),
    canInput, moveProbe: point => runner.manual({ type: 'probe', position: point }),
    setSeparation: value => runner.manual({ type: 'separation', value }),
    previewSeparation: () => {}, announce: requestRender,
  });
  session.onDispose(() => fieldInput?.destroy());
  session.describeWith(() => ({ mode: 'teacher', model: experiment.model, playing: experiment.playing,
    timeSeconds: frame.snapshot.clock.timeSeconds, cueId: runner.state.cue.id, contextEntryId: runner.contextEntryId,
    validity: bundle.validity, reducedMotion, transitioning: stage.transitionActive() }));

  let announcedCue = '', statusKey = '';
  function render(now: number) {
    animationFrame = 0; if (destroyed || document.hidden) return;
    experiment.advance(now);
    const cue = activeCue();
    const bounds = stage.prepare(experiment.read().snapshot, cue, { now, playing: experiment.playing, reducedMotion, motionSpeed: speed });
    const nextBounds = JSON.stringify(bounds);
    const observationProbe = stage.getObservationProbe() ?? experiment.model.probe;
    if (refreshPhysics || frameBounds !== nextBounds || experiment.generation !== bundle.validity.generation ||
      observationProbe.x !== frame.snapshot.model.probe.x || observationProbe.y !== frame.snapshot.model.probe.y ||
      (experiment.playing && cadence.shouldSample(now, frame.snapshot.steady, stage.rate(frame)))) {
      bundle = experiment.readBundle(bounds, observationProbe); frame = bundle.frame; paths = frame.samplePaths();
      frameBounds = nextBounds; refreshPhysics = false;
    }
    const visible = resolveVisibility(cue, bundle.validity, preview || runner.exploring ? {} : runner.teacherOverride);
    const copy = preview ? teachingCopy(preview.cue, preview.lesson, false) :
      runner.exploring ? { question: cue.question, notes: cue.teacherNotes } : teachingCopy(cue, runner.lesson, runner.changedConditions);
    const question = copy.question;
    const { transitioning } = stage.render(frame, paths, cue, { now, playing: experiment.playing, reducedMotion, motionSpeed: speed,
      validity: bundle.validity, visible, question, palette, allowedInputs: preview ? [] : cue.allowedInputs });
    cuePending = false;
    const state = runner.state;
    const waiting = !state.canNext && state.index < state.total - 1 && !runner.exploring
      ? experiment.playing ? '새 조건이 도착하는 중입니다. 도착한 뒤 결과 확인을 눌러 주세요.' : '재생하면 새로운 조건이 도착합니다.' : undefined;
    shell.dataset.cue = state.cue.id; shell.dataset.context = state.cue.experimentContextId;
    shell.dataset.timeSeconds = String(frame.snapshot.clock.timeSeconds); shell.dataset.playing = String(experiment.playing);
    shell.dataset.transitioning = String(transitioning); shell.dataset.analysisSteady = String(bundle.validity.analysisSteady);
    shell.dataset.probeX = String(experiment.model.probe.x); shell.dataset.probeY = String(experiment.model.probe.y);
    shell.dataset.exploring = String(runner.exploring); shell.dataset.wavelength = String(experiment.model.wavelength);
    black.hidden = !runner.blackOut; stageElement.setAttribute('aria-hidden', String(runner.blackOut)); stageElement.inert = runner.blackOut;
    status.hidden = runner.blackOut;
    const message = rehearsing ? '부분 리허설 · 실험 조작은 초안에 자동 저장되지 않습니다.' :
      runner.exploring ? '잠시 자유 조작 · 현재 조건을 유지하고 수업으로 돌아갈 수 있습니다.' :
      waiting ?? (runner.changedConditions ? '조건 변경됨 · 현재 조건을 유지합니다.' : notice);
    const nextStatusKey = message + ':' + rehearsing + ':' + runner.exploring + ':' + state.index;
    if (nextStatusKey !== statusKey) {
      statusKey = nextStatusKey; status.replaceChildren();
      if (message) { const span = document.createElement('span'); span.textContent = message; status.append(span); }
      if (runner.exploring || rehearsing || !state.canNext && state.index === state.total - 1) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = rehearsing ? '리허설 끝내기' : runner.exploring ? '현재 조건으로 수업 복귀' : '자유롭게 더 탐구하기';
      button.onclick = () => action(rehearsing ? 'rehearsalEnd' : runner.exploring ? 'return' : 'explore'); status.append(button);
      }
    }
    controls.render({ lesson: runner.lesson, sceneLabel: (state.sceneIndex + 1) + ' / ' + runner.lesson.scenes.length + ' · ' + state.scene.title,
      cueId: state.cue.id, context: state.cue.experimentContextId, nextLabel: runner.nextLabel, previousLabel: runner.previousLabel,
      playing: experiment.playing, canPrevious: state.canPrevious, canNext: state.canNext, transitioning, reducedMotion,
      waiting, blackOut: runner.blackOut, laser, exploring: runner.exploring, rehearsing, canResume: !!bookmark,
      notes: copy.notes,
      preset: currentPreset(experiment), allowed: cue.allowedInputs, rate: experiment.playbackRate, speed, palette, visible, overrideable: cue.overrideable });
    if (announcedCue !== cue.id && !runner.blackOut) { announcement.textContent = state.scene.title + '. ' + (question ?? ''); announcedCue = cue.id; }
    if (runner.blackOut) announcement.textContent = '화면 가림';
    if (experiment.playing || transitioning) requestRender();
  }
  const observer = new ResizeObserver(() => { fieldInput?.cancel(); refreshPhysics = true; requestRender(); });
  observer.observe(stageElement); session.onDispose(() => observer.disconnect());
  media.addEventListener('change', () => { reducedMotion = media.matches; refreshPhysics = true; requestRender(); }, { signal });
  function suspend() {
    if (suspended) return; suspended = true; const now = performance.now();
    resumePlaying = experiment.playing; experiment.setPlaying(false, now); fieldInput?.cancel(); stage.suspend(now);
    cancelAnimationFrame(animationFrame); animationFrame = 0;
  }
  function resume() {
    if (!suspended) return; suspended = false; const now = performance.now();
    experiment.setPlaying(resumePlaying, now); stage.resume(now); refreshPhysics = true; cadence.reset(); requestRender();
  }
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resume(), { signal });
  window.addEventListener('pagehide', suspend, { signal }); window.addEventListener('pageshow', resume, { signal });
  stageElement.addEventListener('pointermove', event => {
    if (!laser || runner.blackOut) return; pointer.hidden = false;
    pointer.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
  }, { signal });
  stageElement.addEventListener('pointerleave', () => { pointer.hidden = true; }, { signal });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target as Element;
    if (target.closest('input,textarea,select,[contenteditable="true"],[data-handle],.lesson-editor') || controls.dialogOpen || preview) return;
    const key = event.key.toLowerCase();
    const actionByKey: Record<string, PresenterAction> = { arrowright: 'next', pagedown: 'next', arrowleft: 'previous', pageup: 'previous', k: 'play', f: 'fullscreen', b: 'blackout' };
    if (actionByKey[key]) { event.preventDefault(); action(actionByKey[key]); }
    else if (key === ' ' && !target.closest('button,summary,a')) { event.preventDefault(); action('next'); }
    else if (key === 'o') { event.preventDefault(); controls.openOverview(); }
    else if (key === 'escape' && laser) { event.preventDefault(); action('laser'); }
  }, { signal });
  requestRender();
}
