import { Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PixiAppManager } from '../PixiAppManager';
import { captureBeforeRender } from '../playerSafeFrame';
import { copiedPixel } from '../lighting/engine/__tests__/gpuTestUtils';
import type { PlayerCameraState } from '../../types/playerCamera';

const WIDTH = 320;
const HEIGHT = 240;
const MARK = [255, 0, 0];
/** Looks at the middle of the mark. */
const FROZEN: PlayerCameraState = { centerX: 1010, centerY: 1010, scale: 1 };

/** A map view whose pane another Obsidian tab covers: the pane is `display: none` and measures nothing. */
describe('a frozen player camera on a real canvas whose pane is hidden', () => {
  let manager: PixiAppManager;
  let pane: HTMLElement;

  beforeEach(async () => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    pane = document.createElement('div');
    Object.assign(pane.style, { position: 'absolute', width: `${WIDTH}px`, height: `${HEIGHT}px` });
    document.body.appendChild(pane);
    manager = new PixiAppManager(pane.clientWidth, pane.clientHeight);
    await manager.init(pane);
    manager.getViewport()!.addChild(new Graphics().rect(1000, 1000, 20, 20).fill(0xff0000));
  });

  afterEach(() => {
    manager.destroy();
    pane.remove();
    vi.unstubAllGlobals();
  });

  /** The pane's next size, as the map view's `ResizeObserver` reads it. */
  function nextPaneSize(change: () => void): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      let observed = false;
      const observer = new ResizeObserver(() => {
        // The first call reports the size the pane already has
        if (!observed) {
          observed = true;
          window.requestAnimationFrame(change);
          return;
        }
        observer.disconnect();
        resolve({ width: pane.clientWidth, height: pane.clientHeight });
      });
      observer.observe(pane);
    });
  }

  /** What players frozen on `FROZEN` see in the middle of their window. */
  function frozenCentre(): number[] {
    const { app } = manager;
    const canvas = manager.getCanvasElement();
    let pixel: number[] = [];
    captureBeforeRender(
      [],
      () => app.renderer.render(app.stage),
      () => { pixel = copiedPixel(canvas, canvas.width / 2, canvas.height / 2); },
      { target: manager.getViewport()!, camera: FROZEN },
    );
    return pixel;
  }

  it('keeps the picture players are frozen on', async () => {
    const canvas = manager.getCanvasElement();
    const pixels = [canvas.width, canvas.height];
    expect(frozenCentre()).toEqual(MARK);

    const hidden = await nextPaneSize(() => { pane.style.display = 'none'; });
    expect(hidden).toEqual({ width: 0, height: 0 });
    manager.resize(hidden.width, hidden.height);

    // PIXI keeps the canvas at its size for a pane without one, so players still get a full frame
    expect([canvas.width, canvas.height]).toEqual(pixels);
    expect(frozenCentre()).toEqual(MARK);
  });

  it('follows the pane again once it shows', async () => {
    const hidden = await nextPaneSize(() => { pane.style.display = 'none'; });
    manager.resize(hidden.width, hidden.height);
    const shown = await nextPaneSize(() => { pane.style.display = ''; pane.style.width = `${WIDTH + 80}px`; });
    manager.resize(shown.width, shown.height);

    const viewport = manager.getViewport()!;
    expect([viewport.screenWidth, viewport.screenHeight]).toEqual([WIDTH + 80, HEIGHT]);
    expect(frozenCentre()).toEqual(MARK);
  });
});
