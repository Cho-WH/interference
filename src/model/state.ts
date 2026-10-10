import type { Bounds, ModelState, Source, SourcePair, Vec2 } from './types';

export const LIMITS = Object.freeze({
  wavelength: Object.freeze([0.06, 0.3] as const),
  separation: Object.freeze([0.06, 0.54] as const),
});

export type ModelAction =
  | Readonly<{ type: 'probe'; position: Vec2 }>
  | Readonly<{ type: 'wavelength'; value: number }>
  | Readonly<{ type: 'separation'; value: number }>
  | Readonly<{ type: 'reset' }>;

/** Shared by committed input, previews, and engine commands. Non-finite input is ignored. */
export function normalizeParameter(name: keyof typeof LIMITS, value: number, fallback: number): number {
  const [minimum, maximum] = LIMITS[name];
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export const sourceSeparation = (model: ModelState) => model.sources[1].position.y - model.sources[0].position.y;

const SOURCE_X = 0.4;

/** All positions available to the separation control, independent of its current value. */
export function sourcePositionExtremes(bounds: Bounds): readonly Vec2[] {
  return [
    { x: SOURCE_X, y: bounds.height / 2 - LIMITS.separation[1] / 2 },
    { x: SOURCE_X, y: bounds.height / 2 + LIMITS.separation[1] / 2 },
  ];
}

function source(id: Source['id'], y: number): Source {
  return Object.freeze({
    id,
    position: Object.freeze({ x: SOURCE_X, y }),
    amplitude: 0.01,
    initialPhase: 0,
  });
}

export function createModel(): ModelState {
  return Object.freeze({
    sources: Object.freeze([source('source-1', 0.21), source('source-2', 0.51)] as const),
    probe: Object.freeze({ x: 0.85, y: 0.36 }),
    wavelength: 0.15,
    speed: 0.12,
    bounds: Object.freeze({ width: 1.2, height: 0.72 }),
  });
}

/** All physical input changes enter through this reducer, in SI units. */
export function updateModel(model: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case 'probe': {
      // P may lie beyond the source apparatus bounds. The UI constrains it using
      // the visible camera and available comparison length, in geometry/probe-region.
      const x = Number.isFinite(action.position.x) ? action.position.x : model.probe.x;
      const y = Number.isFinite(action.position.y) ? action.position.y : model.probe.y;
      if (x === model.probe.x && y === model.probe.y) return model;
      return Object.freeze({ ...model, probe: Object.freeze({ x, y }) });
    }
    case 'wavelength': {
      const wavelength = normalizeParameter('wavelength', action.value, model.wavelength);
      if (wavelength === model.wavelength) return model;
      return Object.freeze({ ...model, wavelength });
    }
    case 'separation': {
      const previous = sourceSeparation(model);
      const separation = normalizeParameter('separation', action.value, previous);
      if (separation === previous) return model;
      const center = model.bounds.height / 2;
      const positions = [center - separation / 2, center + separation / 2] as const;
      const sources: SourcePair<Source> = Object.freeze([
        Object.freeze({ ...model.sources[0], position: Object.freeze({ x: SOURCE_X, y: positions[0] }) }),
        Object.freeze({ ...model.sources[1], position: Object.freeze({ x: SOURCE_X, y: positions[1] }) }),
      ]);
      return Object.freeze({ ...model, sources });
    }
    case 'reset':
      return createModel();
  }
}
