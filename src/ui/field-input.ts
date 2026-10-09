import type { FieldTransform, ModelState, SourceId, Vec2 } from '../model/types';
import { toScreen, toWorld } from '../geometry/layout';

type Target = 'probe' | SourceId;
export function bindFieldInput(svg: SVGSVGElement, options: {
  getTransform(): FieldTransform;
  getModel(): ModelState;
  moveProbe(point: Vec2): void;
  setSeparation(value: number): void;
  getTargetSeparation(): number;
  previewSeparation(value: number | null): void;
  announce(): void;
}) {
  let active: { target: Target; pointerId: number; preview: number | null } | null = null;
  const abort = new AbortController();
  const signal = abort.signal;
  const sourceSign = (target: Target) => target === 'source-1' ? -1 : 1;
  function move(event: PointerEvent, target: Target) {
    const rect = svg.getBoundingClientRect();
    const point = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.getTransform());
    if (target === 'probe') options.moveProbe(point);
    else {
      const value = 2 * sourceSign(target) * (point.y - options.getModel().bounds.height / 2);
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
    let target: Target = 'probe', nearest = 24;
    for (const candidate of candidates) {
      const center = toScreen(candidate.position, transform);
      const distance = Math.hypot(screenPoint.x - center.x, screenPoint.y - center.y);
      if (distance < nearest) { nearest = distance; target = candidate.id; }
    }
    const element = svg.querySelector<SVGElement>(`[data-handle="${target}"]`);
    active = { target, pointerId: event.pointerId, preview: null };
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
    options.previewSeparation(null);
    if (commit && preview !== null) options.setSeparation(preview);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    options.announce();
  }
  svg.addEventListener('pointerup', event => finish(event, true), { signal });
  svg.addEventListener('pointercancel', event => finish(event, false), { signal });
  svg.addEventListener('lostpointercapture', () => { active = null; options.previewSeparation(null); }, { signal });
  function cancel() {
    const id = active?.pointerId;
    active = null; options.previewSeparation(null);
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
    else if (delta.y !== 0) options.setSeparation(options.getTargetSeparation() + 2 * sourceSign(target) * delta.y);
    options.announce();
    event.preventDefault();
  }, { signal });
  return { cancel, destroy: () => abort.abort() };
}
