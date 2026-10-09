import type { FieldGrid, FieldMode, FieldTransform, PhysicsSnapshot } from '../model/types';
import { toScreen } from '../geometry/layout';

import { formatDistance } from '../ui/copy';
import { svgElement as element } from '../visual/svg';
const colors = ['#51dfce', '#ffb16b'] as const;
function palette(value: number, mode: FieldMode): [number, number, number] {
  const v = Math.min(1, Math.max(mode === 'wave' ? -1 : 0, value));
  const low = mode === 'wave' && v < 0 ? [107, 104, 192] : [59, 202, 190];
  const t = Math.abs(v) ** .82;
  return [0, 1, 2].map((i) => Math.round([13, 34, 47][i] * (1 - t) + low[i] * t)) as [number, number, number];
}
const palettes = {
  wave: Array.from({ length: 513 }, (_, i) => palette(i / 256 - 1, 'wave')),
  amplitude: Array.from({ length: 513 }, (_, i) => palette(i / 512, 'amplitude')),
};

export function createFieldView(canvas: HTMLCanvasElement, svg: SVGSVGElement) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is required.');
  const buffer = document.createElement('canvas');
  const bufferContext = buffer.getContext('2d', { alpha: false })!;
  let pixels: ImageData | undefined;
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
  svg.append(pathGroup, scaleGroup, ...sources, probe);
  let previousGrid: FieldGrid | undefined;
  let previousMode: FieldMode | undefined;
  return {
    render(snapshot: PhysicsSnapshot, grid: FieldGrid, mode: FieldMode, transform: FieldTransform) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(transform.width * dpr);
      const pixelHeight = Math.round(transform.height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      svg.setAttribute('data-distance-scale', String(transform.scale));
      svg.setAttribute('data-wavelength-pixels', String(snapshot.model.wavelength * transform.scale));
      svg.setAttribute('viewBox', `0 0 ${transform.width} ${transform.height}`);
      // The sampler owns the physical values; this view only maps them to colors.
      if (grid !== previousGrid || mode !== previousMode) {
        if (buffer.width !== grid.columns || buffer.height !== grid.rows || !pixels) {
          buffer.width = grid.columns; buffer.height = grid.rows;
          pixels = bufferContext.createImageData(grid.columns, grid.rows);
        }
        const palette = palettes[mode];
        for (let i = 0; i < grid.values.length; i++) {
          const index = Math.max(0, Math.min(512, Math.round(mode === 'wave' ? grid.values[i] * 256 + 256 : grid.values[i] * 512)));
          const color = palette[index];
          pixels.data[i * 4] = color[0]; pixels.data[i * 4 + 1] = color[1]; pixels.data[i * 4 + 2] = color[2]; pixels.data[i * 4 + 3] = 255;
        }
        bufferContext.putImageData(pixels, 0, 0);
        previousGrid = grid; previousMode = mode;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = '#0d222f'; context.fillRect(0, 0, transform.width, transform.height);
      context.imageSmoothingEnabled = true;
      context.drawImage(buffer, transform.offsetX, transform.offsetY, snapshot.model.bounds.width * transform.scale, snapshot.model.bounds.height * transform.scale);
      const p = toScreen(snapshot.model.probe, transform);
      probe.setAttribute('transform', `translate(${p.x},${p.y})`);
      snapshot.model.sources.forEach((source, i) => {
        const s = toScreen(source.position, transform);
        sources[i].setAttribute('transform', `translate(${s.x},${s.y})`);
        for (const [key, value] of Object.entries({ x1: s.x, y1: s.y, x2: p.x, y2: p.y })) paths[i].setAttribute(key, String(value));
        labels[i].group.setAttribute('transform', `translate(${s.x + (p.x - s.x) * .46},${s.y + (p.y - s.y) * .46 + (i ? 18 : -18)})`);
        labels[i].text.textContent = `${i + 1} · ${formatDistance(snapshot.probe.distances[i])}`;
      });
      const sx = transform.offsetX + 20, sy = transform.offsetY + snapshot.model.bounds.height * transform.scale - 20;
      const length = .1 * transform.scale;
      scaleLine.setAttribute('d', `M${sx},${sy - 4}v8m0,-4h${length}m0,-4v8`);
      scaleText.setAttribute('x', String(sx + length / 2)); scaleText.setAttribute('y', String(sy - 8));
    },
    destroy() { svg.replaceChildren(); },
  };
}
