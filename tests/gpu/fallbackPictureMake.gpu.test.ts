import '../setup/obsidianDom';
import type { Renderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MAX_ZOOM, startRenderers, type Kind } from '../helpers/fallbackPictures';
import { byId, CLEAN, customPictures, faults, sumOf, token, wall } from '../helpers/fallbackPictureScenes';

/**
 * How the black of the line-of-sight fallback is made, in the picture both renderers give:
 * opaque and hardened, new when the sight is, and the whole map where its polygons cannot be
 * drawn. The mask's own test (`sightMask.gpu.test.ts`) holds the same texel by texel.
 */
describe('the make of the line-of-sight fallback\'s black, in its picture', { timeout: 600_000 }, () => {
  let renderers: Record<Kind, Renderer>;
  let stop: () => void;
  beforeAll(async () => {
    ({ renderers, stop } = await startRenderers());
  });
  afterAll(() => stop());

  it.each([
    { feet: 1e9, drawn: true },
    { feet: 1e12, drawn: false },
    { feet: 1e16, drawn: false },
    { feet: 1e17, drawn: false },
    { feet: 3e17, drawn: false },
  ])('shows nothing behind a wall to a token that sees $feet ft: its sight, or the whole map black where that is too far to draw', ({ feet, drawn }) => {
    // A canvas misplaces the edges to corners this far away: from 3e16 ft it showed floor behind these walls.
    const pictures = customPictures(renderers, { width: 2048, height: 2048 }, {
      tokens: [token('scout', 1000.37, 1000.61, { enabled: true, range: feet })],
      walls: [
        wall('north', { x: 700.3, y: 400.7 }, { x: 1100.9, y: 520.2 }),
        wall('east', { x: 1300.4, y: 900.1 }, { x: 1250.6, y: 1500.8 }),
        wall('south', { x: 300.2, y: 1400.5 }, { x: 800.7, y: 1250.3 }),
      ],
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // The whole map at half size, in four views.
      const quarters = [512, 1536].flatMap((y) => [512, 1536].map((x) => pictures.judge({ scale: 0.5, centre: { x, y } }, true)));
      expect(quarters.map((tallies) => [tallies.canvas.leaked, tallies.webgl.leaked])).toEqual(quarters.map(() => [0, 0]));
      const open = quarters.reduce((sum, tallies) => sum + Math.min(tallies.canvas.open, tallies.webgl.open), 0);
      const most = quarters.reduce((sum, tallies) => sum + Math.max(tallies.canvas.open, tallies.webgl.open), 0);
      if (drawn) {
        expect(open).toBeGreaterThan(500_000);
        expect(sumOf(quarters)).toEqual(CLEAN);
      } else {
        expect(most).toBe(0);
      }
    } finally {
      errors.mockRestore();
      pictures.close();
    }
  });

  it('shows the new sight when the sight changes on a map of the same size', () => {
    // The canvas stays the same one, so on WebGL its texture must be told of the new pixels.
    const pictures = customPictures(renderers, { width: 300, height: 200 }, {
      tokens: [token('scout', 60.3, 100.7)],
      walls: [wall('middle', { x: 150.4, y: -10 }, { x: 149.6, y: 210 })],
    });
    try {
      const whole = { scale: 1, centre: { x: 150, y: 100 } };
      const black = { canvas: 'black', webgl: 'black' }, floor = { canvas: 'floor', webgl: 'floor' };
      expect([pictures.shownAt(whole, 60, 50), pictures.shownAt(whole, 240, 150)]).toEqual([floor, black]);
      for (const [x, left, right] of [[240.3, black, floor], [60.3, floor, black], [240.3, black, floor]] as const) {
        pictures.store.setState((state) => ({ objects: { ...state.objects, tokens: byId([token('scout', x, 100.7)]) } }));
        expect([pictures.shownAt(whole, 60, 50), pictures.shownAt(whole, 240, 150)]).toEqual([left, right]);
      }
    } finally {
      pictures.close();
    }
  });

  it('is opaque black or nothing, with a texel of black around what is hidden', () => {
    // One token and a slanted wall: no sliver, so every edge of the black is an edge of this sight.
    const pictures = customPictures(renderers, { width: 300, height: 220 }, {
      tokens: [token('scout', 80.3, 150.7, { enabled: true, range: 25 })],
      walls: [wall('screen', { x: 130.4, y: 40.2 }, { x: 171.8, y: 190.6 })],
    });
    try {
      const clean = { canvas: { blended: 0, tight: 0 }, webgl: { blended: 0, tight: 0 } };
      for (const view of [{ scale: 1, centre: { x: 150, y: 110 } }, { scale: MAX_ZOOM, centre: { x: 150, y: 115 } }, { scale: 2.3, centre: { x: 120.7, y: 100.3 } }]) {
        // A black written at half strength, or left as the canvas blended it, shows pixels between the floor and black.
        // A black without the texels around each one shows the floor closer than half a texel to what is hidden.
        expect(pictures.make(view)).toEqual(clean);
        const tallies = pictures.judge(view);
        expect(faults(tallies)).toEqual(CLEAN);
        expect(Math.min(tallies.canvas.open, tallies.webgl.open)).toBeGreaterThan(1_000);
      }
    } finally {
      pictures.close();
    }
  });
});
