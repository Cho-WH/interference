export type Vec2 = Readonly<{ x: number; y: number }>;
export type SourceId = 'source-1' | 'source-2';
export type SourcePair<T> = readonly [T, T];
export type Source = Readonly<{ id: SourceId; position: Vec2; amplitude: number; initialPhase: number }>;
export type Bounds = Readonly<{ width: number; height: number }>;
export type FieldBounds = Bounds & Vec2;
export type ModelState = Readonly<{ sources: SourcePair<Source>; probe: Vec2; wavelength: number; speed: number; bounds: Bounds }>;
export type ClockFrame = Readonly<{ timeSeconds: number; temporalPhase: number }>;
export type ProbeSample = Readonly<{
  distances: SourcePair<number>;
  /** The origins used for the displayed spatial sections; may be past source positions. */
  origins: SourcePair<Vec2>;
  componentDisplacements: SourcePair<number>;
  resultantDisplacement: number;
  /** A steady sinusoidal amplitude is unavailable during a change. */
  resultantAmplitude: number | null;
  signedPathDifference: number;
  phaseDifference: number | null;
  interference: 'constructive' | 'destructive' | 'intermediate' | 'transient';
}>;
export type PhysicsSnapshot = Readonly<{
  model: ModelState; clock: ClockFrame; probe: ProbeSample;
  moving: boolean;
  /** Entire displayed domain has received the current stationary source conditions. */
  steady: boolean;
}>;
export type PathSample = Readonly<{ sourceId: SourceId; distances: readonly number[]; displacements: readonly number[] }>;
export type FieldMode = 'wave' | 'amplitude';
export type FieldGrid = Readonly<{ columns: number; rows: number; values: Float32Array }>;
export type FieldTransform = Readonly<{ scale: number; offsetX: number; offsetY: number; width: number; height: number }>;
export type ChangeMode = 'propagate' | 'instant';
export type ViewState = Readonly<{ playing: boolean; fieldMode: FieldMode; changeMode: ChangeMode; comparisonOpen: boolean; pathWaves: boolean; interacted: boolean }>;
