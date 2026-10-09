import type { FieldMode } from '../model/types';
import { placeFloatingPanel } from './floating-panel';
import { FIELD_PALETTES, paletteGradient, type PaletteId } from '../visual/field-palettes';

export function createPalettePicker(root: HTMLElement, onChange: (id: PaletteId) => void) {
  const trigger = root.querySelector<HTMLButtonElement>('#field-legend')!;
  const panel = root.querySelector<HTMLElement>('#palette-options')!;
  const label = trigger.querySelector<HTMLElement>('[data-legend-label]')!;
  const swatch = trigger.querySelector<HTMLElement>('[data-palette-swatch]')!;
  let selected: PaletteId = 'contrast', mode: FieldMode = 'wave';
  let steady = true;
  const abort = new AbortController(), signal = abort.signal;
  panel.innerHTML = `<p class="palette-title">파동 색상</p>${FIELD_PALETTES.map(p => `
    <button type="button" class="palette-option" data-palette="${p.id}" aria-pressed="false">
      <span class="palette-swatch" aria-hidden="true"></span>
      <span><strong>${p.name}</strong><small>${p.description}</small></span>
      <span class="palette-check" aria-hidden="true">✓</span>
    </button>`).join('')}`;
  const options = [...panel.querySelectorAll<HTMLButtonElement>('[data-palette]')];
  function refresh() {
    const description = mode === 'wave' ? '순간 변위 −, 0, +' : steady ? '합성 진폭 0 → 최대' : '도착 위상 무늬 약 → 강';
    label.innerHTML = (mode === 'wave' ? ['−', '0', '+'] : ['0', '', '최대']).map(text => `<span>${text}</span>`).join('');
    trigger.dataset.mode = mode;
    trigger.setAttribute('aria-label', `파동 색상 선택: ${FIELD_PALETTES.find(p => p.id === selected)!.name}. ${description}`);
    swatch.style.background = paletteGradient(selected, mode);
    for (const button of options) {
      const id = button.dataset.palette as PaletteId;
      button.setAttribute('aria-pressed', String(id === selected));
      button.querySelector<HTMLElement>('.palette-swatch')!.style.background = paletteGradient(id, mode);
    }
  }
  function close(restoreFocus = false) {
    panel.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    placeFloatingPanel(panel, trigger);
    options.find(button => button.dataset.palette === selected)!.focus({ preventScroll: true });
  }, { signal });
  for (const button of options) button.addEventListener('click', () => {
    selected = button.dataset.palette as PaletteId;
    refresh(); onChange(selected); close(true);
  }, { signal });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
    if (!panel.contains(event.target as Node)) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % options.length
      : event.key === 'ArrowUp' ? (index + options.length - 1) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); options[next].focus(); }
  }, { signal });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target as Node)) close(); }, { signal });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget as Node | null)) close(); }, { signal });
  const reposition = () => { if (!panel.hidden) placeFloatingPanel(panel, trigger); };
  window.addEventListener('resize', reposition, { signal });
  window.addEventListener('scroll', reposition, { signal, capture: true });
  refresh();
  return {
    update(next: FieldMode, nextSteady = true) { if (next !== mode || nextSteady !== steady) { mode = next; steady = nextSteady; refresh(); } },
    destroy() { abort.abort(); },
  };
}
