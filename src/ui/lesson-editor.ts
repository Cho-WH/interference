import { createLessonDraft } from '../lesson/editor-model';
import { DEFAULT_LESSON } from '../lesson/default-lesson';
import { flattenLesson, LAYOUT_IDS, type CueSpec, type ExperimentPreset, type LessonSpec, type SemanticId } from '../lesson/types';
import { PROTECTED_STOPS } from '../lesson/validation';
import { exportLesson, loadLesson, parseLesson, saveLesson } from '../lesson/storage';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
export function createLessonEditor(host: HTMLElement, initial: LessonSpec, options: {
  preview(lesson: LessonSpec, cue: CueSpec): void;
  rehearse(lesson: LessonSpec, cueId: string): void;
  start(lesson: LessonSpec): void; close(): void; currentPreset(): ExperimentPreset;
}) {
  const abort = new AbortController(), signal = abort.signal;
  let viewAbort = new AbortController(), renderFrame = 0;
  const draft = createLessonDraft(initial);
  let selected = flattenLesson(initial)[0].cue.id, before = false, previewKey = '';
  host.className = 'lesson-editor';
  host.innerHTML = '<header><div><span>수업 준비</span><h1>기다릴 순간을 설계하세요</h1></div><div data-file-tools></div></header><div class="editor-workspace"><aside class="editor-scenes" aria-label="장면과 정지 지점"></aside><section class="editor-center"><div class="editor-preview-tools"></div><div class="editor-preview" aria-label="정상 상태 예제 미리보기"></div><p class="editor-preview-caption">정상 상태 예제로 미리보기 · 실행 중 수업에는 자동 반영되지 않습니다.</p><div class="editor-preview-actions"></div></section><aside class="editor-settings" aria-label="단계 설정"></aside></div><footer><div class="editor-errors" role="status"></div><div class="editor-bottom-tools"></div></footer>';
  const get = (q: string) => host.querySelector<HTMLElement>(q)!;
  const previewHost = get('.editor-preview'), list = get('.editor-scenes'), settings = get('.editor-settings'), errors = get('.editor-errors');
  const notice = element('p'); notice.className = 'editor-notice'; get('footer').prepend(notice);
  function actionButton(parent: HTMLElement, text: string, action: () => void, primary = false, listenerSignal = signal) {
    const node = element('button', text); node.type = 'button'; if (primary) node.className = 'editor-primary';
    node.addEventListener('click', () => { if (renderFrame) render(); action(); }, { signal: listenerSignal }); parent.append(node); return node;
  }
  const button = actionButton;
  function attempt(action: () => void) {
    try { action(); } catch (error) { notice.textContent = error instanceof Error ? error.message : String(error); }
  }
  const fileTools = get('[data-file-tools]');
  const undo = button(fileTools, '되돌리기', () => { draft.undo(); render(); });
  const redo = button(fileTools, '다시 실행', () => { draft.redo(); render(); });
  button(fileTools, '기본 구성', () => { draft.replace(DEFAULT_LESSON); selected = flattenLesson(draft.value)[0].cue.id; render(); });
  button(fileTools, '브라우저에서 열기', () => attempt(() => { const stored = loadLesson(); if (stored) { draft.replace(stored); render(); } else notice.textContent = '저장한 수업이 없습니다.'; }));
  const file = element('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; fileTools.append(file);
  button(fileTools, 'JSON 가져오기', () => file.click());
  file.addEventListener('change', async () => {
    const selectedFile = file.files?.[0]; if (!selectedFile) return;
    try {
      if (selectedFile.size > 500_000) throw new Error('수업 파일은 500KB 이내여야 합니다.');
      const imported = parseLesson(await selectedFile.text());
      draft.replace(imported); selected = flattenLesson(imported)[0].cue.id; notice.textContent = '수업을 가져왔습니다.'; render();
    } catch (error) { notice.textContent = '기존 수업은 유지됩니다. ' + (error instanceof Error ? error.message : String(error)); }
    file.value = '';
  }, { signal });
  const previewTools = get('.editor-preview-tools');
  const beforeButton = button(previewTools, '직전 상태', () => { before = true; previewKey = ''; render(); });
  const currentButton = button(previewTools, '현재 상태', () => { before = false; previewKey = ''; render(); });
  const aspect = element('select'); aspect.setAttribute('aria-label', '미리보기 화면 비율');
  [['auto', '가용 공간'], ['16/9', '16:9'], ['4/3', '4:3'], ['32/15', '1280×600']].forEach(([value, text]) => { const option = element('option', text); option.value = value; aspect.append(option); });
  previewTools.append(aspect);
  aspect.addEventListener('change', () => { previewHost.style.aspectRatio = aspect.value; previewHost.dataset.aspect = aspect.value; }, { signal });
  const previewActions = get('.editor-preview-actions');
  const rehearse = button(previewActions, '이 단계부터 리허설', () => { if (draft.valid) options.rehearse(draft.value, selected); }, true);
  button(previewActions, '현재 조건을 예제로 저장', () => {
    const cue = flattenLesson(draft.value).find(p => p.cue.id === selected)!.cue, preset = options.currentPreset();
    draft.change(copy => {
      const experiments = { ...copy.experiments, [cue.experimentContextId]: preset };
      if (cue.experimentContextId === 'A' && experiments.C) experiments.C = { ...preset, wavelength: preset.wavelength / 2 };
      copy.experiments = experiments;
    }); notice.textContent = '선택한 예제에 현재 입력 조건을 저장했습니다.'; render();
  });
  const bottom = get('.editor-bottom-tools');
  const save = button(bottom, '브라우저에 저장', () => attempt(() => { saveLesson(draft.value); notice.textContent = '이 브라우저에 저장했습니다.'; }));
  const download = button(bottom, 'JSON 내보내기', () => attempt(() => exportLesson(draft.value)));
  const start = button(bottom, '이 구성으로 시작', () => { if (draft.valid) { attempt(() => saveLesson(draft.value)); options.start(draft.value); } }, true);
  button(bottom, '편집 종료 · 이전 조건에서 새 실험', options.close);
  function field(parent: HTMLElement, label: string, value: string, change: (value: string) => void, multiline = false) {
    const wrapper = element('label'), name = element('span', label), input = multiline ? element('textarea') : element('input');
    input.value = value; wrapper.append(name, input); parent.append(wrapper);
    let committed = value;
    const commit = () => {
      if (input.value === committed) return; committed = input.value; change(input.value);
      // Let the click that caused blur reach its original card before rebuilding it.
      if (!renderFrame) renderFrame = requestAnimationFrame(render);
    };
    input.addEventListener('change', commit, { signal: viewAbort.signal });
    input.addEventListener('blur', commit, { signal: viewAbort.signal });
    return input;
  }
  function checkbox(parent: HTMLElement, label: string, checked: boolean, change: (checked: boolean) => void) {
    const wrapper = element('label'), input = element('input'); input.type = 'checkbox'; input.checked = checked;
    wrapper.className = 'editor-check'; wrapper.append(input, document.createTextNode(label)); parent.append(wrapper);
    input.addEventListener('change', () => { change(input.checked); render(); }, { signal: viewAbort.signal });
  }
  function render() {
    cancelAnimationFrame(renderFrame); renderFrame = 0;
    viewAbort.abort(); viewAbort = new AbortController();
    const viewSignal = viewAbort.signal;
    const button = (parent: HTMLElement, text: string, action: () => void, primary = false) => actionButton(parent, text, action, primary, viewSignal);
    const lesson = draft.value, positions = flattenLesson(lesson);
    let pos = positions.find(p => p.cue.id === selected);
    if (!pos) { pos = positions[0]; selected = pos.cue.id; }
    const cue = pos.cue;
    list.replaceChildren();
    for (const [i, scene] of lesson.scenes.entries()) {
      const section = element('section'), title = element('h2', (i + 1) + ' · ' + scene.title); section.append(title);
      for (const item of scene.cues) {
        const card = button(section, '', () => { selected = item.id; before = false; render(); });
        card.className = 'editor-cue'; card.dataset.cueId = item.id; card.setAttribute('aria-current', String(item.id === selected));
        card.append(element('strong', item.label), element('small', '조건 ' + item.experimentContextId + ' · 여기서 기다림'));
        if (PROTECTED_STOPS[item.id]) card.append(element('small', PROTECTED_STOPS[item.id]));
        if (draft.errors.some(e => e.cueId === item.id)) card.append(element('small', '⚠ 수정이 필요합니다'));
      }
      list.append(section);
    }
    settings.replaceChildren();
    settings.append(element('h2', cue.label), element('p', '학생이 보는 정보와 다음 한 번의 동작을 정합니다.'));
    field(settings, '학생에게 보일 질문', cue.question ?? '', value => draft.patchCue(selected, { question: value }), true);
    checkbox(settings, '질문 투사', cue.showQuestion, value => draft.patchCue(selected, { showQuestion: value }));
    field(settings, '교사 메모 (투사 중 기본 숨김)', cue.teacherNotes ?? '', value => draft.patchCue(selected, { teacherNotes: value }), true);
    if (cue.nextAction) field(settings, '교사가 누르는 다음 동작', cue.nextAction.label, value => draft.patchCue(selected, { nextAction: { ...cue.nextAction!, label: value } }));
    const layoutLabel = element('label'), layout = element('select'); layoutLabel.append(element('span', '준비된 화면 구도'), layout); settings.append(layoutLabel);
    const names = ['전체 현상', '공간 경로', '제자리 펼침', '길이 비교', '도착점 비교'];
    LAYOUT_IDS.forEach((id, i) => { const node = element('option', names[i]); node.value = id; layout.append(node); }); layout.value = cue.layout;
    layout.addEventListener('change', () => { draft.patchCue(selected, { layout: layout.value as CueSpec['layout'] }); render(); }, { signal: viewSignal });
    const speed = element('select'); speed.setAttribute('aria-label', '연출 속도');
    [['slow', '느리게'], ['normal', '보통'], ['fast', '빠르게']].forEach(([id, label]) => { const node = element('option', label); node.value = id; speed.append(node); });
    speed.value = lesson.motionSpeed; settings.append(element('p', '연출 속도 · 파동 배속과 별개'), speed);
    speed.addEventListener('change', () => { draft.change(copy => { copy.motionSpeed = speed.value as LessonSpec['motionSpeed']; }); render(); }, { signal: viewSignal });
    settings.append(element('h3', '학생이 보는 정보'));
    const reveals: [SemanticId, string][] = [['distance-values', '거리 수치'], ['same-distance-correspondence', '같은 거리 대응'], ['path-difference', '추가 경로'], ['wavelength-ruler', '파장 눈금'], ['component-1', '성분 1'], ['component-2', '성분 2'], ['resultant', '합']];
    for (const [id, label] of reveals) checkbox(settings, label, cue.visible.includes(id), checked =>
      draft.patchCue(selected, { visible: checked ? [...new Set([...cue.visible, id])] : cue.visible.filter(v => v !== id) }));
    settings.append(element('small', '예측 가림과 정상 상태 검사는 이 선택보다 우선합니다.'));
    settings.append(element('h3', '허용할 조작'));
    for (const [id, label] of [['probe', 'P 이동'], ['wavelength', '파장'], ['separation', '파원 간격']] as const)
      checkbox(settings, label, cue.allowedInputs.includes(id), checked => draft.patchCue(selected, { allowedInputs: checked ? [...cue.allowedInputs, id] : cue.allowedInputs.filter(v => v !== id) }));
    settings.append(element('h3', '조건 ' + cue.experimentContextId + ' · SI 단위'));
    const preset = lesson.experiments[cue.experimentContextId];
    for (const [key, label, value] of [['x', 'P의 x (m)', preset.probe.x], ['y', 'P의 y (m)', preset.probe.y], ['wavelength', '파장 (m)', preset.wavelength], ['separation', '파원 간격 (m)', preset.separation]] as const) {
      const input = field(settings, label, String(value), value => draft.change(copy => {
        const p = copy.experiments[cue.experimentContextId];
        if (key === 'x' || key === 'y') p.probe[key] = Number(value); else p[key] = Number(value);
        if (cue.experimentContextId === 'A' && copy.experiments.C) {
          copy.experiments.C.probe = { ...p.probe }; copy.experiments.C.separation = p.separation; copy.experiments.C.wavelength = p.wavelength / 2;
        }
      }));
      (input as HTMLInputElement).type = 'number'; (input as HTMLInputElement).step = 'any';
    }
    const order = element('div'); order.className = 'editor-order'; settings.append(element('h3', '공개 카드와 정지 지점'), order);
    button(order, '앞으로', () => { draft.move(selected, -1); render(); });
    button(order, '뒤로', () => { draft.move(selected, 1); render(); });
    button(order, '앞 단계와 묶기', () => { draft.mergePrevious(selected); render(); });
    settings.append(element('small', PROTECTED_STOPS[selected] ?? '보조 공개를 조절할 수 있습니다. 보호된 정지와 대기 조건은 유지합니다.'));
    const sceneOrder = element('div'); settings.append(element('h3', '장면 순서'), sceneOrder);
    button(sceneOrder, '장면 앞으로', () => { draft.moveScene(pos!.scene.id, -1); render(); }).disabled = pos.sceneIndex === 0;
    button(sceneOrder, '장면 뒤로', () => { draft.moveScene(pos!.scene.id, 1); render(); }).disabled = pos.sceneIndex === lesson.scenes.length - 1;
    errors.replaceChildren();
    for (const error of draft.errors) {
      button(errors, error.message, () => { if (error.cueId) { selected = error.cueId; render(); host.querySelector('[data-cue-id="' + selected + '"]')?.scrollIntoView({ block: 'nearest' }); } });
    }
    undo.disabled = !draft.canUndo; redo.disabled = !draft.canRedo;
    [save, download, start, rehearse].forEach(button => button.disabled = !draft.valid);
    const index = positions.findIndex(p => p.cue.id === selected), preview = before ? positions[Math.max(0, index - 1)].cue : cue;
    beforeButton.disabled = index === 0; beforeButton.setAttribute('aria-pressed', String(before)); currentButton.setAttribute('aria-pressed', String(!before));
    const key = lesson.revision + ':' + preview.id;
    if (draft.valid && key !== previewKey) { previewKey = key; options.preview(lesson, preview); }
  }
  return {
    previewHost, render,
    select(cueId: string) { selected = cueId; previewKey = ''; render(); },
    get lesson() { return draft.value; },
    get cueId() { return selected; },
    destroy() { cancelAnimationFrame(renderFrame); viewAbort.abort(); abort.abort(); host.replaceChildren(); },
  };
}
