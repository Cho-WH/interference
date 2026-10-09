import type { ModelState, PhysicsSnapshot, ProbeSample, SourcePair, Vec2 } from '../model/types';
import { LIMITS } from '../model/state';
import type { WaveEngineFactory } from './engine';
import { phaseAt, pruneHistory, retardedArrival, type PhaseEvent, type PositionEvent } from './history';
import { distance, moveSource, MOTION_STEP, type Motion } from './source-motion';
import { createWaveFrame, fieldGrid } from './sampling';
import { retardedFieldProgram } from './retarded-field-program';

const TAU = 2 * Math.PI;
const frozenPoint = (p: Vec2): Vec2 => Object.freeze({ ...p });
const pair = <T>(values: readonly T[]): SourcePair<T> => Object.freeze([values[0], values[1]]);
function copyModel(model: ModelState): ModelState {
  return Object.freeze({ ...model, bounds: Object.freeze({ ...model.bounds }), probe: frozenPoint(model.probe),
    sources: pair(model.sources.map(s => Object.freeze({ ...s, position: frozenPoint(s.position) }))) });
}
function amplitude(a: number, b: number, phase: number): number {
  const value = Math.hypot(a + b * Math.cos(phase), b * Math.sin(phase));
  const max = a + b;
  return value < max * 1e-10 ? 0 : Math.abs(value - max) < max * 1e-10 ? max : value;
}

