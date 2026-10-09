import type { ModelState } from '../model/types';
import type { PhaseEvent, PositionEvent } from './history';
import type { FieldProgram } from './field-program';

const TAU = Math.PI * 2;
const wrap = (phase: number) => ((phase % TAU) + TAU) % TAU;
const capacity = (length: number) => 2 ** Math.ceil(Math.log2(Math.max(1, length)));

// This is the GPU implementation of history.ts, kept with the physics backend.
const glsl = `
uniform sampler2D uTrajectory;
uniform sampler2D uSignal;
uniform vec2 uCounts;
uniform vec4 uSources;
uniform vec2 uAmplitudes;
uniform vec2 uInitialPhases;
uniform float uSpeed;
uniform float uStationary;
uniform float uSteady;
uniform float uPhase;
uniform float uWaveNumber;
vec3 sourceEvent(int index, int source) { return texelFetch(uTrajectory, ivec2(index, source), 0).xyz; }
float arrival(vec3 event, vec2 point) { return event.x + length(point - event.yz) / uSpeed; }
float emission(int source, vec2 point) {
  vec2 current = source == 0 ? uSources.xy : uSources.zw;
  if (uStationary > 0.5) return -length(point - current) / uSpeed;
  int lastIndex = int(uCounts.x) - 1;
  vec3 first = sourceEvent(0, source), last = sourceEvent(lastIndex, source);
  if (arrival(first, point) >= 0.0) return -length(point - first.yz) / uSpeed;
  if (arrival(last, point) <= 0.0) return -length(point - last.yz) / uSpeed;
  int low = 0, high = lastIndex;
  for (int i = 0; i < 16; i++) {
    if (low + 1 >= high) break;
    int middle = (low + high) / 2;
    if (arrival(sourceEvent(middle, source), point) <= 0.0) low = middle; else high = middle;
  }
  vec3 a = sourceEvent(low, source), b = sourceEvent(high, source);
  // Sub-microsecond events can coalesce after Float32 conversion. Keep the solve finite.
  vec2 velocity = (b.yz - a.yz) / max(b.x - a.x, 0.000001);
  velocity *= min(1.0, uSpeed * 0.999 / max(length(velocity), 0.000000001));
  vec2 q = point - a.yz + velocity * a.x;
  float projection = dot(q, velocity), squared = dot(q, q);
  float denominator = uSpeed * uSpeed - dot(velocity, velocity);
  float root = sqrt(max(0.0, projection * projection + denominator * squared));
  float travel = projection >= 0.0 ? (projection + root) / denominator : squared / (root - projection);
  return clamp(-travel, a.x, b.x);
}
float phaseAt(float emitted) {
  int low = 0, high = int(uCounts.y);
  for (int i = 0; i < 16; i++) {
    if (low + 1 >= high) break;
    int middle = (low + high) / 2;
    if (texelFetch(uSignal, ivec2(middle, 0), 0).x <= emitted) low = middle; else high = middle;
  }
  vec3 event = texelFetch(uSignal, ivec2(low, 0), 0).xyz;
  return event.y + event.z * (emitted - event.x);
}
float fieldValue(vec2 point, bool amplitude) {
  vec2 phases;
  if (uSteady > 0.5) {
    phases = uInitialPhases - uWaveNumber * vec2(length(point - uSources.xy), length(point - uSources.zw));
    if (amplitude) {
      vec2 sum = vec2(dot(uAmplitudes, cos(phases)), dot(uAmplitudes, sin(phases)));
      return length(sum);
    }
    phases += uPhase;
  } else {
    phases = vec2(phaseAt(emission(0, point)), phaseAt(emission(1, point))) + uInitialPhases;
  }
  if (amplitude) return length(vec2(dot(uAmplitudes, cos(phases)), dot(uAmplitudes, sin(phases))));
  return dot(uAmplitudes, sin(phases));
}`;

export function retardedFieldProgram(model: ModelState, time: number, positions: readonly PositionEvent[], phases: readonly PhaseEvent[], stationary: boolean, steady: boolean, phaseNow: number, horizon: number): FieldProgram | undefined {
  // Bound both texture size and shader search depth. Oversized histories use the CPU path.
  if (positions.length > 4096 || phases.length > 4096) return undefined;
  const positionWidth = capacity(positions.length), phaseWidth = capacity(phases.length);
  const trajectory = new Float32Array(positionWidth * 2 * 4), signal = new Float32Array(phaseWidth * 4);
  positions.forEach((event, i) => {
    const offset = Math.max(-horizon, event.time - time);
    const next = positions[i + 1];
    const mix = next && event.time < time - horizon ? (time - horizon - event.time) / (next.time - event.time) : 0;
    for (let source = 0; source < 2; source++) {
      const p = event.positions[source], q = next?.positions[source] ?? p;
      trajectory.set([offset, p.x + (q.x - p.x) * mix, p.y + (q.y - p.y) * mix, 0], (source * positionWidth + i) * 4);
    }
  });
  phases.forEach((event, i) => {
    const offset = Math.max(-horizon, event.time - time);
    const referencePhase = event.phase + TAU * event.frequency * (time + offset - event.time);
    signal.set([offset, wrap(referencePhase), TAU * event.frequency, 0], i * 4);
  });
  const [a, b] = model.sources, total = a.amplitude + b.amplitude;
  return Object.freeze({ key: 'retarded-phase-v1', glsl, textures: [
    { name: 'uTrajectory', width: positionWidth, height: 2, data: trajectory },
    { name: 'uSignal', width: phaseWidth, height: 1, data: signal },
  ], uniforms: {
    uCounts: [positions.length, phases.length], uSources: [a.position.x, a.position.y, b.position.x, b.position.y],
    uAmplitudes: [a.amplitude / total, b.amplitude / total], uInitialPhases: [wrap(a.initialPhase), wrap(b.initialPhase)],
    uSpeed: model.speed, uStationary: Number(stationary), uSteady: Number(steady), uPhase: wrap(phaseNow), uWaveNumber: TAU / model.wavelength,
  } });
}
