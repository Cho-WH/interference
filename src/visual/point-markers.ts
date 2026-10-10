import { setAttributes, svgElement, svgText } from './svg';

/** Shared source badge. Scale the circle, number and stroke as one object. */
export function createSourceBadge(parent: SVGElement, glyph: string, color: string) {
  const group = svgElement('g', { 'data-source-badge': glyph, 'pointer-events': 'none' }, parent);
  const circle = svgElement('circle', {}, group);
  const text = svgText(group, glyph, { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 800 });
  // Local size is part of the badge, not a screen annotation CSS rule.
  function render(x: number, y: number, scale = 1, historical = false, compact = false) {
    setAttributes(group, { transform: `translate(${x},${y}) scale(${scale})` });
    setAttributes(circle, { r: compact ? 7 : 12, 'stroke-width': compact ? 1.8 : 2.5,
      fill: historical ? 'white' : compact ? color : '#102a37', stroke: color });
    text.style.fontSize = `${compact ? 9 : 12}px`;
    setAttributes(text, { fill: historical ? color : 'white' });
  }
  render(0, 0);
  return { group, render };
}

/** P denotes a fixed observation position, separate from displacement points. */
export function createProbeMarker(parent: SVGElement, color = '#fff') {
  const group = svgElement('g', { 'data-probe-marker': '', 'pointer-events': 'none' }, parent);
  svgElement('circle', { r: 12, fill: '#102a37', 'fill-opacity': .3, stroke: color, 'stroke-width': 2.5 }, group);
  svgElement('circle', { r: 1.8, fill: '#f6faf8', stroke: '#12212b', 'stroke-width': 1.2 }, group);
  const label = svgText(group, 'P', { x: 19, y: 5, fill: color, 'font-style': 'italic', 'font-weight': 400,
    'paint-order': 'stroke', stroke: '#12212b', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'data-probe-label': '' });
  label.style.fontFamily = 'Cambria, Georgia, serif'; label.style.fontSize = '15px';
  return { group, label };
}
