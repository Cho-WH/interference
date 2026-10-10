import type { FieldTransform, ModelState, SourceId, Vec2 } from '../model/types';
import { toScreen } from './layout';

export type FieldHandleId = 'probe' | SourceId | 'source-gap';
export const FIELD_HANDLE_HIT_RADIUS = 24;

/** The view and hit test must agree on when and where the gap handle exists. CSS pixels. */
export function sourceGapHandle(model: ModelState, transform: FieldTransform): Vec2 | undefined {
  if ((model.sources[1].position.y - model.sources[0].position.y) * transform.scale >= 32) return undefined;
  const center = toScreen({ x: model.sources[0].position.x, y: model.bounds.height / 2 }, transform);
  return { x: center.x - 40, y: center.y };
}

/** Select overlapping hit areas by nearest visible center; empty field selects P. */
export function hitTestFieldHandle(point: Vec2, model: ModelState, transform: FieldTransform): FieldHandleId {
  const candidates: { id: FieldHandleId; center: Vec2 }[] = [
    { id: 'probe', center: toScreen(model.probe, transform) },
    ...model.sources.map(source => ({ id: source.id, center: toScreen(source.position, transform) })),
  ];
  const gap = sourceGapHandle(model, transform);
  if (gap) candidates.push({ id: 'source-gap', center: gap });
  let target: FieldHandleId = 'probe', nearest = FIELD_HANDLE_HIT_RADIUS;
  for (const candidate of candidates) {
    const distance = Math.hypot(point.x - candidate.center.x, point.y - candidate.center.y);
    if (distance < nearest) { nearest = distance; target = candidate.id; }
  }
  return target;
}
