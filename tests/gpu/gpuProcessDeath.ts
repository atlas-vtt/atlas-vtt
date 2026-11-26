import type { WebGLRenderer } from 'pixi.js';
import { resetContext } from '../../src/app/pixi/lighting/__tests__/rendererHarness';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Whether `options` of the call that made a 2D context asked for one in main memory. */
function inMainMemory(options: unknown): boolean {
  return typeof options === 'object' && options !== null && Reflect.get(options, 'willReadFrequently') === true;
}

/** Calls `seen` with what each call of `name` on `prototype` returned and with which arguments, from now on; returns the function that stops it. */
function watchCalls(prototype: object, name: string, seen: (result: unknown, args: unknown[]) => void): () => void {
  const original: unknown = Reflect.get(prototype, name);
  if (typeof original !== 'function') return () => undefined;
  Reflect.set(prototype, name, function watched(this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(original, this, args);
    seen(result, args);
    return result;
  });
  return () => Reflect.set(prototype, name, original);
}

/** What a lost 2D context does: it draws nothing and says it is lost. */
const SILENT_WHILE_LOST = ['clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke', 'drawImage', 'putImageData', 'fillText', 'strokeText'];

/** Makes `context` behave as a lost one until the returned function is called. */
function silence(context: Context2D): () => void {
  for (const name of SILENT_WHILE_LOST) Reflect.set(context, name, () => undefined);
  Reflect.set(context, 'isContextLost', () => true);
  return () => {
    for (const name of [...SILENT_WHILE_LOST, 'isContextLost']) Reflect.deleteProperty(context, name);
  };
}

export interface GpuProcess {
  /** Kills the GPU process as Chromium tells the page of it, and resolves once PIXI handled the restored context. */
  die(renderer: WebGLRenderer): Promise<void>;
  stop(): void;
}

/**
 * What the death of Obsidian's GPU process does to a page, as measured by killing that process in
 * Obsidian on Electron 43 (ANGLE on Vulkan): the WebGL context is
 * lost; every 2D canvas whose pixels the GPU process held loses them and fires `contextlost`; about
 * half a second later each is handed back blank with its state reset (`contextrestored`), one after
 * the other on timers of their own, a canvas still lost meanwhile drawing nothing; about half a
 * second after that the WebGL context is restored. Canvases made with `willReadFrequently` live in
 * main memory and keep their pixels and state. Watches the canvases made from the call on.
 */
export function watchGpuProcess(): GpuProcess {
  /** Each 2D context seen, with whether the GPU process holds its pixels: the first call on a canvas sets its attributes. */
  const contexts = new Map<Context2D, boolean>();
  const record = (result: unknown, [type, options]: unknown[]): void => {
    if (type !== '2d' || !(result instanceof CanvasRenderingContext2D || result instanceof OffscreenCanvasRenderingContext2D)) return;
    if (!contexts.has(result)) contexts.set(result, !inMainMemory(options));
  };
  const stops = [
    watchCalls(HTMLCanvasElement.prototype, 'getContext', record),
    watchCalls(OffscreenCanvas.prototype, 'getContext', record),
  ];
  return {
    async die(renderer) {
      const lost = [...contexts].filter(([, inGpu]) => inGpu).map(([context]) => context);
      await resetContext(renderer, () => {
        const restores = lost.map((context) => {
          context.canvas.dispatchEvent(new Event('contextlost'));
          context.reset();
          return silence(context);
        });
        lost.forEach((context, index) => {
          restores[index]!();
          context.canvas.dispatchEvent(new Event('contextrestored'));
        });
      });
    },
    stop() {
      for (const stop of stops) stop();
    },
  };
}
