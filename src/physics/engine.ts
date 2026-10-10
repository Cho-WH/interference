import type { FieldBounds, FieldGrid, FieldMode, ModelState, PathSample, PhysicsSnapshot, ProbeSample, SourcePair, Vec2 } from '../model/types';
import type { FieldProgram } from './field-program';

/** Backend-independent, immutable read view of one simulation instant. SI units only. */
export interface WaveFrame {
  readonly snapshot: PhysicsSnapshot;
  readonly fieldBounds: FieldBounds;
  samplePoint(point: Vec2): ProbeSample;
  /** SI distances, ascending, including zero, the shared distance and the endpoint.
   * Endpoint displacement equals snapshot.probe.componentDisplacements. */
  samplePaths(): SourcePair<PathSample>;
  /** Row-major, endpoint-inclusive grid; singleton axes sample the center.
   * Positive integer sizes. wave is normalized to [-1,1], amplitude to [0,1].
   * amplitude is the arriving-phase envelope, equal to sinusoidal amplitude when
   * steady; during propagation it is not a period-averaged measurement. */
  sampleField(columns: number, rows: number, mode: FieldMode): FieldGrid;
  /** Optional opaque identity of field values, independent of resolution and P.
   * Equal keys guarantee equal samples for the same bounds, mode and grid size.
   * Without this hint, renderers may reuse only the exact same frame. */
  fieldCacheKey?(mode: FieldMode): string;
  /** Optional acceleration. Lazy, frame-owned data; CPU sampling remains the reference. */
  fieldProgram?(): FieldProgram | undefined;
}

/** Commands are applied at the last advanced simulation time, never wall-clock time. */
export interface WaveEngine {
  advanceTo(timeSeconds: number): void;
  setWavelength(wavelength: number): void;
  setSourceTargets(positions: SourcePair<Vec2>): void;
  /** Adopt the final configuration, clearing pending motion and old emissions
   * while retaining simulation time and the current source phase. */
  settle(): void;
  /** equilibriumSources requests the settled solution at these positions without
   * advancing time or modifying the live propagation history. All frame samples
   * (field, paths, probe) describe that same equilibrium configuration. */
  read(probe: Vec2, fieldBounds?: FieldBounds, options?: Readonly<{ equilibriumSources: SourcePair<Vec2> }>): WaveFrame;
  reset(model: ModelState): void;
}

export type WaveEngineFactory = (model: ModelState, fieldEnvelope?: FieldBounds) => WaveEngine;
