import type { Vec2 } from '../model/types';

/** A stationary phase field supplied by the engine adapter, not a source-distance formula. */
export type ProbeGuide = Readonly<{
  key: string;
  phaseAt(point: Vec2): number | null;
  contains(point: Vec2): boolean;
}>;
const CAPTURE_PX = 4, HOLD_PX = 6, RELEASE_SPAN_PX = 3, REARM_PX = 12;
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Briefly catches a crossed multiple of π. Never attracts an approaching pointer.
 * No timer, pointer-up correction, or persistent restriction on the chosen position. */
export function createProbeDetent() {
  let previous: Vec2 | undefined, key = '', held: number | undefined, blocked: number | undefined;
  function reset() { previous = undefined; key = ''; held = blocked = undefined; }
  function project(point: Vec2, target: number, guide: ProbeGuide, scale: number): Vec2 | undefined {
    let p = point;
    const h = .1 / scale;
    for (let i = 0; i < 8; i++) {
      const phase = guide.phaseAt(p);
      if (phase === null || !Number.isFinite(phase)) return;
      const error = phase - target;
      if (Math.abs(error) < 1e-12) return guide.contains(p) ? p : undefined;
      const samples = [guide.phaseAt({ x: p.x + h, y: p.y }), guide.phaseAt({ x: p.x - h, y: p.y }),
        guide.phaseAt({ x: p.x, y: p.y + h }), guide.phaseAt({ x: p.x, y: p.y - h })];
      if (samples.some(v => v === null || !Number.isFinite(v))) return;
      const [right, left, bottom, top] = samples as number[];
      const gx = (right - left) / (2 * h), gy = (bottom - top) / (2 * h), norm = gx * gx + gy * gy;
      if (norm < 1e-12) return; // Degenerate or flat field has no isolated line to catch.
      p = { x: p.x - error * gx / norm, y: p.y - error * gy / norm };
      if (distance(point, p) * scale > REARM_PX * 2) return;
    }
  }
  return {
    reset,
    move(point: Vec2, guide: ProbeGuide | undefined, scale: number): Vec2 {
      if (!guide || !guide.contains(point) || !(scale > 0)) { reset(); return point; }
      const nextKey = `${guide.key}:${scale}`;
      if (!previous || key !== nextKey) {
        reset(); key = nextKey; previous = point; return point;
      }
      const from = previous;
      previous = point;
      if (held !== undefined) {
        const projected = project(point, held, guide, scale);
        if (projected) {
          const pixels = distance(point, projected) * scale;
          if (pixels <= HOLD_PX) return projected;
          if (pixels < HOLD_PX + RELEASE_SPAN_PX) {
            // Continuous position and slope at both ends; driven only by input,
            // so releasing the pointer leaves P exactly where it is displayed.
            const t = (pixels - HOLD_PX) / RELEASE_SPAN_PX;
            const blend = t * t * (3 - 2 * t);
            return { x: projected.x + (point.x - projected.x) * blend,
              y: projected.y + (point.y - projected.y) * blend };
          }
        }
        blocked = held; held = undefined;
        return point; // Release directly to the pointer, with no offset left behind.
      }
      if (blocked !== undefined) {
        const projected = project(point, blocked, guide, scale);
        if (!projected || distance(point, projected) * scale > REARM_PX) blocked = undefined;
      }
      const a = guide.phaseAt(from), b = guide.phaseAt(point);
      if (a === null || b === null || !Number.isFinite(a + b) || a === b) return point;
      // Starting on a line is free; only an actual subsequent crossing can catch.
      if (Math.abs(a / Math.PI - Math.round(a / Math.PI)) < 1e-10) return point;
      const target = (b > a ? Math.floor(a / Math.PI) + 1 : Math.ceil(a / Math.PI) - 1) * Math.PI;
      if (target === blocked || (b - target) * (a - target) > 0 || Math.abs(b - a) > Math.PI) return point;
      const projected = project(point, target, guide, scale);
      if (!projected || distance(point, projected) * scale > CAPTURE_PX) return point;
      held = target;
      return projected;
    },
  };
}
