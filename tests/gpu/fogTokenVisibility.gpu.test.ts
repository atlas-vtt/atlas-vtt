import { expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { getHistoryStore } from '../../src/app/stores/history';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import { fogRectangle } from '../helpers/fogOperations';
import { fogTokenScenes } from '../helpers/fogTokenScene';

const { scene } = fogTokenScenes();
const paint = fogRectangle({ x: 40, y: 40, width: 48, height: 48 });
const rgb = (pixels: Uint8ClampedArray, x: number, y: number): number[] => Array.from(pixels.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 3));

it('removes covered token pixels and UI without relying on the fog overlay, then restores the GM picture', async () => {
  const s = await scene();
  s.setFog({ paint });
  const gm = s.pixels();
  const before = s.pixels(false, false);
  const players = s.pixels(true, false);
  expect(rgb(before, 64, 64)).not.toEqual([32, 32, 32]);
  expect(rgb(players, 64, 64)).toEqual([32, 32, 32]);
  expect(rgb(players, 192, 64)).toEqual(rgb(before, 192, 64));
  const sprites = s.tokens.getTokenSprites();
  const layers = s.tokens.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView);
  expect(layers).toContainEqual({ layer: sprites.covered, visible: false });
  // The UI layer above the sprite is absent too, including pixels outside the fog rectangle.
  let baselineHasUI = false;
  for (let y = 60; y < 90; y++) {
    for (let x = 0; x < 40; x++) {
      baselineHasUI ||= rgb(before, x, y).some((value) => value !== 32);
      expect(rgb(players, x, y)).toEqual([32, 32, 32]);
    }
  }
  expect(baselineHasUI).toBe(true);
  expect(s.pixels()).toEqual(gm);
  expect(sprites.covered?.visible).toBe(true);
});

it('updates the session picture and hit targets after painting, erasing, undo and redo', async () => {
  const s = await scene();
  s.store.getState().setGMView(false);
  const sprites = s.tokens.getTokenSprites();
  expect(sprites.covered?.visible).toBe(true);
  s.setFog({ paint });
  expect(sprites.covered?.visible).toBe(false);
  expect(s.tokens.hitTestTokens(64, 64)).toBeNull();
  const erase = fogRectangle({ id: 'erase', timestamp: 2, x: 50, y: 50, width: 28, height: 28, isErasing: true });
  s.setFog({ paint, erase });
  expect(sprites.covered?.visible).toBe(true);
  expect(s.tokens.hitTestTokens(64, 64)).toBe('covered');
  getHistoryStore(s.store)!.getState().undo();
  expect(sprites.covered?.visible).toBe(false);
  getHistoryStore(s.store)!.getState().redo();
  expect(sprites.covered?.visible).toBe(true);
  expect(rgb(s.pixels(true, false), 64, 64)).not.toEqual([32, 32, 32]);
});

it('fails closed for invalid committed geometry and recovers without changing the token', async () => {
  const s = await scene();
  const tokens = s.store.getState().objects.tokens;
  s.store.getState().setGMView(false);
  s.setFog({ paint: { ...paint, x: Number.NaN } });
  expect(s.tokens.visibleTokenIds()).toEqual([]);
  expect(rgb(s.pixels(true, false), 64, 64)).toEqual([32, 32, 32]);
  s.setFog({});
  expect(s.tokens.visibleTokenIds()).toEqual(['covered', 'clear']);
  expect(s.store.getState().objects.tokens).toBe(tokens);
});

it('removes sensed outlines under fog and restores them after erasing', async () => {
  const s = await scene();
  s.setFog({ paint });
  s.tokens.setPlayerSightProvider(() => () => 'sensed');
  s.tokens.refreshPlayerSight();
  const outlines = s.tokens.getSensedOutlineLayer();
  if (!(outlines instanceof Container)) throw new Error('Expected the real outline layer');
  outlines.visible = true;
  expect(outlines.children.filter((child) => child.label !== 'sensedOutlinesHeld')).toHaveLength(1);
  expect(rgb(s.pixels(true, false, () => 'sensed'), 82, 64)).toEqual([32, 32, 32]);
  s.setFog({});
  expect(outlines.children.filter((child) => child.label !== 'sensedOutlinesHeld')).toHaveLength(2);
  expect(rgb(s.pixels(true, false, () => 'sensed'), 82, 64)).not.toEqual([32, 32, 32]);
});
