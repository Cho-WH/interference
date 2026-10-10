import type { Vec2 } from '../model/types';
import type { WaveFrame } from '../physics/engine';
import type { ProbeGuide } from '../geometry/probe-detent';

/** Share engine-backed interference guides without duplicating phase formulas. */
export function createFrameProbeGuide(frame: WaveFrame, contains: (point: Vec2) => boolean): ProbeGuide | undefined {
  if (!frame.snapshot.steady) return undefined;
  return {
    key: JSON.stringify([frame.snapshot.model.wavelength, frame.snapshot.model.sources]),
    phaseAt: point => frame.samplePoint(point).phaseDifference,
    contains,
  };
}
