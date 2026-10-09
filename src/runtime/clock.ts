type ClockFrame = Readonly<{ timeSeconds: number }>;

export type SimulationClock = Readonly<{
  tick: (nowMs: number) => ClockFrame;
  setPlaying: (playing: boolean, nowMs: number) => ClockFrame;
  getFrame: () => ClockFrame;
  reset: (nowMs?: number) => ClockFrame;
}>;

/** One clock owns simulation time. Source phase and history belong to the engine. */
export function createClock(): SimulationClock {
  let frame: ClockFrame = Object.freeze({ timeSeconds: 0 });
  let previousNow: number | null = null;
  let playing = true;

  function tick(nowMs: number): ClockFrame {
    if (!Number.isFinite(nowMs)) {
      throw new RangeError('The clock needs a finite timestamp.');
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
      });
    }
    return frame;
  }

  function setPlaying(nextPlaying: boolean, nowMs: number): ClockFrame {
    tick(nowMs);
    playing = nextPlaying;
    return frame;
  }

  function reset(nowMs?: number): ClockFrame {
    if (nowMs !== undefined && !Number.isFinite(nowMs)) {
      throw new RangeError('The clock needs a finite reset timestamp.');
    }
    frame = Object.freeze({ timeSeconds: 0 });
    previousNow = nowMs ?? null;
    return frame;
  }

  return Object.freeze({ tick, setPlaying, getFrame: () => frame, reset });
}
