import type { Bounds, FieldMode, FieldTransform, Vec2 } from '../model/types';
import type { FieldProgram } from '../physics/field-program';
import { paletteTable, type PaletteId } from '../visual/field-palettes';

const vertex = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const present = `#version 300 es
precision highp float;
uniform sampler2D uImage;
in vec2 uv; out vec4 color;
void main() { color = texture(uImage, uv); }
`;
const fragment = (kernel: string) => `#version 300 es
precision highp float;
precision highp sampler2D;
uniform vec2 uBounds;
uniform vec2 uOrigin;
uniform vec2 uGrid;
uniform float uAmplitude;
uniform sampler2D uPalette;
out vec4 color;
${kernel}
void main() {
  vec2 fraction = (gl_FragCoord.xy - 0.5) / max(vec2(1.0), uGrid - 1.0);
  vec2 point = uOrigin + vec2(fraction.x, 1.0 - fraction.y) * uBounds;
  float value = fieldValue(point, uAmplitude > 0.5);
  float index = uAmplitude > 0.5 ? value * 512.0 : value * 256.0 + 256.0;
  color = texelFetch(uPalette, ivec2(int(clamp(floor(index + 0.5), 0.0, 512.0)), 0), 0);
}`;

type Texture = { texture: WebGLTexture; width: number; height: number; data?: Float32Array };
export type FieldDraw = {
  bounds: Bounds; transform: FieldTransform; columns: number; rows: number;
  origin?: Vec2;
  mode: FieldMode; palette: PaletteId; dpr: number; redraw: boolean;
};

