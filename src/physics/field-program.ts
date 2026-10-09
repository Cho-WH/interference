/** Optional GPU contract: a pure field kernel plus read-only frame data, never GL resources.
 * GLSL ES 3.00 must define float fieldValue(vec2 point, bool amplitude).
 * Coordinates and normalization match WaveFrame.sampleField. Textures are RGBA32F.
 * The renderer owns contexts, allocation, palettes and presentation; the backend owns math.
 */
export type FieldProgram = Readonly<{
  key: string;
  glsl: string;
  textures: readonly Readonly<{ name: string; width: number; height: number; data: Float32Array }>[];
  uniforms: Readonly<Record<string, number | readonly number[]>>;
}>;
