/** Hysteresis: reduce sustained overload quickly, recover detail slowly. No physical state. */
export function createFieldQuality() {
  let level = 2, slow = 0, healthy = 0, warmup = 12, capped = false, intervalAverage = 0;
  const scales = [.5, .7, 1, 1.3, 1.6, 2];
  return {
    scale: () => scales[level],
    fps: (gpu: boolean, steady: boolean): 15 | 30 | 60 => capped ? (gpu || steady ? 30 : 15) : (gpu || steady ? 60 : 30),
    observe(costMs: number, intervalMs: number, fps: number, otherCpuMs = 0) {
      if (warmup-- > 0 || !Number.isFinite(costMs)) return;
      const budget = 1000 / fps;
      // One GC or scheduling stall must not contaminate many subsequent healthy frames.
      if (intervalMs <= 200) {
        const bounded = Math.min(intervalMs, budget * 2);
        intervalAverage = intervalAverage ? intervalAverage * .85 + bounded * .15 : bounded;
      }
      if (otherCpuMs > budget * .5 || costMs > budget * .72 || intervalAverage > budget * 1.2) {
        healthy = 0;
        if (++slow >= 8) {
          // Lowering background detail cannot fix expensive UI/CPU path drawing.
          if (otherCpuMs > budget * .5 || level === 0 || (level < 2 && intervalAverage > budget * 1.2 && costMs < budget * .25)) capped = true; else level--;
          slow = 0; warmup = 12; intervalAverage = 0;
        }
      } else if (costMs < budget * .4 && intervalMs < budget * 1.2 && (!capped || costMs + otherCpuMs < 6)) {
        slow = Math.max(0, slow - 1);
        if (++healthy >= 120) {
          if (capped) capped = false; else level = Math.min(scales.length - 1, level + 1);
          healthy = 0; warmup = 12; intervalAverage = 0;
        }
      } else { slow = Math.max(0, slow - 1); healthy = 0; }
    },
    reset() { level = 2; slow = 0; healthy = 0; warmup = 12; capped = false; intervalAverage = 0; },
  };
}
