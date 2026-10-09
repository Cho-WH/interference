import { setAttributes, svgElement } from './svg';

/** A fixed measurement rail with major λ ticks and minor λ/2 ticks. */
export function createWavelengthRuler(parent: SVGElement, attribute: string) {
  const mark = svgElement('g', { [attribute]: '' }, parent);
  const band = svgElement('rect', { height: 8, rx: 3, fill: '#f0f4f2' }, mark);
  const highlight = svgElement('rect', { height: 8, rx: 2, fill: '#bdd7cc', 'data-ruler-highlight': '' }, mark);
  const rail = svgElement('path', { stroke: '#a8beb5', fill: 'none', 'stroke-width': .75 }, mark);
  const divisions = svgElement('path', {
    'data-ruler-divisions': '', stroke: '#64877d', fill: 'none', 'stroke-width': 1, 'stroke-linecap': 'round',
  }, mark);
  const halves = svgElement('path', {
    'data-ruler-halves': '', stroke: '#64877d', fill: 'none', 'stroke-width': .8, 'stroke-linecap': 'round',
  }, mark);
  return {
    render(startX: number, endX: number, y: number, wavelengthPixels: number, visible: boolean, emphasized?: Readonly<{ startX: number; endX: number }>) {
      const length = Math.max(0, endX - startX);
      const half = wavelengthPixels / 2;
      let ticks = '', minorTicks = '';
      if (half > 0) {
        for (let tick = 0; tick * half <= length + 1e-7; tick++) {
          const x = startX + tick * half;
          if (tick % 2 === 0) ticks += `M${x},${y - 3}v6`;
          else minorTicks += `M${x},${y - 1.5}v3`;
        }
      }
      setAttributes(band, { x: startX, y: y - 4, width: length });
      const highlightStart = Math.max(startX, emphasized?.startX ?? startX);
      const highlightEnd = Math.min(endX, emphasized?.endX ?? startX);
      setAttributes(highlight, { x: highlightStart, y: y - 4, width: Math.max(0, highlightEnd - highlightStart), visibility: visible && highlightEnd > highlightStart ? 'visible' : 'hidden' });
      setAttributes(rail, { d: `M${startX},${y}H${endX}` });
      setAttributes(divisions, { d: ticks });
      setAttributes(halves, { d: minorTicks });
      setAttributes(mark, {
        visibility: visible ? 'visible' : 'hidden', 'data-pixel-length': length,
        'data-wavelength-pixels': wavelengthPixels, 'data-zero-y': y,
      });
    },
  };
}
