import type { FieldGrid, FieldMode, FieldTransform } from '../model/types';
import type { WaveFrame } from '../physics/engine';
import { paletteTable, type PaletteId } from '../visual/field-palettes';
import { createFieldQuality } from '../runtime/field-quality';
import { createWebGLField } from './webgl-field';

/** Chooses the presentation backend without changing the physical engine or frame. */
export function createFieldSurface(cpuCanvas: HTMLCanvasElement, invalidate: () => void, report: (event: string, error?: unknown) => void = () => {}) {
  const gpuCanvas = cpuCanvas.cloneNode(false) as HTMLCanvasElement;
  const createGpu = () => createWebGLField(gpuCanvas, error => report('gpu-initialization-failed', error));
  let gpu = createGpu(), activeCanvas = cpuCanvas;
  if (!gpu) report('cpu-fallback');
  let failedKernel: string | undefined, failures = 0, disposed = false;
  const quality = createFieldQuality();
  const abort = new AbortController(), signal = abort.signal;
  let backend = '', previousKey = '', previousPalette = '', previousColumns = 0;
  let grid: FieldGrid | undefined, pixels: ImageData | undefined;
  let previousFrame: WaveFrame | undefined;
  let context: CanvasRenderingContext2D | null = null;
  const buffer = document.createElement('canvas');
  let bufferContext: CanvasRenderingContext2D | null = null;
  let lastSampleAt: number | undefined, lastTime: number | undefined, gpuMs = 0;
  let feedback: { cost: number; cpu: number; interval: number; fps: number } | undefined;
  gpuCanvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); gpu?.destroy(); gpu = undefined; failures++;
    report('gpu-context-lost');
    previousKey = ''; quality.reset(); lastSampleAt = undefined; invalidate();
  }, { signal });
  gpuCanvas.addEventListener('webglcontextrestored', () => {
    if (disposed) return;
    if (failures > 2) { report('gpu-recovery-limit'); return; }
    gpu = createGpu(); failedKernel = undefined;
    report(gpu ? 'gpu-context-restored' : 'cpu-fallback');
    previousKey = ''; quality.reset(); lastSampleAt = undefined; invalidate();
  }, { signal });
  function accelerated(frame: WaveFrame) {
    const packet = gpu?.available ? frame.fieldProgram?.() : undefined;
    return Boolean(packet && packet.key !== failedKernel);
  }
  return {
    rate(frame: WaveFrame) { return quality.fps(accelerated(frame), frame.snapshot.steady); },
    presented(totalCpuMs: number) {
      if (feedback) quality.observe(feedback.cost, feedback.interval, feedback.fps, Math.max(0, totalCpuMs - feedback.cpu));
      feedback = undefined;
    },
    render(frame: WaveFrame, mode: FieldMode, transform: FieldTransform, palette: PaletteId, playing: boolean) {
      const start = performance.now(), { snapshot } = frame;
      const packet = accelerated(frame) ? frame.fieldProgram?.() : undefined;
      const useGpu = Boolean(packet && gpu?.available);
      const nextBackend = useGpu ? 'webgl2' : 'cpu';
      if (backend !== nextBackend) {
        quality.reset(); previousKey = ''; previousPalette = ''; gpuMs = 0; lastSampleAt = undefined; backend = nextBackend;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = frame.fieldBounds;
      const maxColumns = useGpu ? 1024 : 640;
      // Background resolution alone changes; SVG geometry and text retain device sharpness.
      const density = !playing || (useGpu && mode === 'amplitude' && snapshot.steady) ? (useGpu ? dpr : 1) : quality.scale() * (useGpu ? 1 : .5);
      const columns = Math.max(160, Math.min(maxColumns, Math.round(transform.width * Math.min(dpr, density))));
      const rows = Math.max(2, Math.round(columns * bounds.height / bounds.width));
      const identity = frame.fieldCacheKey?.(mode);
      const key = JSON.stringify([mode, columns, rows, bounds, identity]);
      const fieldChanged = key !== previousKey || (identity === undefined && frame !== previousFrame);
      const redraw = fieldChanged || palette !== previousPalette;
      let canvas = cpuCanvas;
      if (useGpu) {
        try {
          gpuMs = gpu!.takeGpuTime() ?? gpuMs;
          gpu!.render(packet!, { bounds, origin: bounds, transform, columns, rows, mode, palette, dpr, redraw });
          canvas = gpuCanvas;
        } catch (error) {
          failedKernel = packet!.key;
          report('gpu-render-failed', error);
          console.warn('GPU field unavailable; continuing with CPU sampling.', error);
          previousKey = ''; invalidate();
          // The same frame is redrawn immediately, so a failed GPU never leaves a blank scene.
          this.render(frame, mode, transform, palette, playing); return;
        }
      } else {
        context ??= cpuCanvas.getContext('2d', { alpha: false });
        bufferContext ??= buffer.getContext('2d', { alpha: false });
        if (!context || !bufferContext) throw new Error('Canvas 2D is required for CPU fallback');
        const width = Math.round(transform.width * dpr), height = Math.round(transform.height * dpr);
        if (cpuCanvas.width !== width || cpuCanvas.height !== height) { cpuCanvas.width = width; cpuCanvas.height = height; }
        if (fieldChanged || !grid) grid = frame.sampleField(columns, rows, mode);
        if (redraw || !pixels) {
          if (buffer.width !== columns || buffer.height !== rows || !pixels) {
            buffer.width = columns; buffer.height = rows; pixels = bufferContext.createImageData(columns, rows);
          }
          const table = paletteTable(palette, mode);
          for (let i = 0; i < grid.values.length; i++) {
            const index = Math.max(0, Math.min(512, Math.round(mode === 'wave' ? grid.values[i] * 256 + 256 : grid.values[i] * 512)));
            const color = table[index];
            pixels.data[i * 4] = color[0]; pixels.data[i * 4 + 1] = color[1]; pixels.data[i * 4 + 2] = color[2]; pixels.data[i * 4 + 3] = 255;
          }
          bufferContext.putImageData(pixels, 0, 0);
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = '#0d222f'; context.fillRect(0, 0, transform.width, transform.height);
        context.imageSmoothingEnabled = true;
        context.drawImage(buffer, 0, 0, transform.width, transform.height);
      }
      if (canvas !== activeCanvas) { activeCanvas.replaceWith(canvas); activeCanvas = canvas; }
      const cost = performance.now() - start, time = snapshot.clock.timeSeconds;
      const fps = quality.fps(useGpu, snapshot.steady);
      // Do not interpret pauses, stationary amplitude caching or resolution changes as spare capacity.
      feedback = playing && redraw && time !== lastTime && previousColumns === columns && lastSampleAt !== undefined
        ? { cost: Math.max(cost, useGpu ? gpuMs : 0), cpu: cost, interval: start - lastSampleAt, fps } : undefined;
      if (redraw && time !== lastTime) lastSampleAt = start;
      lastTime = time; previousColumns = columns; previousKey = key; previousPalette = palette;
      previousFrame = frame;
      Object.assign(canvas.dataset, { palette, renderer: backend, fieldColumns: String(columns), fieldRows: String(rows), targetFps: String(fps), fieldMs: cost.toFixed(2), gpuMs: gpuMs.toFixed(2) });
    },
    destroy() { disposed = true; abort.abort(); gpu?.destroy(); },
  };
}
