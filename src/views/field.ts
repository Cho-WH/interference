import type { FieldMode, FieldTransform, SourcePair, Vec2 } from '../model/types';
import type { WaveFrame } from '../physics/engine';
import { toScreen } from '../geometry/layout';

import { formatDistance } from '../ui/copy';
import { svgElement as element } from '../visual/svg';
import type { PaletteId } from '../visual/field-palettes';
import { createFieldSurface } from '../rendering/field-surface';
const colors = ['#51dfce', '#ffb16b'] as const;

export function createFieldView(canvas: HTMLCanvasElement, svg: SVGSVGElement, invalidate: () => void) {
  const surface = createFieldSurface(canvas, invalidate);
  const pathGroup = element('g', { 'aria-hidden': 'true' });
  const paths = colors.map((color, i) => {
    const line = element('line', { 'data-spatial-path': `source-${i + 1}`, stroke: color, 'stroke-width': '1.8', 'stroke-dasharray': i ? '7 4' : 'none', opacity: '.9' });
    pathGroup.append(line);
    return line;
  });
  const labels = colors.map((color) => {
    const group = element('g');
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
    const hit = element('circle', { r: '24', fill: 'transparent' });
    const ring = element(probe ? 'rect' : 'circle', probe
      ? { x: '-13', y: '-13', width: '26', height: '26', rx: '8', fill: '#f9fbfd', stroke: '#fff', 'stroke-width': '2' }
      : { r: '12', fill: '#102a37', stroke: color, 'stroke-width': '2.5' });
    const text = element('text', { y: '4.5', 'text-anchor': 'middle', fill: probe ? '#102a37' : color, 'font-size': '12', 'font-weight': '800', 'pointer-events': 'none' });
    text.textContent = glyph;
    const focus = element('circle', { class: 'handle-focus', r: '20', fill: 'none', stroke: '#fff', 'stroke-dasharray': '3 3', 'stroke-width': '1.5' });
    group.append(hit, focus, ring, text);
    return group;
  }
  const sources = [handle('source-1', '파원 1. 위아래 방향키로 파원 간격 조절', '1', colors[0]), handle('source-2', '파원 2. 위아래 방향키로 파원 간격 조절', '2', colors[1])];
  const probe = handle('probe', '관측점 P. 방향키로 이동', 'P', '#fff', true);
  const origins = colors.map((color, i) => element('circle', { r: 5, fill: '#102a37', stroke: color, 'stroke-width': 2, 'data-emission-origin': `source-${i + 1}`, 'pointer-events': 'none' }));
  const targets = colors.map((color, i) => element('circle', { r: 15, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '4 3', 'data-source-target': `source-${i + 1}`, 'pointer-events': 'none' }));
  svg.append(pathGroup, scaleGroup, ...origins, ...targets, ...sources, probe);
  return {
    rate: surface.rate,
    presented: surface.presented,
    render(frame: WaveFrame, mode: FieldMode, transform: FieldTransform, paletteId: PaletteId, playing: boolean, targetPositions?: SourcePair<Vec2>) {
      const { snapshot } = frame;
      surface.render(frame, mode, transform, paletteId, playing);
      svg.setAttribute('data-distance-scale', String(transform.scale));
      svg.setAttribute('data-time-seconds', String(snapshot.clock.timeSeconds));
      svg.setAttribute('data-moving', String(snapshot.moving));
      svg.setAttribute('data-steady', String(snapshot.steady));
      svg.setAttribute('data-field-mode', mode);
      svg.setAttribute('data-wavelength-pixels', String(snapshot.model.wavelength * transform.scale));
      svg.setAttribute('viewBox', `0 0 ${transform.width} ${transform.height}`);
      const p = toScreen(snapshot.model.probe, transform);
      probe.setAttribute('transform', `translate(${p.x},${p.y})`);
      snapshot.model.sources.forEach((source, i) => {
        const s = toScreen(source.position, transform);
        const origin = toScreen(snapshot.probe.origins[i], transform);
        const target = targetPositions ? toScreen(targetPositions[i], transform) : s;
        sources[i].setAttribute('transform', `translate(${s.x},${s.y})`);
        sources[i].setAttribute('data-world-y', String(source.position.y));
        for (const [key, value] of Object.entries({ cx: origin.x, cy: origin.y, visibility: Math.hypot(origin.x - s.x, origin.y - s.y) > 2 ? 'visible' : 'hidden' })) origins[i].setAttribute(key, String(value));
        for (const [key, value] of Object.entries({ cx: target.x, cy: target.y, visibility: targetPositions ? 'visible' : 'hidden' })) targets[i].setAttribute(key, String(value));
        for (const [key, value] of Object.entries({ x1: origin.x, y1: origin.y, x2: p.x, y2: p.y })) paths[i].setAttribute(key, String(value));
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
