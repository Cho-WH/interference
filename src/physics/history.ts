import type { SourcePair, Vec2 } from '../model/types';
import { distance } from './source-motion';

export type PositionEvent = Readonly<{ time: number; positions: SourcePair<Vec2> }>;
export type PhaseEvent = Readonly<{ time: number; phase: number; frequency: number }>;
export type Arrival = Readonly<{ time: number; origin: Vec2; distance: number }>;

export function phaseAt(events: readonly PhaseEvent[], time: number): number {
  let low = 0, high = events.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].time <= time) low = middle; else high = middle;
  }
  const event = events[low];
  return event.phase + 2 * Math.PI * event.frequency * (time - event.time);
}

/** Monotonic arrival times follow from |source velocity| < wave speed. */
export function retardedArrival(
  events: readonly PositionEvent[], index: number, point: Vec2, now: number, speed: number,
): Arrival {
  const arrivalAt = (event: PositionEvent) => event.time + distance(point, event.positions[index]) / speed;
  const first = events[0], last = events[events.length - 1];
  if (now <= arrivalAt(first) || now >= arrivalAt(last)) {
    const origin = now <= arrivalAt(first) ? first.positions[index] : last.positions[index];
    const length = distance(point, origin);
    return { time: now - length / speed, origin, distance: length };
  }
  let low = 0, high = events.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (arrivalAt(events[middle]) <= now) low = middle; else high = middle;
  }
  const a = events[low], b = events[high], start = a.positions[index];
  const duration = b.time - a.time;
  const ux = (b.positions[index].x - start.x) / duration;
  const uy = (b.positions[index].y - start.y) / duration;
  // Extend this segment to now, then solve for the positive travel time h.
  const qx = point.x - start.x - ux * (now - a.time);
  const qy = point.y - start.y - uy * (now - a.time);
  const dot = qx * ux + qy * uy, squared = qx * qx + qy * qy;
  const denominator = speed * speed - ux * ux - uy * uy;
  const root = Math.sqrt(dot * dot + denominator * squared);
  const travel = dot >= 0 ? (dot + root) / denominator : squared / (root - dot);
  const emitted = Math.max(a.time, Math.min(b.time, now - travel));
  const origin = { x: start.x + ux * (emitted - a.time), y: start.y + uy * (emitted - a.time) };
  return { time: emitted, origin, distance: distance(point, origin) };
}

/** Retain the anchor immediately before the oldest possible emission time. */
export function pruneHistory<T extends { time: number }>(events: T[], cutoff: number): void {
  let keep = 0;
  while (keep + 1 < events.length && events[keep + 1].time < cutoff) keep++;
  if (keep > 0) events.splice(0, keep);
}
