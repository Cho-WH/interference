import type { FieldMode } from '../model/types';
import { createFloatingPanel } from './floating-panel';
import { DEFAULT_PALETTE, FIELD_PALETTES, paletteGradient, type PaletteId } from '../visual/field-palettes';

export function createPalettePicker(root: HTMLElement, onChange: (id: PaletteId) => void) {
  const trigger = root.querySelector<HTMLButtonElement>('#field-legend')!;
  const panel = root.querySelector<HTMLElement>('#palette-options')!;
  const label = trigger.querySelector<HTMLElement>('[data-legend-label]')!;
  const swatch = trigger.querySelector<HTMLElement>('[data-palette-swatch]')!;
  let selected: PaletteId = DEFAULT_PALETTE, mode: FieldMode = 'wave';
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
  const disclosure = createFloatingPanel(root, trigger, panel, {
    onOpen() { options.find(button => button.dataset.palette === selected)!.focus({ preventScroll: true }); },
  });
  for (const button of options) button.addEventListener('click', () => {
    selected = button.dataset.palette as PaletteId;
    refresh(); onChange(selected); disclosure.close(true);
  }, { signal });
  root.addEventListener('keydown', event => {
    if (!panel.contains(event.target as Node)) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % options.length
      : event.key === 'ArrowUp' ? (index + options.length - 1) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); options[next].focus(); }
  }, { signal });
  refresh();
  return {
    update(next: FieldMode, nextSteady = true) { if (next !== mode || nextSteady !== steady) { mode = next; steady = nextSteady; refresh(); } },
    destroy() { abort.abort(); disclosure.destroy(); },
  };
}
