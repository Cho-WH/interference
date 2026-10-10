import type { MotionSpeed, TransitionId } from '../lesson/types';
export const speedFactor: Record<MotionSpeed, number> = { slow: 1.5, normal: 1, fast: .75 };
export const motionDuration: Record<TransitionId, number> = { none: 0, focus: 220, 'unfold-in-place': 1360,
  'fit-paths': 780, 'focus-endpoints': 780, 'fold-to-field': 1360, 'move-probe': 1200 };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Deterministic cubic-bezier timing; the app supplies presentation milliseconds. */
export function cubicBezier(x: number, x1: number, y1: number, x2: number, y2: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) { const t = (lo + hi) / 2; if (sample(t, x1, x2) < clamp(x)) lo = t; else hi = t; }
  return sample((lo + hi) / 2, y1, y2);
}
export const layoutEase = (p: number) => cubicBezier(p, .2, 0, .38, .9);
export const pathEase = (p: number) => cubicBezier(p, .4, .14, .3, 1);
