import type { Vec2 } from '../model/types';

/** Shared source actuator, reusable by a future lattice backend. */
export const SOURCE_SPEED_RATIO = 0.7;
export const MOTION_STEP = 1 / 60;
export type Motion = { position: Vec2; velocity: Vec2; target: Vec2 };
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export function moveSource(state: Motion, dt: number, waveSpeed: number): Motion {
  const dx = state.target.x - state.position.x, dy = state.target.y - state.position.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining === 0) return { ...state, velocity: { x: 0, y: 0 } };
  const maximum = waveSpeed * SOURCE_SPEED_RATIO;
  const desiredSpeed = Math.min(maximum, remaining * 8);
  const blend = 1 - Math.exp(-dt / 0.09);
  const velocity = {
    x: state.velocity.x + (dx / remaining * desiredSpeed - state.velocity.x) * blend,
    y: state.velocity.y + (dy / remaining * desiredSpeed - state.velocity.y) * blend,
  };
  // The app moves sources along the same vertical track. Stop before crossing the target.
  const travel = Math.hypot(velocity.x, velocity.y) * dt;
  if ((velocity.x * dx + velocity.y * dy > 0 && travel >= remaining) ||
      (remaining < 1e-6 && remaining <= maximum * dt)) {
    return { position: state.target, target: state.target, velocity: { x: 0, y: 0 } };
  }
  return { ...state, velocity, position: {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
  } };
}
