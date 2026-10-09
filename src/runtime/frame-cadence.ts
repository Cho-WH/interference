/** Limits sampling, never simulation time. Deadlines avoid drift on 60/120/144 Hz displays. */
export function createFrameCadence() {
  let deadline: number | null = null, lastSample: number | null = null, interval = 0;
  return {
    shouldSample(nowMs: number, steady: boolean, targetFps: 15 | 30 | 60 = steady ? 60 : 30): boolean {
      const nextInterval = 1000 / targetFps;
      if (interval !== nextInterval) {
        interval = nextInterval;
        deadline = lastSample === null ? nowMs : lastSample + interval;
      }
      if (deadline === null) deadline = nowMs;
      // RAF timestamps are rounded; tolerate sub-millisecond jitter without dropping a frame.
      if (nowMs + .5 < deadline) return false;
      const missed = Math.floor(Math.max(0, nowMs + .5 - deadline) / interval);
      deadline += (missed + 1) * interval;
      lastSample = nowMs;
      return true;
    },
    reset() { deadline = null; lastSample = null; interval = 0; },
  };
}
