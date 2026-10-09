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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

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
    sources: Object.freeze([source('source-1', 0.24), source('source-2', 0.48)] as const),
    probe: Object.freeze({ x: 0.85, y: 0.36 }),
    wavelength: 0.16,
    speed: 0.12,
    bounds: Object.freeze({ width: 1.2, height: 0.72 }),
  });
}

/** All physical input changes enter through this reducer, in SI units. */
export function updateModel(model: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case 'probe': {
      const x = Number.isFinite(action.position.x)
        ? clamp(action.position.x, 0, model.bounds.width)
        : model.probe.x;
      const y = Number.isFinite(action.position.y)
        ? clamp(action.position.y, 0, model.bounds.height)
        : model.probe.y;
      if (x === model.probe.x && y === model.probe.y) return model;
      return Object.freeze({ ...model, probe: Object.freeze({ x, y }) });
    }
    case 'wavelength': {
      if (!Number.isFinite(action.value)) return model;
      const wavelength = clamp(action.value, ...LIMITS.wavelength);
      if (wavelength === model.wavelength) return model;
      return Object.freeze({ ...model, wavelength });
    }
    case 'separation': {
      if (!Number.isFinite(action.value)) return model;
      const separation = clamp(action.value, ...LIMITS.separation);
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
