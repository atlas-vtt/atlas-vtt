import { Sprite, Texture, Ticker, isWebGLSupported, type WebGLRenderer } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copiedPixel } from '../lighting/engine/__tests__/gpuTestUtils';
import { resetContext } from '../lighting/__tests__/rendererHarness';
import { PixiAppManager } from '../PixiAppManager';

const told = vi.hoisted(() => vi.fn());
vi.mock('../noGraphicsNotice', () => ({ showNoGraphicsNotice: told }));

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

  function expectOpenMap(renderer: 'webgl'): void {
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

  it('draws the map again by itself when the graphics process died while the view drew it for the first time', async () => {
    await manager.init(container);
    // Only the renders below draw.
    manager.app.ticker.stop();
    const renderer = manager.app.renderer as WebGLRenderer;
    const map = new Sprite({ texture: Texture.WHITE, tint: 0x3366cc, width: 320, height: 240 });
    manager.getViewport()!.addChild(map);

    // A render in the moments the context dies links the map's programs on it, as when Obsidian's
    // graphics process is killed while a lit map opens.
    await resetContext(renderer, () => manager.app.render());
    manager.app.render();

    expect(copiedPixel(manager.getCanvasElement(), 160, 120)).toEqual([0x33, 0x66, 0xcc]);
  });

  it('refuses to start without WebGL, tells the user and leaves no renderer behind', async () => {
    refuseWebGL(() => true);

    await expect(manager.init(container)).rejects.toThrow();

    expect(told).toHaveBeenCalledOnce();
    // No renderer was left behind half started: PIXI's system ticker has the listeners it had, or the one of the renderer whose start threw.
    expect(Ticker.system.count - systemListeners).toBeLessThanOrEqual(1);
  });
});
