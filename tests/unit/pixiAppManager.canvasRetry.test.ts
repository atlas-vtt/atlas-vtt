// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rectangle, Ticker, type Application, type ApplicationOptions } from 'pixi.js';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
}));

const NO_WEBGL = 'This browser does not support WebGL. Try using the canvas renderer';

/** What `Application.init` leaves on the app, as far as `PixiAppManager` reads it. */
function startRenderer(app: Application, options: Partial<ApplicationOptions>, name: 'webgl' | 'canvas'): void {
  const ticker = new Ticker();
  ticker.autoStart = false;
  Object.assign(app, {
    ticker,
    render: vi.fn(),
    renderer: {
      name,
      canvas: options.canvas,
      screen: new Rectangle(0, 0, options.width, options.height),
      events: { domElement: options.canvas },
      runners: { contextChange: { add: vi.fn(), remove: vi.fn() } },
      render: vi.fn(),
      resize: vi.fn(),
    },
  });
}

describe('PixiAppManager.init when WebGL cannot start', () => {
  let manager: PixiAppManager;
  let container: HTMLElement;
  let error: ReturnType<typeof vi.spyOn>;

  /** What a canvas made to ask for WebGL answers: a context, or none once WebGL is gone. */
  function webglContexts(available: boolean): void {
    const context = available ? { getExtension: (): null => null } : null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as RenderingContext);
  }

  beforeEach(() => {
    notices.length = 0;
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    webglContexts(true);
    manager = new PixiAppManager(800, 600);
    container = document.createElement('div');
  });

  afterEach(() => {
    manager.getApp().ticker?.stop();
    vi.restoreAllMocks();
  });

  /** `init` as PIXI behaves once WebGL contexts can no longer be created: it throws for WebGL. */
  function failWebGL(canvasWorks: boolean): ReturnType<typeof vi.fn> {
    const init = vi.fn((options: Partial<ApplicationOptions>): Promise<void> => {
      const preference = options.preference as string[];
      if (preference.includes('webgl')) return Promise.reject(new Error(NO_WEBGL));
      if (!canvasWorks) return Promise.reject(new Error('The canvas renderer could not start'));
      startRenderer(manager.app, options, 'canvas');
      return Promise.resolve();
    });
    manager.app.init = init;
    return init;
  }

  it('retries once with the canvas renderer on a fresh canvas, and the map view opens', async () => {
    const init = failWebGL(true);
    const firstCanvas = manager.getCanvasElement();

    await manager.init(container);

    expect(init).toHaveBeenCalledTimes(2);
    expect(init.mock.calls[0]![0].preference).toEqual(['webgl', 'canvas']);
    expect(init.mock.calls[1]![0].preference).toEqual(['canvas']);
    // A canvas that was asked for WebGL may never give a 2D context.
    expect(init.mock.calls[1]![0].canvas).not.toBe(firstCanvas);
    expect(manager.getCanvasElement()).toBe(init.mock.calls[1]![0].canvas);
    expect(container.contains(manager.getCanvasElement())).toBe(true);
    expect(container.contains(firstCanvas)).toBe(false);
    expect(manager.getViewport()).not.toBeNull();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('Atlas cannot use your graphics card');
  });

  it('keeps the options of the first try for the retry', async () => {
    const init = failWebGL(true);
    await manager.init(container);
    const { preference: _first, canvas: _firstCanvas, ...first } = init.mock.calls[0]![0] as Record<string, unknown>;
    const { preference: _second, canvas: _secondCanvas, ...second } = init.mock.calls[1]![0] as Record<string, unknown>;
    expect(second).toEqual(first);
    expect(second).toMatchObject({ width: 800, height: 600 });
  });

  it('fails with the canvas renderer\'s error only when that cannot start either', async () => {
    const init = failWebGL(false);
    await expect(manager.init(container)).rejects.toThrow('The canvas renderer could not start');
    expect(init).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
  });

  it('starts the canvas renderer at once, on its own canvas, when no WebGL context can be created', async () => {
    webglContexts(false);
    const init = failWebGL(true);
    const canvas = manager.getCanvasElement();

    await manager.init(container);

    expect(init).toHaveBeenCalledOnce();
    expect(init.mock.calls[0]![0]).toMatchObject({ preference: ['canvas'], canvas });
    expect(container.contains(canvas)).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('does not retry when WebGL starts', async () => {
    const init = vi.fn((options: Partial<ApplicationOptions>): Promise<void> => {
      startRenderer(manager.app, options, 'webgl');
      return Promise.resolve();
    });
    manager.app.init = init;
    const canvas = manager.getCanvasElement();

    await manager.init(container);

    expect(init).toHaveBeenCalledOnce();
    expect(manager.getCanvasElement()).toBe(canvas);
    expect(notices).toEqual([]);
  });
});
