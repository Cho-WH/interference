import type {
  ClockFrame, FieldGrid, FieldMode, ModelState, PathSample, PhysicsSnapshot,
  ProbeSample, Source, SourceId, SourcePair, Vec2,
} from '../model/types';

const TAU = 2 * Math.PI;
// This tolerance only removes floating-point remnants at exact extrema.
const AMPLITUDE_RELATIVE_EPSILON = 1e-10;
const SAMPLES_PER_WAVELENGTH = 40;

type WaveBasis = Readonly<{ sine: number; cosine: number }>;
type TemporalBasis = Readonly<{ sine: number; cosine: number }>;

/** A sin(ψ − kr + φ), separated into spatial and temporal coefficients. */
function spatialBasis(source: Source, waveNumber: number, distance: number): WaveBasis {
  const phase = source.initialPhase - waveNumber * distance;
  return {
    sine: source.amplitude * Math.cos(phase),
    cosine: source.amplitude * Math.sin(phase),
  };
}

function temporalBasis(clock: ClockFrame): TemporalBasis {
  return { sine: Math.sin(clock.temporalPhase), cosine: Math.cos(clock.temporalPhase) };
}

function displacement(basis: WaveBasis, time: TemporalBasis): number {
  return basis.sine * time.sine + basis.cosine * time.cosine;
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function totalAmplitude(model: ModelState): number {
  return model.sources[0].amplitude + model.sources[1].amplitude;
}

function resultantAmplitude(basis: WaveBasis, maximum: number): number {
  const amplitude = Math.hypot(basis.sine, basis.cosine);
  const epsilon = maximum * AMPLITUDE_RELATIVE_EPSILON;
  if (amplitude <= epsilon) return 0;
  if (Math.abs(amplitude - maximum) <= epsilon) return maximum;
  return amplitude;
}

function sampleAt(model: ModelState, clock: ClockFrame, waveNumber: number, point: Vec2): ProbeSample {
  const [first, second] = model.sources;
  const distances: SourcePair<number> = Object.freeze([
    distanceBetween(point, first.position), distanceBetween(point, second.position),
  ]);
  const firstBasis = spatialBasis(first, waveNumber, distances[0]);
  const secondBasis = spatialBasis(second, waveNumber, distances[1]);
  const time = temporalBasis(clock);
  const componentDisplacements: SourcePair<number> = Object.freeze([
    displacement(firstBasis, time), displacement(secondBasis, time),
  ]);
  const maximum = totalAmplitude(model);
  const amplitude = resultantAmplitude({
    sine: firstBasis.sine + secondBasis.sine,
    cosine: firstBasis.cosine + secondBasis.cosine,
  }, maximum);
  const signedPathDifference = distances[1] - distances[0];
  return Object.freeze({
    distances,
    componentDisplacements,
    resultantDisplacement: componentDisplacements[0] + componentDisplacements[1],
    resultantAmplitude: amplitude,
    signedPathDifference,
    phaseDifference: second.initialPhase - first.initialPhase - waveNumber * signedPathDifference,
    interference: amplitude === 0 ? 'destructive' : amplitude === maximum ? 'constructive' : 'intermediate',
  });
}

/** Copy input values so a frame remains stable even if a caller owns mutable inputs. */
export function createSnapshot(model: ModelState, clock: ClockFrame): PhysicsSnapshot {
  const sources: SourcePair<Source> = Object.freeze([
    Object.freeze({ ...model.sources[0], position: Object.freeze({ ...model.sources[0].position }) }),
    Object.freeze({ ...model.sources[1], position: Object.freeze({ ...model.sources[1].position }) }),
  ]);
  const inputs: ModelState = Object.freeze({
    ...model,
    sources,
    probe: Object.freeze({ ...model.probe }),
    bounds: Object.freeze({ ...model.bounds }),
  });
  const instant = Object.freeze({ ...clock });
  const waveNumber = TAU / inputs.wavelength;
  return Object.freeze({
    model: inputs,
    clock: instant,
    waveNumber,
    frequency: inputs.speed / inputs.wavelength,
    probe: sampleAt(inputs, instant, waveNumber, inputs.probe),
  });
}

export function samplePoint(snapshot: PhysicsSnapshot, point: Vec2): ProbeSample {
  return sampleAt(snapshot.model, snapshot.clock, snapshot.waveNumber, point);
}

export function sampleAlongPath(
  snapshot: PhysicsSnapshot, sourceId: SourceId, distances: readonly number[],
): readonly number[] {
  const source = snapshot.model.sources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new RangeError(`Unknown source: ${sourceId}`);
  const time = temporalBasis(snapshot.clock);
  return Object.freeze(distances.map((distance) => displacement(
    spatialBasis(source, snapshot.waveNumber, distance), time,
  )));
}

/** Include both endpoints and the shorter path's exact distance in both rows. */
export function samplePaths(snapshot: PhysicsSnapshot): SourcePair<PathSample> {
  const commonDistance = Math.min(...snapshot.probe.distances);
  const paths = snapshot.model.sources.map((source, index): PathSample => {
    const length = snapshot.probe.distances[index];
    const intervals = Math.max(1, Math.ceil(length / snapshot.model.wavelength * SAMPLES_PER_WAVELENGTH));
    const distances = Array.from({ length: intervals + 1 }, (_, step) => length * step / intervals);
    // Exact values avoid endpoint round-off and let views find the shared marker.
    distances[distances.length - 1] = length;
    distances.push(commonDistance);
    const uniqueDistances = Object.freeze([...new Set(distances)].sort((a, b) => a - b));
    return Object.freeze({
      sourceId: source.id,
      distances: uniqueDistances,
      displacements: sampleAlongPath(snapshot, source.id, uniqueDistances),
    });
  });
  return Object.freeze([paths[0], paths[1]]);
}

type FieldSampler = (
  snapshot: PhysicsSnapshot, columns: number, rows: number, mode: FieldMode,
) => FieldGrid;

/** Explicit per-consumer cache; probe movement and time do not invalidate its spatial basis. */
export function createFieldSampler(): FieldSampler {
  let previousKey = '';
  let sineCoefficients = new Float64Array(0);
  let cosineCoefficients = new Float64Array(0);
  let amplitudes = new Float32Array(0);

  return (snapshot, columns, rows, mode) => {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new RangeError('Field dimensions must be positive integers.');
    }
    const { model, waveNumber } = snapshot;
    const key = JSON.stringify([
      columns, rows, model.bounds.width, model.bounds.height, waveNumber,
      ...model.sources.flatMap((source) => [
        source.position.x, source.position.y, source.amplitude, source.initialPhase,
      ]),
    ]);
    const maximum = totalAmplitude(model);
    if (key !== previousKey) {
      sineCoefficients = new Float64Array(columns * rows);
      cosineCoefficients = new Float64Array(columns * rows);
      amplitudes = new Float32Array(columns * rows);
      for (let row = 0; row < rows; row += 1) {
        const y = rows === 1 ? model.bounds.height / 2 : row / (rows - 1) * model.bounds.height;
        for (let column = 0; column < columns; column += 1) {
          const x = columns === 1 ? model.bounds.width / 2 : column / (columns - 1) * model.bounds.width;
          const point = { x, y };
          const first = spatialBasis(model.sources[0], waveNumber, distanceBetween(point, model.sources[0].position));
          const second = spatialBasis(model.sources[1], waveNumber, distanceBetween(point, model.sources[1].position));
          const basis = { sine: first.sine + second.sine, cosine: first.cosine + second.cosine };
          const index = row * columns + column;
          sineCoefficients[index] = maximum > 0 ? basis.sine / maximum : 0;
          cosineCoefficients[index] = maximum > 0 ? basis.cosine / maximum : 0;
          amplitudes[index] = maximum > 0 ? resultantAmplitude(basis, maximum) / maximum : 0;
        }
      }
      previousKey = key;
    }
    const values = new Float32Array(columns * rows);
    if (mode === 'amplitude') {
      values.set(amplitudes);
    } else {
      const time = temporalBasis(snapshot.clock);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = sineCoefficients[index] * time.sine + cosineCoefficients[index] * time.cosine;
      }
    }
    return Object.freeze({ columns, rows, values });
  };
}

/** Stateless sampling for callers that do not retain a field sampler. */
export function sampleField(
  snapshot: PhysicsSnapshot, columns: number, rows: number, mode: FieldMode,
): FieldGrid {
  return createFieldSampler()(snapshot, columns, rows, mode);
}
