import { Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstDifference, playerFrameSource, playerWindow, viewOf, type PlayerWindowHarness } from '../../../../tests/helpers/playerFrameView';
import { PixiAppManager } from '../PixiAppManager';
import type { Screen } from '../../types/playerFrame';

const PANE = { width: 320, height: 200 };
/** A player window wider than the pane: the pane's height fills it. */
const WINDOW: Screen = { width: 480, height: 270, resolution: 1 };
const BACKGROUND = [244, 232, 208];
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];

interface View {
  manager: PixiAppManager;
  pane: HTMLElement;
  players: PlayerWindowHarness;
  /** The players' canvas after a display frame of their window. */
  shown(): Uint8ClampedArray;
  /** The pane takes this size, as the map view's `ResizeObserver` reports it. */
  resizePane(width: number, height: number): Promise<void>;
  /** Another Obsidian tab covers the pane (`display: none`), or uncovers it. */
  cover(covered: boolean): Promise<void>;
}

/**
 * A real map view (`PixiAppManager`, its canvas and viewport) presented to a player window of
 * another shape, with the pane changing as Obsidian changes it: a sidebar, a split, another tab.
 */
describe('the players\' picture while the DM\'s pane changes', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.unstubAllGlobals();
  });

  async function open(pixelRatio = 1): Promise<View> {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    vi.stubGlobal('devicePixelRatio', pixelRatio);
    const pane = document.createElement('div');
    Object.assign(pane.style, { position: 'absolute', left: '0', top: '0', width: `${PANE.width}px`, height: `${PANE.height}px` });
    document.body.appendChild(pane);
    const manager = new PixiAppManager(pane.clientWidth, pane.clientHeight);
    await manager.init(pane);
    const viewport = manager.getViewport()!;
    // A red mark in the middle of the DM's view, blue marks left and right of it and thin slanted lines over all of it
    const lines = new Graphics();
    for (let i = 0; i < 30; i++) lines.moveTo(600 + i * 27, 300).lineTo(1400 - i * 19, 700).stroke({ width: 1.5, color: 0x203040 + i * 0x070503 });
    const marks = new Graphics().rect(990, 490, 20, 20).fill(0xff0000).rect(820, 480, 20, 40).fill(0x0000ff).rect(1160, 480, 20, 40).fill(0x0000ff);
    viewport.addChild(lines, marks);
    viewport.moveCenter(1000, 500);
    const { renderer, stage } = manager.getApp();
    const { source, frames } = playerFrameSource({ renderer, stage, ...viewOf(viewport, renderer) });
    const players = playerWindow(source, WINDOW);
    cleanup.push(() => {
      players.mirror.stop();
      frames.destroy();
      manager.destroy();
      pane.remove();
    });
    /** The pane's next size, as the map view's `ResizeObserver` reads it. */
    const nextPaneSize = (change: () => void): Promise<{ width: number; height: number }> => new Promise((resolve) => {
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
    const follow = async (change: () => void): Promise<void> => {
      const size = await nextPaneSize(change);
      manager.resize(size.width, size.height);
    };
    return {
      manager, pane, players,
      shown: () => { players.frame(); return players.pixels(); },
      resizePane: (width, height) => follow(() => Object.assign(pane.style, { width: `${width}px`, height: `${height}px` })),
      cover: (covered) => follow(() => { pane.style.display = covered ? 'none' : ''; }),
    };
  }

  function expectSame(view: View, expected: Uint8ClampedArray): void {
    expect(firstDifference(view.shown(), expected, view.players.target.width)).toBeNull();
  }

  it('has the player window\'s own pixels, and shows all the pane shows with map beside it', async () => {
    const view = await open();
    view.shown();
    const { players } = view;
    expect([players.target.width, players.target.height]).toEqual([480, 270]);
    // The pane's height (200 world px) fills the window: 1.35 window pixels to a world pixel
    expect(players.at(240, 135)).toEqual(RED);
    expect(players.at(Math.round(240 - 170 * 1.35), 135)).toEqual(BLUE);
    expect(players.at(Math.round(240 + 170 * 1.35), 135)).toEqual(BLUE);
    // The pane itself ends 160 world px from its centre: the marks, 160 to 180 from it, lie beyond its edges
    expect(view.manager.getViewport()!.right).toBe(1160);
    expect(players.at(5, 5)).toEqual(BACKGROUND);
  });

  it.each([1, 2])('is the same, pixel for pixel, when a sidebar makes the pane narrower or wider (pane at a pixel ratio of %s)', async (pixelRatio) => {
    const view = await open(pixelRatio);
    const before = view.shown().slice();
    expect(view.players.at(240, 135)).toEqual(RED);

    for (const width of [200, 131, 260, 320, 355]) {
      await view.resizePane(width, PANE.height);
      expect(view.manager.getViewport()!.screenWidth).toBe(width);
      expectSame(view, before);
    }
  });

  it('zooms out when the pane gets higher, where the height decides the fit, and stays centred', async () => {
    const view = await open();
    view.shown();
    expect(view.players.at(240 + 12, 135)).toEqual(RED);
    await view.resizePane(PANE.width, 240);
    view.shown();
    // 240 world px fill the window's 270 where 200 did: the mark is smaller, and still in the middle
    expect(view.players.at(240, 135)).toEqual(RED);
    expect(view.players.at(240 + 9, 135)).toEqual(RED);
    expect(view.players.at(240 + 12, 135)).not.toEqual(RED);
    expect([view.players.target.width, view.players.target.height]).toEqual([480, 270]);
  });

  it('is the same, pixel for pixel, while another tab covers the pane, and after', async () => {
    const view = await open();
    const before = view.shown().slice();

    await view.cover(true);
    expect(view.pane.clientWidth).toBe(0);
    expectSame(view, before);
    await view.cover(false);
    expectSame(view, before);
  });

  describe('frozen', () => {
    /** Frozen as the player window freezes: on the camera players saw last, with the world rectangle it framed. */
    function freeze(view: View): Uint8ClampedArray {
      const frozen = view.shown().slice();
      view.players.state.frozen = view.players.frames.at(-1)!;
      expect(view.players.state.frozen).toMatchObject({ centerX: 1000, centerY: 500, width: 320, height: 200 });
      return frozen;
    }

    it.each([1, 1.25, 2])('is the same, pixel for pixel, whatever size the pane takes (pane at a pixel ratio of %s)', async (pixelRatio) => {
      const view = await open(pixelRatio);
      const frozen = freeze(view);
      expect(view.players.at(240, 135)).toEqual(RED);

      for (const [width, height] of [[384, 200], [357, 211], [160, 200], [320, 100], [289, 240], [97, 65]] as const) {
        await view.resizePane(width, height);
        expectSame(view, frozen);
      }
    });

    it('is the same, pixel for pixel, while another tab covers the pane (the pane measures nothing)', async () => {
      const view = await open();
      const frozen = freeze(view);

      await view.cover(true);
      expectSame(view, frozen);
      await view.cover(false);
      await view.resizePane(PANE.width + 80, PANE.height);
      expectSame(view, frozen);
    });

    it('is the same, pixel for pixel, while the DM pans and zooms, and follows the DM again once unfrozen', async () => {
      const view = await open();
      const frozen = freeze(view);
      const viewport = view.manager.getViewport()!;

      viewport.setZoom(2.5);
      viewport.moveCenter(1170, 500);
      expectSame(view, frozen);
      viewport.setZoom(0.3);
      viewport.moveCenter(-500, 4000);
      expectSame(view, frozen);

      viewport.setZoom(2.5);
      viewport.moveCenter(1170, 500);
      view.players.state.frozen = null;
      view.shown();
      // The DM looks at the blue mark right of the red one, close up
      expect(view.players.at(240, 135)).toEqual(BLUE);
      expect(view.players.frames.at(-1)).toMatchObject({ centerX: 1170, centerY: 500, scale: 2.5 });
    });

    it('leaves the DM\'s canvas and camera as they are', async () => {
      const view = await open();
      freeze(view);
      const viewport = view.manager.getViewport()!;
      viewport.setZoom(2);
      viewport.moveCenter(700, 300);
      view.shown();
      expect([viewport.center.x, viewport.center.y, viewport.scale.x]).toEqual([700, 300, 2]);
    });
  });
});
