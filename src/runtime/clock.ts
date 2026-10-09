import type { ClockFrame } from '../model/types';

const TAU = 2 * Math.PI;

export type SimulationClock = Readonly<{
  tick: (nowMs: number, frequency: number) => ClockFrame;
  setPlaying: (playing: boolean, nowMs: number, frequency: number) => ClockFrame;
  getFrame: () => ClockFrame;
  reset: (nowMs?: number) => ClockFrame;
}>;

/** One clock owns elapsed simulation time and accumulated temporal phase. */
export function createClock(): SimulationClock {
  let frame: ClockFrame = Object.freeze({ timeSeconds: 0, temporalPhase: 0 });
  let previousNow: number | null = null;
  let playing = true;

  function tick(nowMs: number, frequency: number): ClockFrame {
    if (!Number.isFinite(nowMs) || !Number.isFinite(frequency) || frequency < 0) {
      throw new RangeError('The clock needs a finite timestamp and nonnegative frequency.');
    }
    if (previousNow === null) {
      previousNow = nowMs;
      return frame;
    }
    const elapsedSeconds = Math.max(0, nowMs - previousNow) / 1000;
    previousNow = Math.max(previousNow, nowMs);
    if (playing && elapsedSeconds > 0) {
      frame = Object.freeze({
        timeSeconds: frame.timeSeconds + elapsedSeconds,
        temporalPhase: frame.temporalPhase + TAU * frequency * elapsedSeconds,
      });
    }
    return frame;
  }

  function setPlaying(nextPlaying: boolean, nowMs: number, frequency: number): ClockFrame {
    tick(nowMs, frequency);
    playing = nextPlaying;
    return frame;
  }

  function reset(nowMs?: number): ClockFrame {
    if (nowMs !== undefined && !Number.isFinite(nowMs)) {
      throw new RangeError('The clock needs a finite reset timestamp.');
    }
    frame = Object.freeze({ timeSeconds: 0, temporalPhase: 0 });
    previousNow = nowMs ?? null;
    return frame;
  }

  return Object.freeze({ tick, setPlaying, getFrame: () => frame, reset });
}
