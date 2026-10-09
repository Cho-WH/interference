import type { FieldTransform, ModelState, SourceId, Vec2 } from '../model/types';
import { toWorld } from '../geometry/layout';

type Target = 'probe' | SourceId;
export function bindFieldInput(svg: SVGSVGElement, options: {
  getTransform(): FieldTransform;
  getModel(): ModelState;
  moveProbe(point: Vec2): void;
  setSeparation(value: number): void;
  announce(): void;
}) {
  let active: { target: Target; pointerId: number } | null = null;
  const abort = new AbortController();
  const signal = abort.signal;
  const sourceSign = (target: Target) => target === 'source-1' ? -1 : 1;
  function move(event: PointerEvent, target: Target) {
    const rect = svg.getBoundingClientRect();
    const point = toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.getTransform());
    if (target === 'probe') options.moveProbe(point);
    else options.setSeparation(2 * sourceSign(target) * (point.y - options.getModel().bounds.height / 2));
  }
  svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const element = (event.target as Element).closest<SVGElement>('[data-handle]');
    const target = (element?.dataset.handle ?? 'probe') as Target;
    active = { target, pointerId: event.pointerId };
    svg.setPointerCapture(event.pointerId);
    (element ?? svg.querySelector<SVGElement>('[data-handle="probe"]'))?.focus({ preventScroll: true });
    move(event, target);
    event.preventDefault();
  }, { signal });
  svg.addEventListener('pointermove', (event) => {
    if (active?.pointerId === event.pointerId) move(event, active.target);
  }, { signal });
  function finish(event: PointerEvent) {
    if (active?.pointerId !== event.pointerId) return;
    active = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    options.announce();
  }
  svg.addEventListener('pointerup', finish, { signal });
  svg.addEventListener('pointercancel', finish, { signal });
  svg.addEventListener('lostpointercapture', () => { active = null; }, { signal });
  svg.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const target = (event.target as SVGElement).dataset.handle as Target | undefined;
    if (!target) return;
    const step = event.shiftKey ? .02 : .005;
    const delta = { x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 };
    const model = options.getModel();
    if (target === 'probe') options.moveProbe({ x: model.probe.x + delta.x, y: model.probe.y + delta.y });
    else options.setSeparation(model.sources[1].position.y - model.sources[0].position.y + 2 * sourceSign(target) * delta.y);
    options.announce();
    event.preventDefault();
  }, { signal });
  return () => abort.abort();
}
