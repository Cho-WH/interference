import type { Bounds, FieldTransform, SourcePair, Vec2 } from '../model/types';

export function createFieldTransform(bounds: Bounds, width: number, height: number): FieldTransform {
  const scale = Math.min(width / bounds.width, height / bounds.height);
  return {
    scale,
    offsetX: (width - bounds.width * scale) / 2,
    offsetY: (height - bounds.height * scale) / 2,
    width,
    height,
  };
}

export function toScreen(point: Vec2, transform: FieldTransform): Vec2 {
  return { x: point.x * transform.scale + transform.offsetX, y: point.y * transform.scale + transform.offsetY };
}

export function toWorld(point: Vec2, transform: FieldTransform): Vec2 {
  return { x: (point.x - transform.offsetX) / transform.scale, y: (point.y - transform.offsetY) / transform.scale };
}

export type ComparisonLayout = Readonly<{
  startX: number;
  pointX: number;
  rowZeros: readonly [number, number, number];
  distanceScale: number;
  displacementScale: number;
  componentAmplitudePx: number;
  compact: boolean;
}>;

export function computeComparisonLayout(
  width: number,
  fieldHeight: number,
  distances: SourcePair<number>,
  amplitude: number,
): ComparisonLayout {
  const compact = width < 600;
  const startX = compact ? 26 : 38;
  const pointX = width - (compact ? 40 : 58);
  const availableLength = Math.max(1, pointX - startX - (compact ? 42 : 66));
  const longestDistance = Math.max(...distances);
  const componentAmplitudePx = 24;
  return {
    startX,
    pointX,
    rowZeros: [fieldHeight + 80, fieldHeight + 170, fieldHeight + 268],
    distanceScale: longestDistance > 0 ? availableLength / longestDistance : 1,
    displacementScale: amplitude > 0 ? componentAmplitudePx / amplitude : 1,
    componentAmplitudePx,
    compact,
  };
}

export type PathPlacement = Readonly<{
  origin: Vec2;
  angle: number;
  distanceScale: number;
  displacementScale: number;
}>;

/** Move and rotate a path as a whole; a shared scale preserves length ratios. */
export function interpolatePathPlacement(
  source: Vec2,
  probe: Vec2,
  target: Vec2,
  progress: number,
  initialDistanceScale: number,
  finalDistanceScale: number,
  displacementScale: number,
): PathPlacement {
  const p = Math.max(0, Math.min(1, progress));
  return {
    origin: { x: source.x + (target.x - source.x) * p, y: source.y + (target.y - source.y) * p },
    angle: Math.atan2(probe.y - source.y, probe.x - source.x) * (1 - p),
    distanceScale: initialDistanceScale + (finalDistanceScale - initialDistanceScale) * p,
    displacementScale,
  };
}

/** Positive displacement is above the local path, independently of map y. */
export function placePathPoint(distance: number, displacement: number, placement: PathPlacement): Vec2 {
  const along = distance * placement.distanceScale;
  const above = displacement * placement.displacementScale;
  const cosine = Math.cos(placement.angle);
  const sine = Math.sin(placement.angle);
  return {
    x: placement.origin.x + along * cosine + above * sine,
    y: placement.origin.y + along * sine - above * cosine,
  };
}
