import type { FieldBounds, FieldTransform, Vec2 } from '../model/types';
import { computeComparisonLayout, visibleFieldBounds } from './layout';

/** Screen-safe area intersected with the path-length disks of every source extreme.
 * Intermediate and historical source positions also fit, by convexity of distance.
 */
export type ProbeRegion = Readonly<{ bounds: FieldBounds; centers: readonly Vec2[]; radius: number }>;
export function createProbeRegion(transform: FieldTransform, comparisonWidth: number, sources: readonly Vec2[]): ProbeRegion {
  const view = visibleFieldBounds(transform), inset = 16 / transform.scale;
  const layout = computeComparisonLayout(comparisonWidth, 0, transform.scale, .01);
  return { bounds: { x: view.x + inset, y: view.y + inset, width: view.width - 2 * inset, height: view.height - 2 * inset },
    centers: sources, radius: (layout.pointX - layout.startX - 16) / transform.scale };
}
export function containsProbe(region: ProbeRegion, p: Vec2): boolean {
  const b = region.bounds, epsilon = 1e-9;
  return p.x >= b.x - epsilon && p.x <= b.x + b.width + epsilon && p.y >= b.y - epsilon && p.y <= b.y + b.height + epsilon
    && region.centers.every(c => Math.hypot(p.x - c.x, p.y - c.y) <= region.radius + epsilon);
}

/** Exact nearest feasible point: interior, edge projections, arc projections or intersections. */
export function constrainProbe(region: ProbeRegion, p: Vec2): Vec2 {
  if (containsProbe(region, p)) return p;
  const b = region.bounds, r = region.radius, candidates: Vec2[] = [];
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const add = (q: Vec2) => { if (containsProbe(region, q)) candidates.push(q); };
  for (const x of [b.x, b.x + b.width]) {
    add({ x, y: clamp(p.y, b.y, b.y + b.height) });
    for (const y of [b.y, b.y + b.height]) add({ x, y });
  }
  for (const y of [b.y, b.y + b.height]) add({ x: clamp(p.x, b.x, b.x + b.width), y });
  region.centers.forEach((c, i) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d > 0) add({ x: c.x + (p.x - c.x) * r / d, y: c.y + (p.y - c.y) * r / d });
    for (const x of [b.x, b.x + b.width]) {
      const square = r * r - (x - c.x) ** 2;
      if (square >= 0) for (const sign of [-1, 1]) add({ x, y: c.y + sign * Math.sqrt(square) });
    }
    for (const y of [b.y, b.y + b.height]) {
      const square = r * r - (y - c.y) ** 2;
      if (square >= 0) for (const sign of [-1, 1]) add({ x: c.x + sign * Math.sqrt(square), y });
    }
    for (const other of region.centers.slice(i + 1)) {
      const dx = other.x - c.x, dy = other.y - c.y, distance = Math.hypot(dx, dy);
      if (distance > 0 && distance <= 2 * r) {
        const h = Math.sqrt(Math.max(0, r * r - distance * distance / 4));
        for (const sign of [-1, 1]) add({ x: (c.x + other.x) / 2 - sign * dy * h / distance, y: (c.y + other.y) / 2 + sign * dx * h / distance });
      }
    }
  });
  if (!candidates.length) throw new RangeError('No room for a probe in this layout');
  return candidates.reduce((a, q) => Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? q : a);
}

/** Only the temporary visual outline is sampled; input limits use exact geometry. */
export function probeBoundary(region: ProbeRegion): readonly Vec2[] {
  const b = region.bounds;
  const center = constrainProbe(region, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const reach = 4 * Math.max(b.width, b.height, region.radius);
  return Array.from({ length: 120 }, (_, i) => {
    const angle = i * 2 * Math.PI / 120, dx = Math.cos(angle), dy = Math.sin(angle);
    let low = 0, high = reach;
    for (let step = 0; step < 35; step++) {
      const middle = (low + high) / 2;
      if (containsProbe(region, { x: center.x + dx * middle, y: center.y + dy * middle })) low = middle; else high = middle;
    }
    return { x: center.x + dx * low, y: center.y + dy * low };
  });
}
