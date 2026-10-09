import type { FieldGrid, FieldMode, ModelState, PathSample, PhysicsSnapshot, ProbeSample, SourcePair, Vec2 } from '../model/types';
import type { FieldProgram } from './field-program';

/** Backend-independent, immutable read view of one simulation instant. SI units only. */
export interface WaveFrame {
  readonly snapshot: PhysicsSnapshot;
  samplePoint(point: Vec2): ProbeSample;
  samplePaths(): SourcePair<PathSample>;
  /** amplitude is requested only when snapshot.steady is true. */
  sampleField(columns: number, rows: number, mode: FieldMode): FieldGrid;
  /** Optional acceleration. Lazy, frame-owned data; CPU sampling remains the reference. */
  fieldProgram?(): FieldProgram | undefined;
}

/** Commands are applied at the last advanced simulation time, never wall-clock time. */
export interface WaveEngine {
  advanceTo(timeSeconds: number): void;
  setWavelength(wavelength: number): void;
  setSourceTargets(positions: SourcePair<Vec2>): void;
  read(probe: Vec2): WaveFrame;
  reset(model: ModelState): void;
}

export type WaveEngineFactory = (model: ModelState) => WaveEngine;
