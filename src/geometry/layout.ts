import type { Bounds, FieldTransform, Vec2 } from '../model/types';

export function createFieldTransform(bounds: Bounds, width: number, height: number, scale = Math.min(width / bounds.width, height / bounds.height)): FieldTransform {
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

/** Fixed layout reserves the entire allowed range, not the current P distance. */
function comparisonColumns(width: number) {
  return { startX: width < 600 ? 22 : 30, pointX: width - 30, gap: 32 };
}

export function maximumPathLength(bounds: Bounds, sourceExtremes: readonly Vec2[]): number {
  const corners = [{ x: 0, y: 0 }, { x: bounds.width, y: 0 },
    { x: 0, y: bounds.height }, { x: bounds.width, y: bounds.height }];
  return Math.max(...sourceExtremes.flatMap(source => corners.map(point =>
    Math.hypot(point.x - source.x, point.y - source.y))));
}

/** One pixels-per-meter value owns both the spatial field and unfolded paths. */
export function createSceneTransform(
  bounds: Bounds, sourceExtremes: readonly Vec2[], width: number, fieldHeight: number,
): FieldTransform {
  const { startX, pointX, gap } = comparisonColumns(width);
  const scale = Math.min(width / bounds.width, fieldHeight / bounds.height,
    Math.max(1, pointX - startX - gap) / maximumPathLength(bounds, sourceExtremes));
  return createFieldTransform(bounds, width, fieldHeight, scale);
}

export function computeComparisonLayout(
  width: number,
  fieldHeight: number,
  distanceScale: number,
  amplitude: number,
): ComparisonLayout {
  const { startX, pointX } = comparisonColumns(width);
  const componentAmplitudePx = 20;
  return {
    startX,
    pointX,
    rowZeros: [fieldHeight + 65, fieldHeight + 141, fieldHeight + 222],
    distanceScale,
    displacementScale: amplitude > 0 ? componentAmplitudePx / amplitude : 1,
    componentAmplitudePx,
    compact: width < 600,
  };
}

export type PathPlacement = Readonly<{
  origin: Vec2;
  angle: number;
  distanceScale: number;
  displacementScale: number;
}>;

/** Rigid translation/rotation: the field distance scale never changes during unfolding. */
export function interpolatePathPlacement(
  source: Vec2,
  probe: Vec2,
  target: Vec2,
  progress: number,
  distanceScale: number,
  displacementScale: number,
): PathPlacement {
  const p = Math.max(0, Math.min(1, progress));
  return {
    origin: { x: source.x + (target.x - source.x) * p, y: source.y + (target.y - source.y) * p },
    angle: Math.atan2(probe.y - source.y, probe.x - source.x) * (1 - p),
    distanceScale,
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
