import type { Bounds, FieldBounds, FieldTransform, Vec2 } from '../model/types';

export const COMPARISON_HEIGHT = 210;
export const LANDSCAPE_COMPARISON_HEIGHT = 180;

export function landscapeColumns(width: number) {
  const comparisonWidth = Math.max(286, width * .55);
  return { comparisonWidth, fieldWidth: width - comparisonWidth };
}

export function visibleFieldBounds(transform: FieldTransform): FieldBounds {
  return { x: -transform.offsetX / transform.scale, y: -transform.offsetY / transform.scale,
    width: transform.width / transform.scale, height: transform.height / transform.scale };
}

/** Reserve history for every supported layout before any history can be pruned.
 * Limits cover .app-shell/.workspace/.field in styles.css, including phone rotation.
 */
export function sceneFieldEnvelope(bounds: Bounds, sourceExtremes: readonly Vec2[]): FieldBounds {
  const views = [286, 1000].flatMap(width => [170, 360].map(height =>
    visibleFieldBounds(createSceneTransform(bounds, sourceExtremes, width, height))));
  // Include closed and expanded cameras in short landscape layouts.
  for (const width of [526, 1000]) for (const height of [180, 360]) {
    const columns = landscapeColumns(width);
    const scale = createSceneTransform(bounds, sourceExtremes, columns.fieldWidth, height, columns.comparisonWidth).scale;
    views.push(visibleFieldBounds(createFieldTransform(bounds, width, height, scale)));
  }
  const x = Math.min(0, ...views.map(v => v.x)), y = Math.min(0, ...views.map(v => v.y));
  return { x, y, width: Math.max(bounds.width, ...views.map(v => v.x + v.width)) - x,
    height: Math.max(bounds.height, ...views.map(v => v.y + v.height)) - y };
}

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
  sumX: number;
  sumZeroY: number;
  rowZeros: readonly [number, number];
  distanceScale: number;
  displacementScale: number;
  componentAmplitudePx: number;
  compact: boolean;
}>;

/** Fixed layout reserves the entire allowed range, not the current P distance. */
function comparisonColumns(width: number) {
  return { startX: width < 600 ? 22 : 30, pointX: width - 80, sumX: width - 28, gap: 32 };
}

export function maximumPathLength(bounds: Bounds, sourceExtremes: readonly Vec2[]): number {
  const corners = [{ x: 0, y: 0 }, { x: bounds.width, y: 0 },
    { x: 0, y: bounds.height }, { x: bounds.width, y: bounds.height }];
  return Math.max(...sourceExtremes.flatMap(source => corners.map(point =>
    Math.hypot(point.x - source.x, point.y - source.y))));
}

/** One pixels-per-meter value owns both the spatial field and unfolded paths. */
export function createSceneTransform(
  bounds: Bounds, sourceExtremes: readonly Vec2[], width: number, fieldHeight: number, comparisonWidth = width,
): FieldTransform {
  const { startX, pointX, gap } = comparisonColumns(comparisonWidth);
  const scale = Math.min(width / bounds.width, fieldHeight / bounds.height,
    Math.max(1, pointX - startX - gap) / maximumPathLength(bounds, sourceExtremes));
  return createFieldTransform(bounds, width, fieldHeight, scale);
}

export function computeComparisonLayout(
  width: number,
  fieldHeight: number,
  distanceScale: number,
  amplitude: number,
  compactHeight = false,
): ComparisonLayout {
  const { startX, pointX, sumX } = comparisonColumns(width);
  const componentAmplitudePx = 20;
  return {
    startX,
    pointX,
    sumX,
    sumZeroY: fieldHeight + (compactHeight ? 86 : 103),
    rowZeros: [fieldHeight + (compactHeight ? 52 : 65), fieldHeight + (compactHeight ? 120 : 141)],
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
