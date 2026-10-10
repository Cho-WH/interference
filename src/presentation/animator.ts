import type { MotionSpeed, TransitionId } from '../lesson/types';
import { layoutEase, pathEase, motionDuration, speedFactor } from './recipes';
import type { SourcePair } from '../model/types';
import type { PathPlacement } from '../geometry/layout';
import type { TeacherPose } from './layout';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = layoutEase;
const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** Numeric animation only. It never advances a physical clock or runs a command. */
export function interpolateTeacherPose(from: TeacherPose, to: TeacherPose, p: number, scaleProgress = p): TeacherPose {
  const placements = from.placements.map((placement, index) => {
    const target = to.placements[index];
    return { origin: { x: mix(placement.origin.x, target.origin.x, p), y: mix(placement.origin.y, target.origin.y, p) },
      angle: mix(placement.angle, target.angle, p), distanceScale: mix(placement.distanceScale, target.distanceScale, scaleProgress),
      displacementScale: mix(placement.displacementScale, target.displacementScale, scaleProgress) };
  }) as unknown as SourcePair<PathPlacement>;
  const a = from.layout, b = to.layout;
  return { placements, magnification: mix(from.magnification, to.magnification, scaleProgress),
    observationProbe: { x: mix(from.observationProbe.x, to.observationProbe.x, p),
      y: mix(from.observationProbe.y, to.observationProbe.y, p) },
    camera: { ...to.camera, scale: mix(from.camera.scale, to.camera.scale, scaleProgress),
      offsetX: mix(from.camera.offsetX, to.camera.offsetX, p), offsetY: mix(from.camera.offsetY, to.camera.offsetY, p) },
    layout: { startX: mix(a.startX, b.startX, p), pointX: mix(a.pointX, b.pointX, p), sumX: mix(a.sumX, b.sumX, p),
      sumZeroY: mix(a.sumZeroY, b.sumZeroY, p), rowZeros: [mix(a.rowZeros[0], b.rowZeros[0], p), mix(a.rowZeros[1], b.rowZeros[1], p)],
      distanceScale: mix(a.distanceScale, b.distanceScale, scaleProgress), displacementScale: mix(a.displacementScale, b.displacementScale, scaleProgress),
      componentAmplitudePx: mix(a.componentAmplitudePx, b.componentAmplitudePx, scaleProgress), compact: b.compact },
    backgroundOpacity: mix(from.backgroundOpacity, to.backgroundOpacity, p), backgroundLift: mix(from.backgroundLift, to.backgroundLift, p),
    backgroundBlur: mix(from.backgroundBlur, to.backgroundBlur, p) };
}

export function createPresentationAnimator() {
  let current: TeacherPose | undefined, from: TeacherPose | undefined, target: TeacherPose | undefined;
  let startedAt = 0, duration = 0, transition: TransitionId = 'none', pausedAt: number | undefined;
  let active = false, speed = 1;
  function sample(now: number): TeacherPose | undefined {
    if (!target || !from || !active) return current;
    const elapsed = ((pausedAt ?? now) - startedAt) / speed;
    const p = clamp(elapsed / duration);
    let geometry = ease(p);
    if (transition === 'unfold-in-place') geometry = pathEase((elapsed - 180) / 1000);
    if (transition === 'fold-to-field') geometry = ease(p / .86);
    // Move each row as a rigid object while retaining the common wave scale.
    current = interpolateTeacherPose(from, target, geometry);
    if (transition === 'unfold-in-place') {
      const background = ease((elapsed - 260) / 820);
      current = { ...current, backgroundOpacity: mix(from.backgroundOpacity, target.backgroundOpacity, background),
        backgroundLift: mix(from.backgroundLift, target.backgroundLift, background), backgroundBlur: mix(from.backgroundBlur, target.backgroundBlur, background) };
    } else if (transition === 'fold-to-field') {
      // Restore the field only after the paths have returned to its exact camera.
      const background = ease((p - .86) / .14);
      current = { ...current, backgroundOpacity: mix(from.backgroundOpacity, target.backgroundOpacity, background),
        backgroundLift: mix(from.backgroundLift, target.backgroundLift, background), backgroundBlur: mix(from.backgroundBlur, target.backgroundBlur, background) };
    }
    if (p >= 1) { current = target; active = false; }
    return current;
  }
  return {
    setTarget(next: TeacherPose, kind: TransitionId, now: number, immediate = false, motionSpeed: MotionSpeed = 'normal') {
      sample(now); from = current ?? next; target = next; startedAt = now; transition = kind;
      duration = motionDuration[kind]; speed = speedFactor[motionSpeed];
      active = !immediate && duration > 0 && current !== undefined;
      if (!active) current = next;
    },
    sample,
    capture: () => current,
    cancel() { active = false; return current; },
    dispose() { active = false; current = from = target = undefined; },
    finish() { if (target) current = target; active = false; },
    active: () => active,
    suspend(now: number) { if (pausedAt === undefined) pausedAt = now; },
    resume(now: number) { if (pausedAt !== undefined) { startedAt += Math.max(0, now - pausedAt); pausedAt = undefined; } },
  };
}
