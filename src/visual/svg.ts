import type { Vec2 } from '../model/types';

export const SOURCE_COLORS = ['var(--source-1, #0d9488)', 'var(--source-2, #ea7b32)'] as const;
export const SUM_COLOR = 'var(--sum, #7758c7)';

type SvgAttributeValue = string | number | boolean | null | undefined;
export type SvgAttributes = Record<string, SvgAttributeValue>;

export function setAttributes(element: SVGElement, attributes: SvgAttributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
}

export function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: SvgAttributes = {},
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  setAttributes(element, attributes);
  parent?.append(element);
  return element;
}

export function setLine(element: SVGLineElement, start: Vec2, end: Vec2): void {
  setAttributes(element, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
}

export function setPoint(element: SVGCircleElement, point: Vec2): void {
  setAttributes(element, { cx: point.x, cy: point.y });
}

export function pathFromPoints(points: readonly Vec2[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ');
}

export function svgText(parent: SVGElement, text: string, attributes: SvgAttributes = {}): SVGTextElement {
  const element = svgElement('text', {
    fill: 'var(--ink, #26373e)',
    'font-size': 13,
    'font-family': 'inherit',
    ...attributes,
  }, parent);
  element.textContent = text;
  return element;
}

export function createDisplacementMarker(parent: SVGElement, color: string, label: string) {
  const group = svgElement('g', { 'data-marker': label }, parent);
  const range = svgElement('line', { stroke: color, 'stroke-opacity': 0.12, 'stroke-width': 13, 'stroke-linecap': 'round' }, group);
  const zero = svgElement('line', { stroke: 'var(--muted, #84939b)', 'stroke-width': 1.2 }, group);
  const bar = svgElement('line', { stroke: color, 'stroke-width': 5, 'stroke-opacity': 0.55, 'stroke-linecap': 'round', 'data-displacement-bar': label }, group);
  const dot = svgElement('circle', { r: label === 'sum' ? 7 : 6, fill: color, stroke: 'white', 'stroke-width': 2, 'data-displacement-point': label }, group);

  return {
    group,
    render(x: number, zeroY: number, displacement: number, displacementScale: number, maxAmplitude: number,
      appearance?: Readonly<{ scale: number; pointRadius?: number; barWidth?: number }>) {
      const scale = appearance?.scale ?? 1;
      const pointY = zeroY - displacement * displacementScale;
      setLine(range, { x, y: zeroY - maxAmplitude * displacementScale }, { x, y: zeroY + maxAmplitude * displacementScale });
      setLine(zero, { x: x - 12 * scale, y: zeroY }, { x: x + 12 * scale, y: zeroY });
      setLine(bar, { x, y: zeroY }, { x, y: pointY });
      setPoint(dot, { x, y: pointY });
      setAttributes(range, { 'stroke-width': 13 * scale });
      setAttributes(zero, { 'stroke-width': 1.2 * scale });
      setAttributes(bar, { 'stroke-width': (appearance?.barWidth ?? 5) * scale });
      setAttributes(dot, { r: (appearance?.pointRadius ?? (label === 'sum' ? 7 : 6)) * scale, 'stroke-width': 2 * scale });
      setAttributes(group, { 'data-zero-y': zeroY, 'data-displacement': displacement, 'data-displacement-scale': displacementScale });
    },
  };
}
