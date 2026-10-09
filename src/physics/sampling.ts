import type { FieldGrid, FieldMode, PathSample, PhysicsSnapshot, ProbeSample, SourcePair, Vec2 } from '../model/types';
import type { WaveFrame } from './engine';
import type { FieldProgram } from './field-program';
import { LIMITS } from '../model/state';
import { SOURCE_SPEED_RATIO } from './source-motion';

export type PointSampler = (point: Vec2) => ProbeSample;
export type ComponentSampler = (index: number, point: Vec2) => number;
export type GridSampler = (columns: number, rows: number, mode: FieldMode) => FieldGrid;

/** Geometry-neutral sampling shared by backends; samples actual spatial sections. */
export function createWaveFrame(
  snapshot: PhysicsSnapshot, samplePoint: PointSampler, component: ComponentSampler, sampleField: GridSampler,
  fieldProgram?: () => FieldProgram | undefined,
): WaveFrame {
  return Object.freeze({ snapshot, samplePoint, sampleField, fieldProgram, samplePaths() {
    const { model, probe } = snapshot;
    const common = Math.min(...probe.distances);
    const spacing = (snapshot.steady ? model.wavelength : LIMITS.wavelength[0] * (1 - SOURCE_SPEED_RATIO)) / 24;
    const paths = model.sources.map((source, index): PathSample => {
      const origin = probe.origins[index], length = probe.distances[index];
      const count = Math.max(1, Math.ceil(length / spacing));
      const distances = [...new Set([...Array.from({ length: count + 1 }, (_, i) => length * i / count), common, length])].sort((a, b) => a - b);
      const displacements = distances.map(s => {
        if (s === length) return probe.componentDisplacements[index];
        const fraction = length > 0 ? s / length : 0;
        return component(index, { x: origin.x + (model.probe.x - origin.x) * fraction, y: origin.y + (model.probe.y - origin.y) * fraction });
      });
      return Object.freeze({ sourceId: source.id, distances: Object.freeze(distances), displacements: Object.freeze(displacements) });
    });
    return Object.freeze([paths[0], paths[1]]) as SourcePair<PathSample>;
  } });
}

export function fieldGrid(columns: number, rows: number, bounds: { width: number; height: number }, sample: (point: Vec2) => number): FieldGrid {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) throw new RangeError('Invalid field dimensions');
  const values = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    values[row * columns + column] = sample({
      x: columns === 1 ? bounds.width / 2 : column / (columns - 1) * bounds.width,
      y: rows === 1 ? bounds.height / 2 : row / (rows - 1) * bounds.height,
    });
  }
  return Object.freeze({ columns, rows, values });
}
