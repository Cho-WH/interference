import type { FieldTransform, ModelState, SourceId, Vec2 } from '../model/types';
import { toScreen, toWorld } from '../geometry/layout';
import { createProbeDetent, type ProbeGuide } from '../geometry/probe-detent';

type Target = 'probe' | SourceId | 'source-gap';
export function bindFieldInput(svg: SVGSVGElement, options: {
  getTransform(): FieldTransform;
  getModel(): ModelState;
  getProbeGuide(): ProbeGuide | undefined;
  moveProbe(point: Vec2): void;
  setSeparation(value: number): void;
  getTargetSeparation(): number;
  previewSeparation(value: number | null): void;
  announce(): void;
}) {
  let active: { target: Target; pointerId: number; preview: number | null; startY: number; separation: number } | null = null;
  const abort = new AbortController();
  const signal = abort.signal;
  const probeDetent = createProbeDetent();
  // Programmatic focus after a pointer press can inherit :focus-visible from
  // a previously focused control. Track the actual input method explicitly.
  svg.dataset.inputMode = 'keyboard';
  document.addEventListener('pointerdown', () => { svg.dataset.inputMode = 'pointer'; }, { capture: true, signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) svg.dataset.inputMode = 'keyboard';
  }, { capture: true, signal });
  const sourceSign = (target: Target) => target === 'source-1' ? -1 : 1;
  function move(event: PointerEvent, target: Target) {
    const rect = svg.getBoundingClientRect();
    const point = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.getTransform());
    if (target === 'probe') options.moveProbe(probeDetent.move(point, options.getProbeGuide(), options.getTransform().scale));
    else {
      const value = target === 'source-gap' && active ? active.separation + 2 * (active.startY - point.y)
        : 2 * sourceSign(target) * (point.y - options.getModel().bounds.height / 2);
      if (active) active.preview = value;
      options.previewSeparation(value);
    }
  }
  svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // Overlapping touch areas select their nearest visible center, independent of SVG paint order.
    const rect = svg.getBoundingClientRect();
    const screenPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const model = options.getModel(), transform = options.getTransform();
    const candidates = [{ id: 'probe' as Target, position: model.probe }, ...model.sources];
    if ((model.sources[1].position.y - model.sources[0].position.y) * transform.scale < 32) {
      candidates.push({ id: 'source-gap', position: { x: model.sources[0].position.x - 40 / transform.scale, y: model.bounds.height / 2 } });
    }
    let target: Target = 'probe', nearest = 24;
    for (const candidate of candidates) {
      const center = toScreen(candidate.position, transform);
      const distance = Math.hypot(screenPoint.x - center.x, screenPoint.y - center.y);
      if (distance < nearest) { nearest = distance; target = candidate.id; }
    }
    const element = svg.querySelector<SVGElement>(`[data-handle="${target}"]`);
    probeDetent.reset();
    active = { target, pointerId: event.pointerId, preview: null, startY: toWorld(screenPoint, transform).y, separation: options.getTargetSeparation() };
    svg.setPointerCapture(event.pointerId);
    (element ?? svg.querySelector<SVGElement>('[data-handle="probe"]'))?.focus({ preventScroll: true });
    if (target === 'probe') move(event, target);
    else options.previewSeparation(options.getTargetSeparation());
    event.preventDefault();
  }, { signal });
  svg.addEventListener('pointermove', (event) => {
    if (active?.pointerId === event.pointerId) move(event, active.target);
  }, { signal });
  function finish(event: PointerEvent, commit: boolean) {
    if (active?.pointerId !== event.pointerId) return;
    const preview = active.preview;
    active = null;
    probeDetent.reset();
    options.previewSeparation(null);
    if (commit && preview !== null) options.setSeparation(preview);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    options.announce();
  }
  svg.addEventListener('pointerup', event => finish(event, true), { signal });
  svg.addEventListener('pointercancel', event => finish(event, false), { signal });
  svg.addEventListener('lostpointercapture', () => { active = null; probeDetent.reset(); options.previewSeparation(null); }, { signal });
  function cancel() {
    const id = active?.pointerId;
    active = null; probeDetent.reset(); options.previewSeparation(null);
    if (id !== undefined && svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
  }
  svg.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) {
      cancel();
      event.preventDefault(); return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const target = (event.target as SVGElement).dataset.handle as Target | undefined;
    if (!target) return;
    const step = event.shiftKey ? .02 : .005;
    const delta = { x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 };
    const model = options.getModel();
    if (target === 'probe') options.moveProbe({ x: model.probe.x + delta.x, y: model.probe.y + delta.y });
    else if (delta.y !== 0) options.setSeparation(options.getTargetSeparation() + 2 * (target === 'source-gap' ? -1 : sourceSign(target)) * delta.y);
    options.announce();
    event.preventDefault();
  }, { signal });
  return { cancel, destroy: () => abort.abort() };
}
