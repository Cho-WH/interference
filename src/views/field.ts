import type { FieldMode, FieldTransform, SourcePair, Vec2 } from '../model/types';
import type { WaveFrame } from '../physics/engine';
import { toScreen } from '../geometry/layout';
import { FIELD_HANDLE_HIT_RADIUS, sourceGapHandle } from '../geometry/field-handles';

import { formatDistance } from '../ui/copy';
import { createDisplacementMarker, pathFromPoints, setAttributes, setLine, SUM_COLOR, svgElement as element } from '../visual/svg';
import type { PaletteId } from '../visual/field-palettes';
import { createFieldSurface } from '../rendering/field-surface';
const colors = ['#51dfce', '#ffb16b'] as const;

/** Optional presentation policy; omitted options preserve the ordinary explorer. */
export type FieldDisplayOptions = Readonly<{
  surface?: boolean;
  paths?: boolean;
  distances?: boolean;
  scale?: boolean;
  sources?: boolean;
  probe?: boolean;
  inputEnabled?: boolean;
  probeInput?: boolean;
  sourceInput?: boolean;
  localProbeResult?: boolean;
  displacementScale?: number;
}>;

export function createFieldView(canvas: HTMLCanvasElement, svg: SVGSVGElement, invalidate: () => void, report?: (event: string, error?: unknown) => void) {
  const surface = createFieldSurface(canvas, invalidate, report);
  const pathGroup = element('g', { 'aria-hidden': 'true' });
  const paths = colors.map((color, i) => {
    const line = element('line', { 'data-spatial-path': `source-${i + 1}`, stroke: color, 'stroke-width': '1.8', 'stroke-dasharray': i ? '7 4' : 'none', opacity: '.9' });
    pathGroup.append(line);
    return line;
  });
  const labels = colors.map((color) => {
    const group = element('g', { class: 'path-distance-label' });
    const bg = element('rect', { x: '-38', y: '-12', width: '76', height: '24', rx: '7', fill: '#102a37', opacity: '.92' });
    const text = element('text', { 'text-anchor': 'middle', y: '5', fill: color, 'font-size': '12', 'font-weight': '650' });
    group.append(bg, text); pathGroup.append(group);
    return { group, text };
  });
  const scaleGroup = element('g', { 'aria-hidden': 'true' });
  const scaleLine = element('path', { stroke: '#b1c8ce', fill: 'none', 'stroke-width': '1.5' });
  const scaleText = element('text', { fill: '#b1c8ce', 'font-size': '11', 'text-anchor': 'middle' });
  scaleText.textContent = '10 cm'; scaleGroup.append(scaleLine, scaleText);
  function handle(id: string, label: string, glyph: string, color: string, probe = false) {
    const group = element('g', { class: 'interactive-handle', 'data-handle': id, tabindex: '0', role: 'button', 'aria-label': label, 'aria-keyshortcuts': 'ArrowUp ArrowDown ArrowLeft ArrowRight' });
    group.style.pointerEvents = 'all';
    const hit = element('circle', { r: FIELD_HANDLE_HIT_RADIUS, fill: 'transparent' });
    const focus = element('circle', { class: 'handle-focus', r: '20', fill: 'none', stroke: '#fff', 'stroke-dasharray': '3 3', 'stroke-width': '1.5' });
    const ring = element('circle', { r: 12, fill: '#102a37', 'fill-opacity': probe ? .30 : 1, stroke: color, 'stroke-width': 2.5 });
    group.append(hit, focus, ring);
    if (probe) {
      // Share the source handle's circle; a translucent interior keeps the field
      // visible while the small center dot marks the exact observation point.
      const center = element('circle', { r: 1.8, fill: '#f6faf8', stroke: '#12212b', 'stroke-width': 1.2, 'pointer-events': 'none' });
      const text = element('text', { x: 19, y: 5, fill: '#f6faf8', 'font-style': 'italic', 'font-size': 15, 'font-weight': 400, 'paint-order': 'stroke', stroke: '#12212b', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'pointer-events': 'none', 'data-probe-label': '' });
      text.style.fontFamily = 'Cambria, Georgia, serif';
      text.textContent = glyph;
      group.append(center, text);
    } else {
      const text = element('text', { y: '4.5', 'text-anchor': 'middle', fill: color, 'font-size': '12', 'font-weight': '800', 'pointer-events': 'none' });
      text.textContent = glyph;
      group.append(text);
    }
    return group;
  }
  const sources = [handle('source-1', '파원 1. 위아래 방향키로 파원 간격 조절', '1', colors[0]), handle('source-2', '파원 2. 위아래 방향키로 파원 간격 조절', '2', colors[1])];
  const probe = handle('probe', '관측점 P. 방향키로 이동', 'P', '#fff', true);
  const probeLabel = probe.querySelector<SVGTextElement>('[data-probe-label]')!;
  const gap = handle('source-gap', '두 파원 간격. 위로 끌면 넓어지고 아래로 끌면 좁아져요.', '↕', '#e9f6f3');
  const gapLabel = element('text', { y: '31', 'text-anchor': 'middle', fill: '#fff', 'font-size': 10, 'paint-order': 'stroke', stroke: '#102a37', 'stroke-width': 3, 'pointer-events': 'none' });
  gapLabel.textContent = '간격'; gap.append(gapLabel);
  const probeBounds = element('path', { fill: 'none', stroke: '#e5f2ef', 'stroke-width': 1, 'stroke-dasharray': '3 6', 'stroke-linecap': 'round', 'pointer-events': 'none', 'data-probe-bounds': '', visibility: 'hidden' });
  const origins = colors.map((color, i) => element('circle', { r: 5, fill: '#102a37', stroke: color, 'stroke-width': 2, 'data-emission-origin': `source-${i + 1}`, 'pointer-events': 'none' }));
  const targets = colors.map((color, i) => element('circle', { r: 15, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '4 3', 'data-source-target': `source-${i + 1}`, 'pointer-events': 'none' }));
  const localResult = element('g', { 'data-local-probe-result': '', 'aria-hidden': 'true', display: 'none' });
  const localLink = element('line', { stroke: '#c4d5df', 'stroke-width': 1.5, 'stroke-dasharray': '4 5' });
  localResult.append(localLink);
  const localMarker = createDisplacementMarker(localResult, SUM_COLOR, 'local-probe-result');
  const localLabel = element('text', { 'font-size': 20, 'text-anchor': 'middle', fill: '#fff', 'paint-order': 'stroke', stroke: '#152b3b', 'stroke-width': 3 });
  localLabel.textContent = 'P의 합성변위'; localResult.append(localLabel);
  svg.append(probeBounds, pathGroup, scaleGroup, ...origins, ...targets, ...sources, gap, probe, localResult);
  return {
    rate: surface.rate,
    presented: surface.presented,
    render(frame: WaveFrame, mode: FieldMode, transform: FieldTransform, paletteId: PaletteId, playing: boolean, targetPositions?: SourcePair<Vec2>, probeOutline?: readonly Vec2[], display: FieldDisplayOptions = {}) {
      const { snapshot } = frame;
      if (display.surface !== false) surface.render(frame, mode, transform, paletteId, playing);
      svg.setAttribute('data-distance-scale', String(transform.scale));
      svg.setAttribute('data-time-seconds', String(snapshot.clock.timeSeconds));
      svg.setAttribute('data-moving', String(snapshot.moving));
      svg.setAttribute('data-steady', String(snapshot.steady));
      svg.setAttribute('data-field-mode', mode);
      svg.setAttribute('data-wavelength-pixels', String(snapshot.model.wavelength * transform.scale));
      svg.setAttribute('viewBox', `0 0 ${transform.width} ${transform.height}`);
      const p = toScreen(snapshot.model.probe, transform);
      setAttributes(pathGroup, { display: display.paths === false ? 'none' : null });
      setAttributes(scaleGroup, { display: display.scale === false ? 'none' : null });
      setAttributes(probe, { display: display.probe === false ? 'none' : null, tabindex: display.inputEnabled === false ? -1 : 0 });
      const probeEnabled = display.inputEnabled !== false && display.probeInput !== false;
      const sourceEnabled = display.inputEnabled !== false && display.sourceInput !== false;
      probe.style.pointerEvents = probeEnabled ? 'all' : 'none';
      probe.setAttribute('tabindex', probeEnabled && display.probe !== false ? '0' : '-1');
      labels.forEach(label => setAttributes(label.group, { display: display.distances === false ? 'none' : null }));
      sources.forEach(source => {
        setAttributes(source, { display: display.sources === false ? 'none' : null, tabindex: display.inputEnabled === false ? -1 : 0 });
        source.style.pointerEvents = sourceEnabled ? 'all' : 'none';
        source.setAttribute('tabindex', sourceEnabled && display.sources !== false ? '0' : '-1');
      });
      [...origins, ...targets].forEach(marker => setAttributes(marker, { display: display.sources === false ? 'none' : null }));
      setAttributes(localResult, { display: display.localProbeResult ? null : 'none' });
      if (display.localProbeResult) {
        const maxAmplitude = snapshot.model.sources[0].amplitude + snapshot.model.sources[1].amplitude;
        const displacementScale = display.displacementScale ?? (maxAmplitude ? 50 / maxAmplitude : 1);
        const x = p.x + 110 < transform.width - 70 ? p.x + 110 : p.x - 110;
        setLine(localLink, p, { x, y: p.y });
        localMarker.render(x, p.y, snapshot.probe.resultantDisplacement, displacementScale, maxAmplitude);
        setAttributes(localLabel, { x, y: p.y + maxAmplitude * displacementScale + 30 });
      }
      probeBounds.setAttribute('visibility', probeOutline ? 'visible' : 'hidden');
      if (probeOutline) probeBounds.setAttribute('d', pathFromPoints(probeOutline.map(point => toScreen(point, transform))) + 'Z');
      const gapPoint = sourceGapHandle(snapshot.model, transform);
      if (gapPoint) gap.setAttribute('transform', `translate(${gapPoint.x},${gapPoint.y})`);
      gap.setAttribute('visibility', gapPoint ? 'visible' : 'hidden');
      gap.setAttribute('tabindex', gapPoint ? '0' : '-1');
      setAttributes(gap, { display: display.sources === false || !sourceEnabled ? 'none' : null, tabindex: sourceEnabled && gapPoint ? 0 : -1 });
      probe.setAttribute('transform', `translate(${p.x},${p.y})`);
      const labelOnLeft = p.x > transform.width - 37;
      probeLabel.setAttribute('x', labelOnLeft ? '-19' : '19');
      probeLabel.setAttribute('text-anchor', labelOnLeft ? 'end' : 'start');
      snapshot.model.sources.forEach((source, i) => {
        const s = toScreen(source.position, transform);
        const origin = toScreen(snapshot.probe.origins[i], transform);
        const target = targetPositions ? toScreen(targetPositions[i], transform) : s;
        sources[i].setAttribute('transform', `translate(${s.x},${s.y})`);
        sources[i].setAttribute('data-world-y', String(source.position.y));
        setAttributes(origins[i], { cx: origin.x, cy: origin.y, visibility: Math.hypot(origin.x - s.x, origin.y - s.y) > 2 ? 'visible' : 'hidden' });
        setAttributes(targets[i], { cx: target.x, cy: target.y, visibility: targetPositions ? 'visible' : 'hidden' });
        setLine(paths[i], origin, p);
        labels[i].group.setAttribute('transform', `translate(${origin.x + (p.x - origin.x) * .46},${origin.y + (p.y - origin.y) * .46 + (i ? 18 : -18)})`);
        labels[i].text.textContent = `${i + 1} · ${formatDistance(snapshot.probe.distances[i])}`;
      });
      const sx = transform.offsetX + 20, sy = transform.offsetY + snapshot.model.bounds.height * transform.scale - 20;
      const length = .1 * transform.scale;
      scaleLine.setAttribute('d', `M${sx},${sy - 4}v8m0,-4h${length}m0,-4v8`);
      scaleText.setAttribute('x', String(sx + length / 2)); scaleText.setAttribute('y', String(sy - 8));
    },
    destroy() { surface.destroy(); svg.replaceChildren(); },
  };
}
