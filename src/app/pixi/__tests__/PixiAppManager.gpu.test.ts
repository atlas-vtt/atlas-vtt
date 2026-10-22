import { Ticker, isWebGLSupported, type WebGLRenderer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PixiAppManager } from '../PixiAppManager';

type GetContext = (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => RenderingContext | null;

/** Real PIXI inits in a session where WebGL worked at first, which PIXI remembers, and then stops. */
describe('PixiAppManager.init with real renderers', () => {
  let manager: PixiAppManager;
  let container: HTMLElement;
  let error: ReturnType<typeof vi.spyOn>;
  let systemListeners: number;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(isWebGLSupported()).toBe(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    systemListeners = Ticker.system.count;
    manager = new PixiAppManager(320, 240);
  });

  afterEach(() => {
    manager.destroy();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Canvases for which `refuses` holds give no WebGL context, as when the graphics process gave up. */
  function refuseWebGL(refuses: (canvas: HTMLCanvasElement) => boolean): void {
    const original = Reflect.get(HTMLCanvasElement.prototype, 'getContext') as GetContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type.startsWith('webgl') && refuses(this) ? null : original.call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext);
  }

  function expectOpenMap(renderer: 'webgl' | 'canvas'): void {
    expect(manager.app.renderer.name).toBe(renderer);
    expect(manager.getViewport()).not.toBeNull();
    expect(container.contains(manager.getCanvasElement())).toBe(true);
    expect(() => manager.app.render()).not.toThrow();
  }

  it('starts WebGL where it is available', async () => {
    await manager.init(container);
    expectOpenMap('webgl');
    expect(error).not.toHaveBeenCalled();
  });

  it('draws through an antialiased back buffer, the canvas without samples', async () => {
    await manager.init(container);
    const renderer = manager.app.renderer as WebGLRenderer;
    expect(renderer.gl.getContextAttributes()?.antialias).toBe(false);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect((renderer.backBuffer as unknown as { _antialias: boolean })._antialias).toBe(true);
    expectOpenMap('webgl');
  });

  it('opens with the Canvas renderer, and starts no WebGL renderer, when no WebGL context can be created', async () => {
    refuseWebGL(() => true);
    const canvas = manager.getCanvasElement();

    await manager.init(container);

    expectOpenMap('canvas');
    expect(manager.getCanvasElement()).toBe(canvas);
    expect(error).not.toHaveBeenCalled();
    manager.destroy();
    // No renderer was left behind half started: PIXI's system ticker has the listeners it had.
    expect(Ticker.system.count).toBe(systemListeners);
  });

  it('opens with the Canvas renderer on a new canvas when PIXI\'s WebGL start throws all the same', async () => {
    const first = manager.getCanvasElement();
    refuseWebGL((canvas) => canvas === first);

    await manager.init(container);

    expectOpenMap('canvas');
    expect(manager.getCanvasElement()).not.toBe(first);
    expect(container.contains(first)).toBe(false);
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]![1])).toContain('does not support WebGL');
    manager.destroy();
    // PIXI keeps no reference to the renderer whose start threw: its scheduler's listener stays.
    expect(Ticker.system.count - systemListeners).toBeLessThanOrEqual(1);
  });
});
