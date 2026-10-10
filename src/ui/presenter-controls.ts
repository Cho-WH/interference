import type { LessonSpec, InputId, SemanticId, MotionSpeed } from '../lesson/types';
import type { ExperimentPreset } from '../lesson/types';
export type PresenterAction = 'next' | 'previous' | 'play' | 'restart' | 'restartExample' | 'replay' | 'explore' | 'return' | 'restoreReturn' | 'restore' | 'settle' | 'blackout' | 'fullscreen' | 'laser' | 'reduced' | 'editor' | 'exit' | 'resume' | 'rehearsalEnd' | 'freeLayout';
export function createPresenterControls(container: HTMLElement, callbacks: {
  action(action: PresenterAction): void;
  goTo(sceneId: string, cueId: string): void;
  input(id: InputId, value: number | { x: number; y: number }): void;
  rate(value: number): void; speed(value: MotionSpeed): void;
  override(id: SemanticId, visible: boolean): void;
}) {
  const abort = new AbortController(), signal = abort.signal;
  container.innerHTML = '<button class="teacher-position" data-action="overview" aria-keyshortcuts="O"></button><div class="teacher-primary-controls"><button data-action="previous" aria-keyshortcuts="ArrowLeft PageUp">이전</button><button data-action="play" aria-keyshortcuts="K">일시 정지</button><button data-action="next" class="teacher-next" aria-keyshortcuts="ArrowRight PageDown Space">다음</button></div><button data-action="tools">도구</button><span class="teacher-play-state"></span>';
  const dialog = document.createElement('dialog'); dialog.className = 'presenter-dialog';
  dialog.innerHTML = '<header><h2></h2><button data-close>닫기 · Esc</button></header><div data-content></div>';
  container.append(dialog);
  const content = dialog.querySelector<HTMLElement>('[data-content]')!, title = dialog.querySelector('h2')!;
  const position = container.querySelector<HTMLButtonElement>('.teacher-position')!;
  const previous = container.querySelector<HTMLButtonElement>('[data-action="previous"]')!;
  const play = container.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const next = container.querySelector<HTMLButtonElement>('[data-action="next"]')!;
  const playState = container.querySelector<HTMLElement>('.teacher-play-state')!;
  let opener: HTMLElement | undefined, panel = '', latest: PresenterState;
  function close() { dialog.close(); panel = ''; opener?.focus({ preventScroll: true }); }
  dialog.querySelector('[data-close]')!.addEventListener('click', close, { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  function button(text: string, action: () => void, parent = content) {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.addEventListener('click', action, { signal }); parent.append(node); return node;
  }
  function tool(text: string, action: PresenterAction) { return button(text, () => { close(); callbacks.action(action); }); }
  function open(kind: string, origin?: HTMLElement) {
    if (dialog.open) close();
    opener = origin ?? container.querySelector<HTMLElement>('[data-action="' + kind + '"]')!;
    panel = kind; content.replaceChildren();
    if (kind === 'overview') {
      title.textContent = '수업의 흐름';
      for (const [i, scene] of latest.lesson.scenes.entries()) {
        const section = document.createElement('section'); section.className = 'overview-scene';
        const heading = document.createElement('h3'); heading.textContent = (i + 1) + ' · ' + scene.title; section.append(heading);
        for (const cue of scene.cues) {
          const b = button(cue.label + (cue.experimentContextId !== latest.context ? ' · 조건 ' + cue.experimentContextId + ' 적용' : ''),
            () => { close(); callbacks.goTo(scene.id, cue.id); }, section);
          b.setAttribute('aria-current', String(cue.id === latest.cueId));
        }
        content.append(section);
      }
    } else if (kind === 'notes') {
      title.textContent = '투사 화면에 열린 교사 메모';
      const text = document.createElement('p'); text.textContent = latest.notes || '이 단계에 작성된 메모가 없습니다.'; content.append(text);
    } else {
      title.textContent = latest.rehearsing ? '부분 리허설 도구' : '수업 도구';
      content.className = 'presenter-tools-content';
      const quick = document.createElement('div'); quick.className = 'presenter-tool-grid'; content.append(quick);
      for (const [label, action] of [
        ['전체 화면 · F', 'fullscreen'], [latest.blackOut ? '가림 해제 · B' : '화면 가리기 · B', 'blackout'],
        [latest.laser ? '포인터 끄기' : '레이저 포인터', 'laser'], [latest.reducedMotion ? '동작 줄임 켜짐' : '동작 줄이기', 'reduced'],
        ['연출 다시 보기', 'replay'], ['예제 다시 시작', 'restartExample'],
        [latest.exploring ? '현재 조건으로 수업 복귀' : '잠시 자유 조작', latest.exploring ? 'return' : 'explore'],
        ['수업 조건 ' + latest.context + ' 복원', latest.exploring ? 'restoreReturn' : 'restore'],
        ['변화 과정 생략', 'settle'], ['수업 처음부터', 'restart'],
        ['수업 준비 · 저장', 'editor'], ['일반 탐색 화면', 'exit'],
      ] as [string, PresenterAction][]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.addEventListener('click', () => { close(); callbacks.action(action); }, { signal }); quick.append(b);
      }
      if (latest.exploring) tool('공간 / 펼친 경로 전환', 'freeLayout');
      if (latest.rehearsing) tool('리허설 끝내기 · 편집 카드로', 'rehearsalEnd');
      if (latest.canResume) tool('저장한 조건에서 새 실험 시작', 'resume');
      button('투사 화면에 교사 메모 열기', () => open('notes', opener));
      const warning = document.createElement('p'); warning.className = 'presenter-tool-note';
      warning.textContent = 'P·파장·간격은 현재 단계의 허용 조작을 따릅니다. 조건 변경은 재생하면서 퍼집니다.'; content.append(warning);
      const parameters = document.createElement('fieldset'); parameters.className = 'presenter-parameters'; content.append(parameters);
      const legend = document.createElement('legend'); legend.textContent = '실험 조건'; parameters.append(legend);
      function range(label: string, name: InputId | 'x' | 'y', min: number, max: number, step: number, value: number) {
        const row = document.createElement('label'), text = document.createElement('span'), output = document.createElement('output'), input = document.createElement('input');
        text.textContent = label; input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
        input.setAttribute('aria-label', label); output.textContent = value.toFixed(1) + ' cm'; row.append(text, output, input); parameters.append(row);
        input.disabled = latest.transitioning || !latest.allowed.includes(name === 'x' || name === 'y' ? 'probe' : name);
        input.addEventListener('input', () => {
          const value = Number(input.value) / 100; output.textContent = Number(input.value).toFixed(1) + ' cm';
          if (name === 'x' || name === 'y') callbacks.input('probe', { ...latest.preset.probe, [name]: value }); else callbacks.input(name, value);
        }, { signal });
      }
      range('P 가로 위치', 'x', 0, 120, .5, latest.preset.probe.x * 100);
      range('P 세로 위치', 'y', 0, 72, .5, latest.preset.probe.y * 100);
      range('파장 λ', 'wavelength', 6, 30, .5, latest.preset.wavelength * 100);
      range('파원 간격', 'separation', 6, 54, .5, latest.preset.separation * 100);
      function select(label: string, values: [string, string][], value: string, update: (value: string) => void) {
        const row = document.createElement('label'), name = document.createElement('span'), input = document.createElement('select');
        name.textContent = label; row.append(name, input); content.append(row);
        values.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option); });
        input.value = value; input.addEventListener('change', () => update(input.value), { signal });
      }
      select('파동 재생 배속', [['.25','0.25×'],['.5','0.5×'],['1','1×'],['2','2×']], String(latest.rate), value => callbacks.rate(Number(value)));
      select('화면 연출 속도', [['slow','느리게'],['normal','보통'],['fast','빠르게']], latest.speed, value => callbacks.speed(value as MotionSpeed));
      const reveals = document.createElement('fieldset'); reveals.className = 'presenter-reveals'; content.append(reveals);
      const revealLegend = document.createElement('legend'); revealLegend.textContent = '이 단계에서만 적용 · 예측 가림 유지'; reveals.append(revealLegend);
      for (const [id, name] of [['distance-values','수치'],['wavelength-ruler','파장 눈금'],['component-1','성분 1'],['component-2','성분 2'],['resultant','합']] as [SemanticId,string][]) {
        const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox';
        input.checked = latest.visible.has(id); input.disabled = !latest.overrideable.includes(id); label.append(input, document.createTextNode(name)); reveals.append(label);
        input.dataset.reveal = id;
        input.addEventListener('change', () => { callbacks.override(id, input.checked); input.checked = latest.visible.has(id); }, { signal });
      }
    }
    dialog.showModal();
  }
  container.addEventListener('click', event => {
    const node = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!node) return; const action = node.dataset.action!;
    if (action === 'overview' || action === 'tools') open(action, node); else callbacks.action(action as PresenterAction);
  }, { signal });
  return {
    openOverview: () => open('overview'),
    close, get dialogOpen() { return dialog.open; },
    render(state: PresenterState) {
      latest = state;
      dialog.querySelectorAll<HTMLInputElement>('[data-reveal]').forEach(input => { input.checked = state.visible.has(input.dataset.reveal as SemanticId); });
      position.textContent = state.blackOut ? '화면 가림' : state.sceneLabel;
      previous.textContent = state.previousLabel; previous.disabled = !state.canPrevious;
      next.textContent = state.transitioning ? '전환 건너뛰기' : state.nextLabel;
      next.disabled = (!state.canNext && !state.transitioning) || !!state.waiting;
      play.textContent = state.playing ? 'Ⅱ 정지' : '▶ 재생'; play.setAttribute('aria-label', state.playing ? '파동 일시 정지 (K)' : '파동 재생 (K)');
      play.setAttribute('aria-pressed', String(state.playing));
      playState.textContent = state.playing ? '파동 재생 중' : '파동 정지 중';
      container.dataset.panel = panel;
    },
    destroy() { abort.abort(); if (dialog.open) dialog.close(); container.replaceChildren(); },
  };
}
export interface PresenterState {
  lesson: LessonSpec; sceneLabel: string; cueId: string; context: string; previousLabel: string; nextLabel: string;
  playing: boolean; canPrevious: boolean; canNext: boolean; transitioning: boolean; reducedMotion: boolean;
  waiting?: string; blackOut: boolean; laser: boolean; exploring: boolean; rehearsing: boolean; canResume: boolean;
  notes?: string; preset: ExperimentPreset; allowed: readonly InputId[]; rate: number; speed: MotionSpeed;
  visible: ReadonlySet<SemanticId>; overrideable: readonly SemanticId[];
}
