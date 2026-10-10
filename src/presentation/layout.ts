import type { Bounds, FieldBounds, FieldTransform, ModelState, PhysicsSnapshot, SourcePair, Vec2 } from '../model/types';
import type { LayoutId } from '../lesson/types';
import { toScreen, interpolatePathPlacement, type ComparisonLayout, type PathPlacement } from '../geometry/layout';

export type TeacherPose = Readonly<{
  magnification: number; placements: SourcePair<PathPlacement>; layout: ComparisonLayout;
  camera: FieldTransform; backgroundOpacity: number; backgroundLift: number; backgroundBlur: number;
  observationProbe: Vec2;
}>;
export function teacherFieldEnvelope(bounds: Bounds): FieldBounds {
  return { x: -4, y: -4, width: bounds.width + 8, height: bounds.height + 8 };
}
/** Camera scale depends on viewport, never on P, wavelength or source movement. */
export function teacherFieldTransform(model: ModelState, width: number, height: number): FieldTransform {
  const compact = width < 700, margin = compact ? 30 : 64;
  const scale = Math.max(30, Math.min(900 * width / 1280, (height - 160) / .56));
  let offsetX = width * .25 - .4 * scale;
  let offsetY = height * .55 - .36 * scale;
  // Pan only when a changed P would leave the safe observation area.
  offsetX += Math.max(0, margin - (model.probe.x * scale + offsetX));
  offsetX -= Math.max(0, model.probe.x * scale + offsetX - (width - margin - 30));
  offsetY += Math.max(0, 140 - (model.probe.y * scale + offsetY));
  offsetY -= Math.max(0, model.probe.y * scale + offsetY - (height - 70));
  return { width, height, scale, offsetX, offsetY };
}
export function teacherPose(snapshot: PhysicsSnapshot, width: number, height: number, kind: LayoutId): TeacherPose {
  const camera = teacherFieldTransform(snapshot.model, width, height);
  const spatial = kind === 'field' || kind === 'spatial-paths', parallel = kind === 'parallel';
  const compact = width < 700, endpoint = kind === 'endpoint-comparison';
  const baseAmplitude = 24 * Math.min(1, width / 1000);
  const baseDisplacement = baseAmplitude / .01;
  const left = compact ? 34 : width * .115625;
  const pointX = width * (compact ? .75 : .7578125), sumX = width * (compact ? .925 : .865625);
  const short = height < 500;
  const contentTop = short ? 130 : compact ? 200 : 180, contentBottom = height - (short ? 85 : compact ? 145 : 110);
  const center = (contentTop + contentBottom) / 2;
  const rowRail = compact ? 54 : 70;
  const maxDistance = Math.max(...snapshot.probe.distances, .01);
  const horizontal = (pointX - left - (compact ? 32 : 110)) / (maxDistance * camera.scale);
  const desired = (endpoint ? 1560 : 1320) * width / 1280 / camera.scale;
  const vertical = Math.max(.15, (contentBottom - contentTop - rowRail) / (4 * baseAmplitude + 14));
  const magnification = spatial || parallel ? 1 : Math.max(.15, Math.min(desired, vertical, endpoint && !compact ? desired : horizontal));
  const scale = camera.scale * magnification, amplitude = baseAmplitude * magnification;
  const gap = Math.max(2 * amplitude + rowRail, Math.min(156 * height / 664, 176));
  const rows: [number, number] = [center - gap / 2, center + gap / 2];
  const startX = endpoint && !compact ? Math.min(left, pointX - 150 - maxDistance * scale) : left;
  const probe = toScreen(snapshot.model.probe, camera);
  const placements = snapshot.probe.origins.map((origin, i) => {
    const source = toScreen(origin, camera);
    if (spatial || parallel) rows[i] = source.y;
    return interpolatePathPlacement(source, probe,
      spatial || parallel ? source : { x: startX, y: rows[i] }, spatial ? 0 : 1, scale, baseDisplacement * magnification);
  }) as unknown as SourcePair<PathPlacement>;
  const layout: ComparisonLayout = { startX: spatial || parallel ? placements[0].origin.x : startX,
    pointX, sumX, sumZeroY: (rows[0] + rows[1]) / 2, rowZeros: rows, distanceScale: scale,
    displacementScale: baseDisplacement * magnification, componentAmplitudePx: amplitude, compact };
  // The hidden spatial view carries the same scale as the path comparison.
  const fieldCamera = spatial || parallel ? camera : { ...camera, scale,
    offsetX: startX - .4 * scale, offsetY: center - .36 * scale };
  return { magnification, placements, layout, camera: fieldCamera, observationProbe: snapshot.model.probe,
    backgroundOpacity: kind === 'field' ? 1 : spatial ? .32 : 0, backgroundLift: spatial ? 0 : -height * .08, backgroundBlur: spatial ? 0 : 6 };
}
/** Update the physical path within a held layout without fitting again when P changes. */
export function updatePoseGeometry(pose: TeacherPose, snapshot: PhysicsSnapshot, kind: LayoutId): TeacherPose {
  const spatial = kind === 'field' || kind === 'spatial-paths';
  if (!spatial && kind !== 'parallel') return { ...pose, observationProbe: snapshot.model.probe };
  const p = toScreen(snapshot.model.probe, pose.camera);
  const placements = snapshot.probe.origins.map(origin => {
    const s = toScreen(origin, pose.camera);
    return interpolatePathPlacement(s, p, s, spatial ? 0 : 1, pose.layout.distanceScale, pose.layout.displacementScale);
  }) as unknown as SourcePair<PathPlacement>;
  return { ...pose, observationProbe: snapshot.model.probe, placements, layout: { ...pose.layout, startX: placements[0].origin.x,
    rowZeros: [placements[0].origin.y, placements[1].origin.y] } };
}
export function teacherCorrespondence(snapshot: PhysicsSnapshot, width: number, height: number): { spatial: TeacherPose; parallel: TeacherPose } {
  const base = teacherPose(snapshot, width, height, 'parallel');
  const origin = snapshot.probe.origins[0], maxR = Math.max(...snapshot.probe.distances, .1);
  const scale = Math.min((width / 2 - 100) / (maxR + .1), (height - 290) / .5);
  const magnification = scale / base.layout.distanceScale;
  const y = 235, rows = snapshot.probe.origins.map(o => y + (o.y - origin.y) * scale) as unknown as SourcePair<number>;
  function make(spatial: boolean): TeacherPose {
    const startX = spatial ? 72 : width / 2 + 62;
    const placements = snapshot.probe.origins.map((o, i) => ({
      origin: { x: startX + (spatial ? (o.x - origin.x) * scale : 0), y: rows[i] },
      angle: spatial ? Math.atan2(snapshot.model.probe.y - o.y, snapshot.model.probe.x - o.x) : 0,
      distanceScale: scale, displacementScale: base.layout.displacementScale * magnification,
    })) as unknown as SourcePair<PathPlacement>;
    return { ...base, magnification, placements, layout: { ...base.layout, startX, rowZeros: rows,
      distanceScale: scale, displacementScale: placements[0].displacementScale, componentAmplitudePx: base.layout.componentAmplitudePx * magnification }, backgroundOpacity: 0 };
  }
  return { spatial: make(true), parallel: make(false) };
}
