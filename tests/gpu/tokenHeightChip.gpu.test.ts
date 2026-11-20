import { describe, expect, it } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import type { Perception } from '../../src/app/vision/perception';
import { fogRectangle } from '../helpers/fogOperations';
import { differingIn, differingPixels, playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';

const { scene } = playerViewScenes();
type Spot = Partial<TokenEntity> & { id: string; x: number; y: number };
/** A token of one 40 px cell (its ring from 120 to 160 down the picture), 30 ft off the floor, and the same token on it. */
const FLIER: Spot = { id: 'F', kind: 'character', name: '', x: 100, y: 140, elevation: 30 };
const WALKER: Spot = { ...FLIER, elevation: undefined };

/** A scene that measures in feet, so heights are counted, with `tokens` on it. */
async function build(tokens: Spot[], arrange?: (s: PlayerViewScene) => void): Promise<PlayerViewScene> {
  const s = await scene();
  s.store.setState({ grid: { ...s.store.getState().grid, measurementType: 'units', unitType: 'feet', unitDistance: 5 } });
  await s.add(...tokens);
  arrange?.(s);
  return s;
}

/** How many pixels differ in the strip over a token where its chip stands: above its ring and the badges on it, no wider than the token. */
const overToken = (a: Uint8ClampedArray, b: Uint8ClampedArray, { x, y }: Spot): number => differingIn(a, b, x - 20, y - 44, x + 20, y - 27);

describe('the height chip of a token', () => {
  it('stands over a flier, clear of its ring, in the GM\'s view and in the players\' frame alike', async () => {
    const flying = await build([FLIER]);
    const walking = await build([WALKER]);
    for (const picture of ['canvas', 'frame'] as const) {
      const [a, b] = [flying[picture](), walking[picture]()];
      // The pill and its text, and nothing else on the picture: not the token under it, not its ring.
      expect(overToken(a, b, FLIER), picture).toBeGreaterThan(150);
      expect(differingPixels(a, b), picture).toBe(overToken(a, b, FLIER));
    }
    // The players' chip is the GM's.
    expect(samePixels(flying.canvas(), flying.frame())).toBe(true);
  });

  it.each([
    ['hidden', { ...FLIER, isHidden: true }, undefined],
    ['under fog', FLIER, (s: PlayerViewScene): void => s.setFog({ paint: fogRectangle({ x: 70, y: 90, width: 60, height: 80 }) })],
    ['out of their sight', FLIER, (s: PlayerViewScene): void => { s.lighting.perception = (id: string): Perception => (id === 'F' ? 'unseen' : 'seen'); }],
  ] as const)('leaves the players\' picture with its token when %s', async (_case, token, arrange) => {
    const s = await build([token], arrange);
    const empty = await build([], arrange);
    expect(samePixels(s.frame(), empty.frame())).toBe(true);
    s.store.getState().setGMView(false);
    empty.store.getState().setGMView(false);
    s.tokens.refreshPlayerSight();
    expect(samePixels(s.canvas(), empty.canvas())).toBe(true);
  });

  it('follows the token\'s height and goes when it lands', async () => {
    const s = await build([FLIER]);
    const walking = await build([WALKER]);
    const before = s.canvas();
    s.store.getState().updateTokens([{ id: 'F', changes: { elevation: 125 } }]);
    await s.settle();
    expect(overToken(s.canvas(), before, FLIER)).toBeGreaterThan(0);
    expect(differingPixels(s.canvas(), before)).toBe(overToken(s.canvas(), before, FLIER));
    s.store.getState().updateTokens([{ id: 'F', changes: { elevation: undefined } }]);
    await s.settle();
    expect(samePixels(s.canvas(), walking.canvas())).toBe(true);
    expect(samePixels(s.frame(), walking.frame())).toBe(true);
  });
});
