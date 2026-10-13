import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { fogRectangle } from '../helpers/fogOperations';
import { firstDifference, playerFrameSource, playerWindow, viewOf } from '../helpers/playerFrameView';
import { CELL, playerViewScenes, type PlayerViewScene } from '../helpers/playerViewScene';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { LaserBeam, beamWidth } from '../../src/app/pixi/laser/LaserBeam';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';

const MAP = 520;
/** The player window, and the pane of a GM whose screen has its size. */
const WINDOW = { width: 520, height: 280 };
/** A pane a sidebar left: as high, a fifth as wide. Most of what the players' window shows lies beside it. */
const NARROW = { width: 104, height: 280 };
const centre = (index: number): number => CELL / 2 + CELL * index;

const { scene } = playerViewScenes();

/** Twice life size, so that the grid's numbers are large enough to show. */
const ZOOM = 2;
/** The world rectangle the window shows at that zoom: columns 4 to 9 and rows 5 to 7 of the map's 13 × 13 cells, and a strip around them. */
const SHOWN = { left: MAP / 2 - WINDOW.width / ZOOM / 2, top: MAP / 2 - WINDOW.height / ZOOM / 2 };

/** A pointer event at a world point, wherever on or beside the canvas that lies. */
function pointerAt(s: PlayerViewScene, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void {
  const screen = s.viewport.toScreen(x, y);
  s.pointer(type, screen.x, screen.y);
}

/**
 * Everything players are shown and everything they are not, all over what the window shows:
 * the narrow pane shows column 6 alone, so nearly all of it lies beside the pane.
 */
async function populate(s: PlayerViewScene, perception: TokenPerception | undefined): Promise<void> {
  s.viewport.setZoom(ZOOM, true);
  s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
  s.lighting.perception = perception;
  await s.add(
    ...[4, 5, 6, 7, 8, 9].map((column) => ({ id: `row${column}`, x: centre(column), y: centre(5) })),
    { id: 'hiddenLeft', x: centre(4), y: centre(6), isHidden: true },
    { id: 'hiddenMiddle', x: centre(6), y: centre(6), isHidden: true },
    { id: 'hiddenRight', x: centre(9), y: centre(6), isHidden: true },
    { id: 'unseenLeft', x: centre(5), y: centre(6) },
    { id: 'unseenRight', x: centre(8), y: centre(6) },
    { id: 'foggedLeft', x: centre(4), y: centre(7) },
    { id: 'foggedRight', x: centre(9), y: centre(7) },
  );
  s.setFog({
    left: fogRectangle({ id: 'left', timestamp: 1, x: 3 * CELL, y: 6.6 * CELL, width: 2 * CELL, height: 2 * CELL }),
    right: fogRectangle({ id: 'right', timestamp: 2, x: 8.5 * CELL, y: 6.6 * CELL, width: 2 * CELL, height: 2 * CELL }),
    hole: fogRectangle({ id: 'hole', timestamp: 3, isErasing: true, x: 9.5 * CELL, y: 6.6 * CELL, width: CELL / 4, height: CELL / 2 }),
  });
  // Kept measurements: from tokens players see, from ones they may not and from hidden ones, left and right of the pane
  s.events.emit('measure-persistence-changed', true);
  s.store.getState().setActiveTool('measure');
  for (const [column, row] of [[4, 5], [9, 5], [5, 6], [8, 6], [4, 6], [9, 6]] as const) {
    const [x, y] = [centre(column), centre(row)];
    pointerAt(s, 'pointerdown', x, y);
    pointerAt(s, 'pointermove', x + (column < 6 ? 1 : -1) * 1.5 * CELL, y - CELL / 2);
    pointerAt(s, 'pointerup', x + (column < 6 ? 1 : -1) * 1.5 * CELL, y - CELL / 2);
  }
  s.store.getState().setActiveTool('select');
  // A laser trail across all the window shows
  const beam = new LaserBeam();
  s.viewport.addChild(beam.view);
  beam.draw({
    trail: Array.from({ length: 14 }, (_, i) => ({ x: SHOWN.left + i * 20, y: SHOWN.top + 8 + (i % 3) * 5, life: 1 })),
    dot: null, pointer: { x: SHOWN.left + 260, y: SHOWN.top + 13 }, color: '#ff3020', width: beamWidth(4, ZOOM), zoom: ZOOM,
  });
  await s.settle();
}

/** As the lighting hides tokens: these two are in nobody's sight. */
const UNSEEN: TokenPerception = (id) => (id.startsWith('unseen') ? 'unseen' : 'seen');

/** The players' frame of `s` through the real path: the frame texture, for a window of `WINDOW`'s size. */
function mirrored(s: PlayerViewScene): { pixels: Uint8ClampedArray; frame: { scale: number } | undefined; dispose(): void } {
  const { source, frames } = playerFrameSource({ renderer: s.renderer, stage: s.app.stage, ...viewOf(s.viewport, s.renderer), layers: () => s.frameLayers() });
  const players = playerWindow(source, { ...WINDOW, resolution: 1 });
  players.frame();
  expect([players.target.width, players.target.height]).toEqual([WINDOW.width, WINDOW.height]);
  return { pixels: players.pixels(), frame: players.frames.at(-1), dispose: () => { players.mirror.stop(); frames.destroy(); } };
}

/** The players' picture on a GM screen of the window's size, as the mirror took it until now: the players' layers on, one render. */
function onGmScreen(s: PlayerViewScene): Uint8ClampedArray {
  const target = RenderTexture.create({ ...WINDOW, antialias: true });
  let pixels = new Uint8ClampedArray();
  captureWithLayerVisibility(s.frameLayers(), () => undefined, () => {
    s.renderer.render({ container: s.app.stage, target, clear: true, clearColor: s.renderer.background.colorRgba });
    pixels = s.renderer.extract.pixels({ target }).pixels;
  });
  target.destroy(true);
  return pixels;
}

/** The window's pixel of a world coordinate. */
const px = (x: number): number => (x - SHOWN.left) * ZOOM;
const py = (y: number): number => (y - SHOWN.top) * ZOOM;

function at(pixels: Uint8ClampedArray, x: number, y: number): number[] {
  const i = (Math.round(y) * WINDOW.width + Math.round(x)) * 4;
  return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
}

describe('what the players\' frame shows beside the DM\'s pane', () => {
  const options = { map: MAP, grid: { enabled: true, cellNumbers: { format: 'column-row' as const, opacity: 1 } } };

  it.each([
    ['without lighting', undefined],
    ['with tokens hidden by the lighting\'s sight', UNSEEN],
  ])('is, pixel for pixel, what a DM screen of the window\'s size shows players: tokens, bars, the grid and its numbers, fog, measurements and the laser (%s)', async (_name, perception) => {
    const narrow = await scene({ ...options, pane: NARROW });
    const wide = await scene({ ...options, pane: WINDOW });
    await populate(narrow, perception);
    await populate(wide, perception);
    // The narrow pane shows a fifth of what the window shows: column 6 alone
    expect([narrow.viewport.left, narrow.viewport.right]).toEqual([MAP / 2 - 26, MAP / 2 + 26]);

    const players = mirrored(narrow);
    try {
      expect(players.frame?.scale).toBe(ZOOM);
      const expected = onGmScreen(wide);
      expect(firstDifference(players.pixels, expected, WINDOW.width)).toBeNull();

      // And what that picture holds beside the pane
      const floor = at(expected, px(centre(7)) + 30, py(centre(6)) + 30);
      const token = (column: number, row: number): number[] => at(players.pixels, px(centre(column)), py(centre(row)));
      // Tokens players see, at both ends of the row
      expect(token(4, 5)).not.toEqual(floor);
      expect(token(9, 5)).not.toEqual(floor);
      // Hidden tokens are not there, at either end; nor are those out of sight
      for (const column of [4, 9]) expect(token(column, 6)).toEqual(floor);
      for (const column of [5, 8]) {
        if (perception) expect(token(column, 6)).toEqual(floor);
        else expect(token(column, 6)).not.toEqual(floor);
      }
      // Fog is opaque black at both ends, over the tokens under it, and open where it was erased
      expect(token(4, 7)).toEqual([0, 0, 0]);
      expect(token(9, 7)).toEqual([0, 0, 0]);
      expect(at(players.pixels, px(9.6 * CELL), py(6.8 * CELL))).not.toEqual([0, 0, 0]);
      // The laser, and the grid's numbers, are in the picture
      expect(at(players.pixels, px(SHOWN.left + 40), py(SHOWN.top + 13))[0]).toBeGreaterThan(floor[0]! + 60);
    } finally {
      players.dispose();
    }
  });

  it('hides from players in the whole frame what the DM sees on a screen of that size', async () => {
    const narrow = await scene({ ...options, pane: NARROW });
    const wide = await scene({ ...options, pane: WINDOW });
    await populate(narrow, undefined);
    await populate(wide, undefined);
    const players = mirrored(narrow);
    try {
      const gm = wide.canvas();
      // The DM sees hidden tokens (translucent) and through the fog, at both ends of the frame; the players do not
      for (const column of [4, 6, 9]) expect(at(gm, px(centre(column)), py(centre(6)))).not.toEqual(at(players.pixels, px(centre(column)), py(centre(6))));
      for (const column of [4, 9]) expect(at(gm, px(centre(column)), py(centre(7)))).not.toEqual([0, 0, 0]);
    } finally {
      players.dispose();
    }
  });
});