/** Constant-amplitude retarded-phase model. No PDE solver details escape this module. */
export const createRetardedEngine: WaveEngineFactory = initial => {
  let config = copyModel(initial), time = 0, changedAt = -Infinity, lastMotionAt = -Infinity;
  let motion: Motion[] = [];
  let positions: PositionEvent[] = [], phases: PhaseEvent[] = [];
  let cacheKey = '';
  let geometryKey = '';
  let cachedDelays: SourcePair<Float64Array> = [new Float64Array(0), new Float64Array(0)];
  function stationaryDelays(columns: number, rows: number, model: ModelState) {
    // Wavelength, phase, amplitude and probe position do not change travel distances.
    const key = JSON.stringify([columns, rows, model.bounds, model.speed, model.sources.map(s => s.position)]);
    if (key !== geometryKey) {
      const delays: SourcePair<Float64Array> = [new Float64Array(columns * rows), new Float64Array(columns * rows)];
      let i = 0;
      fieldGrid(columns, rows, model.bounds, point => {
        delays[0][i] = distance(model.sources[0].position, point) / model.speed;
        delays[1][i] = distance(model.sources[1].position, point) / model.speed;
        i++; return 0;
      });
      cachedDelays = delays; geometryKey = key;
    }
    return cachedDelays;
  }
  let cachedSine: Float64Array = new Float64Array(0), cachedCosine: Float64Array = new Float64Array(0), cachedAmplitude: Float32Array = new Float32Array(0);
  const reset = (model: ModelState) => {
    config = copyModel(model); time = 0; changedAt = -Infinity; lastMotionAt = -Infinity;
    motion = config.sources.map(s => ({ position: s.position, target: s.position, velocity: { x: 0, y: 0 } }));
    positions = [{ time: 0, positions: pair(motion.map(s => frozenPoint(s.position))) }];
    const past = -Math.hypot(config.bounds.width, config.bounds.height) / config.speed - 1;
    const frequency = config.speed / config.wavelength;
    phases = [{ time: past, phase: TAU * frequency * past, frequency }];
    cacheKey = ''; geometryKey = '';
  };
  const moving = () => motion.some(s => distance(s.position, s.target) > 0);
  function anchor() {
    const event = Object.freeze({ time, positions: pair(motion.map(s => frozenPoint(s.position))) });
    if (positions.at(-1)!.time === time) positions[positions.length - 1] = event;
    else positions.push(event);
  }
  reset(initial);
  return {
    reset,
    advanceTo(next) {
      if (!Number.isFinite(next) || next < time) throw new RangeError('Simulation time must be monotonic');
      while (time < next && moving()) {
        const dt = Math.min(MOTION_STEP, next - time);
        motion = motion.map(s => moveSource(s, dt, config.speed));
        time += dt;
        changedAt = time;
        lastMotionAt = time;
        anchor();
      }
      time = next;
      const horizon = Math.hypot(config.bounds.width, config.bounds.height) / config.speed + MOTION_STEP * 2;
      pruneHistory(positions, time - horizon);
      pruneHistory(phases, time - horizon);
    },
    setWavelength(value) {
      if (!Number.isFinite(value)) return;
      const wavelength = Math.min(LIMITS.wavelength[1], Math.max(LIMITS.wavelength[0], value));
      if (wavelength === config.wavelength) return;
      const event = { time, phase: phaseAt(phases, time), frequency: config.speed / wavelength };
      if (phases.at(-1)!.time === time) phases[phases.length - 1] = event; else phases.push(event);
      config = Object.freeze({ ...config, wavelength });
      changedAt = time;
    },
    setSourceTargets(targets) {
      if (targets.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > config.bounds.width || p.y > config.bounds.height)) throw new RangeError('Source target outside the domain');
      if (targets.every((p, i) => distance(p, motion[i].target) === 0)) return;
      anchor();
      // Re-target from the current position with a fresh gentle launch; never teleport.
      motion = motion.map((s, i) => ({ ...s, target: frozenPoint(targets[i]), velocity: { x: 0, y: 0 } }));
    },
    read(probe) {
      const model = copyModel({ ...config, probe, sources: pair(config.sources.map((s, i) => ({ ...s, position: motion[i].position }))) });
      // Copies make retained frames independent of later commands, pruning, or reset.
      const trajectory = positions.slice(), signal = phases.slice(), instant = time, lastChange = changedAt;
      const isMoving = moving(), maximum = model.sources[0].amplitude + model.sources[1].amplitude;
      const farthest = Math.max(...model.sources.flatMap(s => [
        { x: 0, y: 0 }, { x: model.bounds.width, y: 0 }, { x: 0, y: model.bounds.height }, { x: model.bounds.width, y: model.bounds.height },
      ].map(p => distance(s.position, p))));
      const steady = !isMoving && instant - lastChange >= farthest / model.speed;
      const stationaryGeometry = !isMoving && instant - lastMotionAt >= farthest / model.speed;
      const phaseNow = phaseAt(signal, instant), k = TAU / model.wavelength;
      function component(index: number, point: Vec2) {
        const source = model.sources[index];
        const emitted = stationaryGeometry ? instant - distance(source.position, point) / model.speed : retardedArrival(trajectory, index, point, instant, model.speed).time;
        return source.amplitude * Math.sin(phaseAt(signal, emitted) + source.initialPhase);
      }
      function samplePoint(point: Vec2): ProbeSample {
        const arrivals = model.sources.map((_, i) => retardedArrival(trajectory, i, point, instant, model.speed));
        const sourcePhases = arrivals.map((a, i) => phaseAt(signal, a.time) + model.sources[i].initialPhase);
        const components = pair(sourcePhases.map((p, i) => model.sources[i].amplitude * Math.sin(p)));
        const localSteady = !isMoving && arrivals.every(a => a.time >= lastChange);
        const difference = sourcePhases[1] - sourcePhases[0];
        const value = localSteady ? amplitude(model.sources[0].amplitude, model.sources[1].amplitude, difference) : null;
        return Object.freeze({ distances: pair(arrivals.map(a => a.distance)), origins: pair(arrivals.map(a => frozenPoint(a.origin))),
          componentDisplacements: components, resultantDisplacement: components[0] + components[1],
          signedPathDifference: arrivals[1].distance - arrivals[0].distance,
          resultantAmplitude: value, phaseDifference: localSteady ? difference : null,
          interference: value === null ? 'transient' : value === 0 ? 'destructive' : value === maximum ? 'constructive' : 'intermediate' });
      }
      const snapshot: PhysicsSnapshot = Object.freeze({ model, clock: Object.freeze({ timeSeconds: instant, temporalPhase: phaseNow }), probe: samplePoint(probe), moving: isMoving, steady });
      let gpuProgram: ReturnType<typeof retardedFieldProgram>;
      return createWaveFrame(snapshot, samplePoint, component, (columns, rows, mode) => {
        if (mode === 'amplitude' && !steady) throw new Error('Steady amplitude unavailable during propagation');
        if (!steady && !stationaryGeometry) return fieldGrid(columns, rows, model.bounds, p => (component(0, p) + component(1, p)) / maximum);
        const delays = stationaryDelays(columns, rows, model);
        if (!steady) {
          const values = new Float32Array(columns * rows);
          const [a, b] = model.sources;
          for (let i = 0; i < values.length; i++) {
            values[i] = (a.amplitude * Math.sin(phaseAt(signal, instant - delays[0][i]) + a.initialPhase)
              + b.amplitude * Math.sin(phaseAt(signal, instant - delays[1][i]) + b.initialPhase)) / maximum;
          }
          return Object.freeze({ columns, rows, values });
        }
        const key = JSON.stringify([columns, rows, model.bounds, model.wavelength, model.sources]);
        if (key !== cacheKey) {
          cachedSine = new Float64Array(columns * rows); cachedCosine = new Float64Array(columns * rows);
          let index = 0;
          const field = fieldGrid(columns, rows, model.bounds, () => {
            const phases = model.sources.map((s, i) => s.initialPhase - k * model.speed * delays[i][index]);
            cachedSine[index] = model.sources.reduce((sum, s, i) => sum + s.amplitude * Math.cos(phases[i]), 0) / maximum;
            cachedCosine[index] = model.sources.reduce((sum, s, i) => sum + s.amplitude * Math.sin(phases[i]), 0) / maximum;
            const a = Math.hypot(cachedSine[index], cachedCosine[index]); index++;
            return a < 1e-10 ? 0 : Math.abs(a - 1) < 1e-10 ? 1 : a;
          });
          cachedAmplitude = field.values; cacheKey = key;
        }
        const values = new Float32Array(columns * rows);
        if (mode === 'amplitude') values.set(cachedAmplitude);
        else {
          const sin = Math.sin(phaseNow), cos = Math.cos(phaseNow);
          for (let i = 0; i < values.length; i++) values[i] = cachedSine[i] * sin + cachedCosine[i] * cos;
        }
        return Object.freeze({ columns, rows, values });
      }, () => gpuProgram ??= retardedFieldProgram(model, instant, trajectory, signal, stationaryGeometry, steady, phaseNow));
    },
  };
};
