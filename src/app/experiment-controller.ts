import { createModel, sourcePositionExtremes, sourceSeparation, updateModel, type ModelAction } from '../model/state';
import type { ExperimentPreset, FrameValidity } from '../lesson/types';
import { validatePreset } from '../lesson/validation';
import type { ChangeMode, FieldBounds, ModelState, SourcePair, Vec2 } from '../model/types';
import { DEFAULT_PLAYBACK_RATE } from '../model/playback';
import { sceneFieldEnvelope } from '../geometry/layout';
import { createClock } from '../runtime/clock';
import { createRetardedEngine } from '../physics/retarded-engine';
import type { WaveEngine, WaveFrame } from '../physics/engine';

export type ExperimentAction = Exclude<ModelAction, { type: 'reset' }>;
export type ExperimentInput = ExperimentAction['type'];
export type ExperimentInputPolicy = Readonly<{
  /** Explicit per command; a view's instant setting never leaks to another mode. */
  changeMode?: ChangeMode;
  allowedInputs?: readonly ExperimentInput[];
  constrainProbe?: (point: Vec2) => Vec2;
}>;

export interface ExperimentController {
  readonly model: ModelState;
  readonly playing: boolean;
  readonly playbackRate: number;
  readonly timeSeconds: number;
  readonly generation: number;
  advance(nowMs: number): number;
  setPlaying(playing: boolean, nowMs: number): number;
  setRate(rate: number, nowMs: number): number;
  read(bounds?: FieldBounds, options?: Readonly<{ equilibriumSources: SourcePair<Vec2> }>): WaveFrame;
  /** False means the command was denied by the supplied input policy. */
  dispatch(action: ExperimentAction, nowMs: number, policy?: ExperimentInputPolicy): boolean;
  applyPreset(preset: ExperimentPreset, nowMs: number): void;
  /** Observe an animated P without changing the committed preset, history or clock. */
  readBundle(bounds?: FieldBounds, observationProbe?: Vec2): { frame: WaveFrame; validity: FrameValidity };
  settle(nowMs: number): void;
  /** A new experiment; retains playback/rate just like the ordinary reset control. */
  reset(nowMs: number, model?: ModelState): void;
}

/** One simulation authority shared by ordinary exploration and teacher presentation. */
export function createExperimentController(options: Readonly<{
  model?: ModelState;
  fieldEnvelope?: FieldBounds;
}> = {}): ExperimentController {
  let model = options.model ?? createModel();
  let playing = true;
  let playbackRate: number = DEFAULT_PLAYBACK_RATE;
  let generation = 0;
  const clock = createClock();
  // The only backend selection point. Consumers receive WaveFrame, never the engine.
  const engine: WaveEngine = createRetardedEngine(model,
    options.fieldEnvelope ?? sceneFieldEnvelope(model.bounds, sourcePositionExtremes(model.bounds)));

  function advance(nowMs: number) {
    const time = clock.tick(nowMs).timeSeconds;
    engine.advanceTo(time);
    return time;
  }

  return {
    get model() { return model; },
    get playing() { return playing; },
    get playbackRate() { return playbackRate; },
    get timeSeconds() { return clock.getFrame().timeSeconds; },
    get generation() { return generation; },
    advance,
    setPlaying(nextPlaying, nowMs) {
      const time = clock.setPlaying(nextPlaying, nowMs).timeSeconds;
      engine.advanceTo(time);
      playing = nextPlaying;
      return time;
    },
    setRate(nextRate, nowMs) {
      const time = clock.setRate(nextRate, nowMs).timeSeconds;
      engine.advanceTo(time);
      playbackRate = nextRate;
      return time;
    },
    read: (bounds, readOptions) => engine.read(model.probe, bounds, readOptions),
    readBundle(bounds, observationProbe = model.probe) {
      const frame = engine.read(observationProbe, bounds);
      // No advance or commands between reads. Analysis is independent of camera.
      const analysis = engine.read(observationProbe, { x: 0, y: 0, ...model.bounds });
      return { frame, validity: { generation, timeSeconds: frame.snapshot.clock.timeSeconds,
        probeSteady: frame.snapshot.probe.interference !== 'transient', analysisSteady: analysis.snapshot.steady } };
    },
    applyPreset(preset, nowMs) {
      const errors = validatePreset(preset, 'preset');
      if (errors.length) throw new Error(errors.map(error => error.message).join('\n'));
      let next = updateModel(model, { type: 'probe', position: preset.probe });
      next = updateModel(next, { type: 'wavelength', value: preset.wavelength });
      next = updateModel(next, { type: 'separation', value: preset.separation });
      advance(nowMs);
      if (next.wavelength !== model.wavelength) engine.setWavelength(next.wavelength);
      if (sourceSeparation(next) !== sourceSeparation(model)) engine.setSourceTargets([next.sources[0].position, next.sources[1].position]);
      if (next !== model) generation++;
      model = next;
    },
    dispatch(action, nowMs, policy = {}) {
      if (policy.allowedInputs && !policy.allowedInputs.includes(action.type)) return false;
      let next = updateModel(model, action);
      if (action.type === 'probe' && policy.constrainProbe) {
        next = updateModel(next, { type: 'probe', position: policy.constrainProbe(next.probe) });
      }
      // Normalize and constrain before advancing; rejected inputs never partly mutate history.
      advance(nowMs);
      if (next !== model) generation++;
      if (action.type === 'wavelength' && next.wavelength !== model.wavelength) engine.setWavelength(next.wavelength);
      if (action.type === 'separation' && sourceSeparation(next) !== sourceSeparation(model)) engine.setSourceTargets([next.sources[0].position, next.sources[1].position]);
      model = next;
      if (policy.changeMode === 'instant' && (action.type === 'wavelength' || action.type === 'separation')) engine.settle();
      return true;
    },
    settle(nowMs) { advance(nowMs); engine.settle(); generation++; },
    reset(nowMs, nextModel = createModel()) {
      // Validate the clock timestamp before changing either owner.
      if (!Number.isFinite(nowMs)) throw new RangeError('The experiment needs a finite reset timestamp.');
      engine.reset(nextModel);
      clock.reset(nowMs);
      model = nextModel;
      generation++;
    },
  };
}