/** Owns only GPU resources. No readPixels/finish or CPU copy of the computed field. */
export function createWebGLField(canvas: HTMLCanvasElement) {
  let context: WebGL2RenderingContext | null;
  try { context = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true }); }
  catch { return undefined; }
  if (!context) return undefined;
  const gl = context;
  const programs = new Set<WebGLProgram>(), textures = new Set<WebGLTexture>();
  let framebuffer: WebGLFramebuffer | null = null;
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  const pending: WebGLQuery[] = [];
  function destroy() {
    for (const q of pending) gl.deleteQuery(q);
    for (const p of programs) gl.deleteProgram(p);
    for (const t of textures) gl.deleteTexture(t);
    gl.deleteFramebuffer(framebuffer);
  }
  function compile(source: string, type: number) {
    const shader = gl!.createShader(type);
    if (!shader) throw new Error('Shader allocation failed');
    gl!.shaderSource(shader, source); gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader); gl!.deleteShader(shader); throw new Error(message ?? 'Shader compilation failed');
    }
    return shader;
  }
  function program(source: string) {
    const v = compile(vertex, gl!.VERTEX_SHADER);
    let f: WebGLShader | undefined;
    try {
      f = compile(source, gl!.FRAGMENT_SHADER);
      const p = gl!.createProgram(); if (!p) throw new Error('Program allocation failed');
      programs.add(p); gl!.attachShader(p, v); gl!.attachShader(p, f); gl!.linkProgram(p);
      if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) throw new Error(gl!.getProgramInfoLog(p) ?? 'Shader link failed');
      return p;
    } finally { gl!.deleteShader(v); if (f) gl!.deleteShader(f); }
  }
  function texture(linear = false): Texture {
    const t = gl!.createTexture(); if (!t) throw new Error('Texture allocation failed');
    textures.add(t); gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, linear ? gl!.LINEAR : gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, linear ? gl!.LINEAR : gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return { texture: t, width: 0, height: 0 };
  }
  try {
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.disable(gl.DITHER); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const output = texture(true), palette = texture(), inputs = new Map<string, Texture>();
    framebuffer = gl.createFramebuffer(); if (!framebuffer) throw new Error('Framebuffer allocation failed');
    const displayProgram = program(present);
    const displayImage = gl.getUniformLocation(displayProgram, 'uImage');
    let fieldProgram: WebGLProgram | undefined, kernelKey = '', paletteKey = '';
    let locations = new Map<string, WebGLUniformLocation | null>();
    function location(name: string) {
      if (!locations.has(name)) locations.set(name, gl!.getUniformLocation(fieldProgram!, name));
      return locations.get(name)!;
    }
    function uniform(name: string, value: number | readonly number[]) {
      const loc = location(name);
      if (typeof value === 'number') gl!.uniform1f(loc, value);
      else if (value.length === 2) gl!.uniform2fv(loc, value);
      else if (value.length === 3) gl!.uniform3fv(loc, value);
      else if (value.length === 4) gl!.uniform4fv(loc, value);
    }
    return {
      get available() { return !gl.isContextLost(); },
      /** Results are polled on later frames, never awaited or synchronized. */
      takeGpuTime(): number | undefined {
        if (!timer || !pending.length || gl.isContextLost()) return undefined;
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { for (const q of pending) gl.deleteQuery(q); pending.length = 0; return undefined; }
        let result: number | undefined;
        while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
          const q = pending.shift()!; result = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6; gl.deleteQuery(q);
        }
        return result;
      },
      render(packet: FieldProgram, draw: FieldDraw) {
        const { columns, rows, bounds, transform, dpr, mode } = draw;
        if (gl.isContextLost()) throw new Error('WebGL context lost');
        let redraw = draw.redraw;
        if (kernelKey !== packet.key) {
          const next = program(fragment(packet.glsl));
          if (fieldProgram) { gl.deleteProgram(fieldProgram); programs.delete(fieldProgram); }
          fieldProgram = next; kernelKey = packet.key; locations = new Map(); redraw = true;
        }
        if (output.width !== columns || output.height !== rows) {
          if (columns > maxTexture || rows > maxTexture) throw new Error('Field exceeds texture limit');
          gl.bindTexture(gl.TEXTURE_2D, output.texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, columns, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output.texture, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || gl.getError() !== gl.NO_ERROR) throw new Error('Field allocation failed');
          output.width = columns; output.height = rows; redraw = true;
        }
        const width = Math.max(1, Math.round(transform.width * dpr)), height = Math.max(1, Math.round(transform.height * dpr));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const query = redraw && timer && pending.length < 4 ? gl.createQuery() : null;
        if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query);
        try {
          if (redraw) {
            gl.useProgram(fieldProgram!);
            let unit = 0;
            for (const input of packet.textures) {
              if (input.width > maxTexture || input.height > maxTexture) throw new Error('History exceeds texture limit');
              gl.activeTexture(gl.TEXTURE0 + unit);
              let entry = inputs.get(input.name);
              if (!entry) { entry = texture(); inputs.set(input.name, entry); }
              gl.bindTexture(gl.TEXTURE_2D, entry.texture);
              if (entry.width !== input.width || entry.height !== input.height) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, input.width, input.height, 0, gl.RGBA, gl.FLOAT, input.data);
                if (gl.getError() !== gl.NO_ERROR) throw new Error('History allocation failed');
                entry.width = input.width; entry.height = input.height;
              } else if (entry.data !== input.data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, input.width, input.height, gl.RGBA, gl.FLOAT, input.data);
              entry.data = input.data;
              gl.uniform1i(location(input.name), unit++);
            }
            gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, palette.texture);
            const nextPalette = `${draw.palette}:${mode}`;
            if (paletteKey !== nextPalette) {
              const data = new Uint8Array(513 * 4);
              paletteTable(draw.palette, mode).forEach((rgb, i) => data.set([...rgb, 255], i * 4));
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 513, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data); paletteKey = nextPalette;
            }
            gl.uniform1i(location('uPalette'), unit);
            for (const [name, value] of Object.entries(packet.uniforms)) uniform(name, value);
            uniform('uGrid', [columns, rows]); uniform('uBounds', [bounds.width, bounds.height]); uniform('uAmplitude', Number(mode === 'amplitude'));
            uniform('uOrigin', [draw.origin?.x ?? 0, draw.origin?.y ?? 0]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.viewport(0, 0, columns, rows); gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
          gl.clearColor(13 / 255, 34 / 255, 47 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(displayProgram); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, output.texture);
          gl.uniform1i(displayImage, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
        } finally { if (query) { gl.endQuery(timer!.TIME_ELAPSED_EXT); pending.push(query); } }
      },
      destroy,
    };
  } catch { destroy(); return undefined; }
}
