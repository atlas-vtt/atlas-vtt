import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rectangle, Ticker, type Application, type ApplicationOptions } from 'pixi.js';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';
import { captureBeforeRender } from '../../src/app/pixi/playerSafeFrame';
import type { PlayerCameraState } from '../../src/app/types/playerCamera';

vi.mock('obsidian', () => ({ Notice: class {} }));

const FROZEN: PlayerCameraState = { centerX: 400, centerY: 300, scale: 2 };

/** What `Application.init` leaves on the app, as far as `PixiAppManager` reads it. */
function startRenderer(app: Application, options: Partial<ApplicationOptions>): ReturnType<typeof vi.fn> {
  const ticker = new Ticker();
  ticker.autoStart = false;
  const resize = vi.fn();
  Object.assign(app, {
    ticker,
    render: vi.fn(),
    renderer: {
      name: 'webgl',
      canvas: options.canvas,
      screen: new Rectangle(0, 0, options.width, options.height),
      events: { domElement: options.canvas },
      runners: { contextChange: { add: vi.fn(), remove: vi.fn() } },
      render: vi.fn(),
      resize,
    },
  });
  return resize;
}

describe('PixiAppManager.resize', () => {
  let manager: PixiAppManager;
  let resizeRenderer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: (): null => null } as never);
    manager = new PixiAppManager(800, 600);
    manager.app.init = (options: Partial<ApplicationOptions> = {}): Promise<void> => {
      resizeRenderer = startRenderer(manager.app, options);
      return Promise.resolve();
    };
    await manager.init(document.createElement('div'));
  });

  afterEach(() => {
    manager.getApp().ticker?.stop();
    vi.restoreAllMocks();
  });

  /** Where on the canvas players frozen on `FROZEN` find the map's origin. */
  function frozenMapOrigin(): { x: number; y: number } {
    const viewport = manager.getViewport()!;
    let origin = { x: NaN, y: NaN };
    captureBeforeRender([], () => undefined, () => { origin = { x: viewport.position.x, y: viewport.position.y }; }, { target: viewport, camera: FROZEN });
    return origin;
  }

  it('leaves a frozen player camera where it is when the pane is hidden', () => {
    const shown = frozenMapOrigin();
    expect(shown).toEqual({ x: 400 - 800, y: 300 - 600 });

    // What a pane measures while another Obsidian tab covers it (`display: none`)
    manager.resize(0, 0);

    expect(frozenMapOrigin()).toEqual(shown);
    expect(resizeRenderer).not.toHaveBeenCalled();
  });

  it('keeps the size of the screen while one side of the pane is gone', () => {
    manager.resize(0, 600);
    manager.resize(800, 0);

    const viewport = manager.getViewport()!;
    expect([viewport.screenWidth, viewport.screenHeight]).toEqual([800, 600]);
    expect(manager.getCanvasElement().style.width).toBe('800px');
  });

  it('follows a pane that changes size', () => {
    manager.resize(1000, 700);

    const viewport = manager.getViewport()!;
    expect([viewport.screenWidth, viewport.screenHeight]).toEqual([1000, 700]);
    expect(resizeRenderer).toHaveBeenCalledWith(1000, 700);
    expect(manager.getCanvasElement().style.width).toBe('1000px');
  });
});
