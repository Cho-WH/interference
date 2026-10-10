import { createWavelengthRuler } from './wavelength-ruler';
import { setAttributes, svgElement, svgText } from './svg';
import { formatSettingDistance } from '../ui/copy';

/** Two stationary references spanning the very same extra physical distance. */
export function createWavelengthComparison(parent: SVGElement) {
  const group = svgElement('g', { 'data-wavelength-comparison': '', display: 'none' }, parent);
  const rows = ['previous', 'current'].map(id => {
    const ruler = createWavelengthRuler(group, 'data-wavelength-' + id);
    const label = svgText(group, '', { 'data-wavelength-reference-label': id, fill: '#47646d', 'font-weight': 600 });
    const ratio = svgText(group, '', { 'data-wavelength-reference-ratio': id, fill: '#193543', 'font-weight': 700 });
    return { ruler, label, ratio };
  });
  return {
    render(options: { startX: number; endX: number; centerY: number; distanceScale: number;
      previousWavelength?: number; currentWavelength: number; visible: boolean; compact: boolean }) {
      const { startX, endX, centerY, distanceScale, previousWavelength, currentWavelength, visible, compact } = options;
      const show = visible && previousWavelength !== undefined && previousWavelength > 0;
      setAttributes(group, { display: show ? null : 'none' });
      if (!show) return;
      const delta = Math.max(0, endX - startX) / distanceScale;
      setAttributes(group, { 'data-path-difference': delta, 'data-distance-scale': distanceScale });
      [previousWavelength!, currentWavelength].forEach((wavelength, index) => {
        const y = centerY + (index ? 28 : -28), symbol = index ? 'λ' : 'λ₀';
        const row = rows[index], ratio = delta / wavelength;
        const multiple = Math.abs(ratio - .5) < 1e-8 ? '½' : ratio.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
        row.ruler.render(startX, endX, y, wavelength * distanceScale, true, { startX, endX });
        row.label.textContent = `${index ? '지금' : '이전'} ${symbol} ${formatSettingDistance(wavelength)}`;
        row.ratio.textContent = `${multiple}${symbol}`;
        setAttributes(row.label, { x: Math.max(24, startX - (compact ? 130 : 180)), y: y + 6, 'font-size': compact ? 15 : 20 });
        setAttributes(row.ratio, { x: endX + 12, y: y + 6, 'font-size': compact ? 17 : 22, 'data-ratio': ratio });
      });
    },
  };
}
