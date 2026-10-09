import type { FieldTransform, PathSample, PhysicsSnapshot, SourcePair } from '../model/types';
import { computeComparisonLayout, interpolatePathPlacement, placePathPoint, toScreen } from '../geometry/layout';
import { createDisplacementMarker, pathFromPoints, setAttributes, setLine, setPoint, SOURCE_COLORS, SUM_COLOR, svgElement, svgText } from '../visual/svg';
import { comparisonCopy, formatDistance } from '../ui/copy';
import { createWavelengthRuler } from '../visual/wavelength-ruler';

export type ComparisonRenderOptions = Readonly<{
  width: number;
  fieldHeight: number;
  comparisonHeight: number;
  progress: number;
  guideOpacity: number;
  fieldTransform: FieldTransform;
  offsetX?: number;
}>;

export function createComparisonView(svg: SVGSVGElement) {
  const root = svgElement('g', { 'data-view': 'comparison', 'pointer-events': 'none', 'aria-hidden': 'true' }, svg);
  const annotationLayer = svgElement('g', { 'data-comparison-annotations': '' }, root);
  const pointPanel = svgElement('rect', { rx: 18, fill: 'var(--panel-tint, #f3f5f5)' }, annotationLayer);
  const title = svgText(annotationLayer, comparisonCopy.probeTitle, { 'font-size': 12, 'font-weight': 650, 'text-anchor': 'end' });
  const pathDifference = svgText(annotationLayer, '', { 'font-size': 12, fill: 'var(--muted, #687c85)', 'data-path-difference-label': '' });
  const sameDistanceKey = svgElement('circle', { r: 4, fill: 'white', stroke: 'var(--muted, #687c85)', 'stroke-width': 1.5 }, annotationLayer);
  const sameDistanceLabel = svgText(annotationLayer, comparisonCopy.equalDistance, { 'font-size': 11, fill: 'var(--muted, #687c85)', 'text-anchor': 'middle' });
  const rows = SOURCE_COLORS.map((color, index) => {
    const group = svgElement('g', { 'data-source-row': `source-${index + 1}` }, root);
    const baseline = svgElement('line', { stroke: color, 'stroke-width': 1.2, 'stroke-opacity': 0.35, 'data-path-baseline': `source-${index + 1}` }, group);
    const curve = svgElement('path', { fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'data-wave-path': `source-${index + 1}` }, group);
    const start = svgElement('circle', { r: 7, fill: color, stroke: 'white', 'stroke-width': 1.8 }, group);
    const startNumber = svgText(group, String(index + 1), { fill: 'white', 'font-size': 9, 'font-weight': 750, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    const end = svgElement('circle', { r: 4.5, fill: color, stroke: 'white', 'stroke-width': 1.8, 'data-path-end': `source-${index + 1}` }, group);
    const sourceLabel = svgText(annotationLayer, comparisonCopy.sourceNames[index], { fill: color, 'font-weight': 700 });
    const distanceLabel = svgText(annotationLayer, '', { 'font-size': 12, 'font-weight': 600, 'text-anchor': 'end', 'data-path-distance': `source-${index + 1}` });
    return { group, baseline, curve, start, startNumber, end, sourceLabel, distanceLabel };
  });
  const settledLayer = svgElement('g', { 'data-comparison-settled': '', display: 'none' }, root);
  const differenceRuler = createWavelengthRuler(settledLayer, 'data-path-difference-ruler');
  const sameDistanceGuide = svgElement('line', { stroke: '#90aaa5', 'stroke-width': 1.2, 'stroke-opacity': .8, 'data-same-distance-guide': '' }, settledLayer);
  const longDistanceGuide = svgElement('line', { stroke: '#90aaa5', 'stroke-width': 1.2, 'stroke-opacity': .8, 'data-long-distance-guide': '' }, settledLayer);
  const auxiliaryPoint = svgElement('circle', { r: 5, fill: 'white', 'stroke-width': 2, 'data-same-distance-point': '' }, settledLayer);
  const connections = SOURCE_COLORS.map((color, index) => svgElement('line', {
    stroke: color,
    'stroke-width': 1.3,
    'stroke-opacity': 0.7,
    'stroke-dasharray': '3 5',
    'data-endpoint-link': `source-${index + 1}`,
  }, settledLayer));
  const markers = [
    createDisplacementMarker(settledLayer, SOURCE_COLORS[0], 'source-1'),
    createDisplacementMarker(settledLayer, SOURCE_COLORS[1], 'source-2'),
    createDisplacementMarker(settledLayer, SUM_COLOR, 'sum'),
  ];
  const zeroLabels = markers.map(() => svgText(settledLayer, comparisonCopy.zero, { 'font-size': 10, fill: 'var(--muted, #84939b)' }));
  const wavelengthMark = createWavelengthRuler(annotationLayer, 'data-wavelength-mark');
  const wavelengthLabel = svgText(annotationLayer, '', { 'font-size': 11, 'font-weight': 650, 'text-anchor': 'middle', fill: '#4b646d' });
  const sumLabel = svgText(annotationLayer, comparisonCopy.sum, { fill: SUM_COLOR, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle' });

  return {
    render(snapshot: PhysicsSnapshot, paths: SourcePair<PathSample>, options: ComparisonRenderOptions) {
      const { model, probe } = snapshot;
      const progress = Math.max(0, Math.min(1, options.progress));
      const amplitude = Math.max(model.sources[0].amplitude, model.sources[1].amplitude);
      const local = computeComparisonLayout(options.width, options.fieldHeight, options.fieldTransform.scale, amplitude, options.comparisonHeight < 210);
      const offsetX = options.offsetX ?? 0;
      const layout = { ...local, startX: local.startX + offsetX, pointX: local.pointX + offsetX, sumX: local.sumX + offsetX };
      const { startX, pointX, sumX, sumZeroY, rowZeros, displacementScale } = layout;
      const commonDistance = Math.min(...probe.distances);
      const longIndex = probe.distances[1] > probe.distances[0] ? 1 : 0;
      const shortIndex = longIndex === 0 ? 1 : 0;
      const hasExtraPath = Math.abs(probe.signedPathDifference) > 1e-10;
      const canCompare = snapshot.steady;
      const settled = options.guideOpacity > 0;
      const annotationOpacity = Math.max(0, (progress - 0.6) / 0.4);
      setAttributes(root, {
        'data-progress': progress,
        'data-time-seconds': snapshot.clock.timeSeconds,
        'data-temporal-phase': snapshot.clock.temporalPhase,
        'data-distance-scale': layout.distanceScale,
        'data-wavelength-pixels': model.wavelength * layout.distanceScale,
        'data-displacement-scale': displacementScale,
        'data-long-source': hasExtraPath ? model.sources[longIndex].id : 'equal',
        'data-steady': snapshot.steady,
      });
      setAttributes(annotationLayer, { opacity: annotationOpacity, display: progress > 0 ? null : 'none' });
      // Correspondence markers appear once both paths occupy their comparison rows.
      // display suppresses the whole subtree; child visibility="visible" cannot override it.
      setAttributes(settledLayer, { display: settled ? null : 'none', opacity: options.guideOpacity });
      setAttributes(pointPanel, { x: pointX - 18, y: rowZeros[0] - 25, width: sumX - pointX + 36, height: rowZeros[1] - rowZeros[0] + 50 });
      setAttributes(title, { x: offsetX + options.width - 20, y: options.fieldHeight + 16 });
      setAttributes(sumLabel, { x: sumX, y: sumZeroY - 51 });
      setAttributes(pathDifference, { x: startX, y: options.fieldHeight + options.comparisonHeight - 8 });
      pathDifference.textContent = canCompare ? `${comparisonCopy.pathDifference} ${formatDistance(Math.abs(probe.signedPathDifference))}` : '각 위치의 현재 파형';
      const keyY = rowZeros[0] - 42;
      setAttributes(sameDistanceKey, { cx: startX + 4, cy: keyY - 4, opacity: options.guideOpacity, visibility: settled && hasExtraPath && canCompare ? 'visible' : 'hidden' });
      setAttributes(sameDistanceLabel, { x: startX + 14, y: keyY, opacity: options.guideOpacity, 'text-anchor': 'start', visibility: settled && hasExtraPath && canCompare ? 'visible' : 'hidden' });

      const wavelengthPixels = model.wavelength * layout.distanceScale;
      const markEnd = offsetX + options.width - 30, markStart = markEnd - wavelengthPixels;
      const markY = options.fieldHeight + options.comparisonHeight - 11;
      wavelengthMark.render(markStart, markEnd, markY, wavelengthPixels, canCompare);
      setAttributes(wavelengthLabel, { x: (markStart + markEnd) / 2, y: markY - 9 });
      setAttributes(wavelengthLabel, { visibility: canCompare ? 'visible' : 'hidden' });
      wavelengthLabel.textContent = `λ ${formatDistance(model.wavelength)}`;

      const probeScreen = toScreen(model.probe, options.fieldTransform);
      const placements = model.sources.map((_, index) => interpolatePathPlacement(
        toScreen(probe.origins[index], options.fieldTransform),
        probeScreen,
        { x: startX, y: rowZeros[index] },
        progress,
        options.fieldTransform.scale,
        displacementScale,
      ));

      rows.forEach((row, index) => {
        const placement = placements[index];
        const distance = probe.distances[index];
        const displacement = probe.componentDisplacements[index];
        const baselineStart = placePathPoint(0, 0, placement);
        const baselineEnd = placePathPoint(distance, 0, placement);
        const endpoint = placePathPoint(distance, displacement, placement);
        const samples = paths[index];
        const points = samples.distances.map((sampleDistance, sampleIndex) => placePathPoint(sampleDistance, samples.displacements[sampleIndex], placement));
        setLine(row.baseline, baselineStart, baselineEnd);
        setAttributes(row.curve, { d: pathFromPoints(points), opacity: 1 });
        setPoint(row.start, baselineStart);
        setAttributes(row.startNumber, { x: baselineStart.x, y: baselineStart.y });
        setPoint(row.end, endpoint);
        setAttributes(row.group, {
          'data-distance': distance,
          'data-path-scale': placement.distanceScale,
          'data-path-angle': placement.angle,
          'data-start-x': baselineStart.x,
          'data-start-y': baselineStart.y,
          'data-end-displacement': displacement,
          'data-zero-y': rowZeros[index],
        });
        const labelY = rowZeros[index] + (index === 0 ? -28 : 36);
        setAttributes(row.sourceLabel, { x: startX, y: labelY });
        setAttributes(row.distanceLabel, { x: pointX - 30, y: labelY });
        row.distanceLabel.textContent = formatDistance(distance);
        const pastOrigin = Math.hypot(probe.origins[index].x - model.sources[index].position.x, probe.origins[index].y - model.sources[index].position.y) > 1e-6;
        setAttributes(row.start, { fill: pastOrigin ? 'white' : SOURCE_COLORS[index], stroke: SOURCE_COLORS[index] });
        setAttributes(row.startNumber, { fill: pastOrigin ? SOURCE_COLORS[index] : 'white' });
        const pointY = rowZeros[index] - displacement * displacementScale;
        setLine(connections[index], { x: startX + distance * layout.distanceScale, y: pointY }, { x: pointX, y: pointY });
        markers[index].render(pointX, rowZeros[index], displacement, displacementScale, model.sources[index].amplitude);
      });

      // The sampler includes this exact physical distance in the long path.
      const longPath = paths[longIndex];
      let commonSampleIndex = 0;
      for (let index = 1; index < longPath.distances.length; index += 1) {
        if (Math.abs(longPath.distances[index] - commonDistance) < Math.abs(longPath.distances[commonSampleIndex] - commonDistance)) commonSampleIndex = index;
      }
      const commonDisplacement = longPath.displacements[commonSampleIndex];
      const commonX = startX + commonDistance * layout.distanceScale;
      const auxiliaryY = rowZeros[longIndex] - commonDisplacement * displacementScale;
      const shortY = rowZeros[shortIndex] - probe.componentDisplacements[shortIndex] * displacementScale;
      setLine(sameDistanceGuide, { x: commonX, y: shortY }, { x: commonX, y: auxiliaryY });
      const longX = startX + probe.distances[longIndex] * layout.distanceScale;
      const longY = rowZeros[longIndex] - probe.componentDisplacements[longIndex] * displacementScale;
      // The long boundary meets the other row's existing endpoint link; it does
      // not extrapolate that row's wave beyond its actual observation distance.
      setLine(longDistanceGuide, { x: longX, y: shortY }, { x: longX, y: longY });
      setAttributes(longDistanceGuide, { visibility: hasExtraPath && canCompare ? 'visible' : 'hidden' });
      differenceRuler.render(commonX, pointX, (rowZeros[0] + rowZeros[1]) / 2, wavelengthPixels, canCompare,
        hasExtraPath ? { startX: commonX, endX: longX } : undefined);
      setPoint(auxiliaryPoint, { x: commonX, y: auxiliaryY });
      setAttributes(auxiliaryPoint, { stroke: SOURCE_COLORS[longIndex], visibility: hasExtraPath && canCompare ? 'visible' : 'hidden', 'data-source-id': model.sources[longIndex].id, 'data-distance': commonDistance, 'data-displacement': commonDisplacement });
      // Equal paths still share a distance: their two endpoints must remain linked.
      setAttributes(sameDistanceGuide, { visibility: canCompare ? 'visible' : 'hidden' });
      markers[2].render(sumX, sumZeroY, probe.resultantDisplacement, displacementScale, model.sources[0].amplitude + model.sources[1].amplitude);
      zeroLabels.forEach((label, index) => setAttributes(label, { x: (index === 2 ? sumX : pointX) + 17, y: (index === 2 ? sumZeroY : rowZeros[index]) + 4 }));
    },
    destroy() {
      root.remove();
    },
  };
}
