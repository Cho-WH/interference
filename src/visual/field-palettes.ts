import type { FieldMode } from '../model/types';

type RGB = readonly [number, number, number];
export type PaletteId = 'contrast' | 'water' | 'silver';
type Palette = { id: PaletteId; name: string; description: string; negative: RGB; zero: RGB; positive: RGB; exponent: number };

export const FIELD_PALETTES: readonly Palette[] = [
  { id: 'contrast', name: '간섭 대비', description: '양쪽 변위를 밝게 · 마디선 관찰', negative: [107, 104, 192], zero: [13, 34, 47], positive: [59, 202, 190], exponent: .82 },
  { id: 'water', name: '푸른 물결', description: '어두운 골에서 밝은 마루로', negative: [18, 55, 76], zero: [57, 140, 175], positive: [220, 247, 250], exponent: 1 },
  { id: 'silver', name: '은빛 물결', description: '밝기 차이로 보는 물결', negative: [39, 58, 72], zero: [135, 155, 165], positive: [241, 247, 249], exponent: 1 },
];

/** Display-only transfer functions. Both canvas and legends use these same samples. */
function color(p: Palette, value: number, mode: FieldMode): RGB {
  const v = Math.max(mode === 'wave' ? -1 : 0, Math.min(1, value));
  const start = mode === 'amplitude' && p.id !== 'contrast' ? p.negative : p.zero;
  const end = v < 0 ? p.negative : p.positive;
  const t = Math.abs(v) ** p.exponent;
  const channel = (i: number) => Math.round(start[i] * (1 - t) + end[i] * t);
  return [channel(0), channel(1), channel(2)];
}
const tables = new Map(FIELD_PALETTES.map(p => [p.id, {
  wave: Array.from({ length: 513 }, (_, i) => color(p, i / 256 - 1, 'wave')),
  amplitude: Array.from({ length: 513 }, (_, i) => color(p, i / 512, 'amplitude')),
}]));
export const paletteTable = (id: PaletteId, mode: FieldMode) => tables.get(id)![mode];
export const paletteGradient = (id: PaletteId, mode: FieldMode) => {
  const table = paletteTable(id, mode);
  return `linear-gradient(90deg, ${Array.from({ length: 17 }, (_, i) => `rgb(${table[i * 32].join(',')}) ${i / 16 * 100}%`).join(', ')})`;
};
