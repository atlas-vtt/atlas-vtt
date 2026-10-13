import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler, hasPendingChanges, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { captureBeforeRender } from '../../src/app/pixi/playerSafeFrame';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import { fogRectangle } from '../helpers/fogOperations';
import { differingIn, differingPixels, playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';
import type { Perception } from '../../src/app/vision/perception';
import type { TokenEntity } from '../../src/app/types';

const { scene } = playerViewScenes();
/** Three look-alikes in a row (no art: one group), each with its badge at the top right. */
const A = { id: 'A', x: 60, y: 60 };
const B = { id: 'B', x: 140, y: 60 };
const C = { id: 'C', x: 220, y: 60 };
type Spot = typeof A & { isHidden?: boolean };

async function build(tokens: Spot[], arrange?: (s: PlayerViewScene) => void): Promise<PlayerViewScene> {
  const s = await scene();
  await s.add(...tokens);
  arrange?.(s);
  return s;
}

const perceiving = (answers: Record<string, Perception>) => (id: string): Perception => answers[id] ?? 'seen';
const hide = (s: PlayerViewScene, id: string, isHidden: boolean): void => s.store.getState().updateToken(id, { isHidden });
/** A token's cell, badge included. */
const sameSpot = (a: Uint8ClampedArray, b: Uint8ClampedArray, { x, y }: Spot): boolean => differingIn(a, b, x - 39, y - 39, x + 39, y + 39) === 0;

/**
 * The GM's picture of the tokens with the numbers given, all seen: what the players' picture must show
 * once their numbers are `numbers`. Look-alikes off the picture make up the missing numbers.
 */
async function showing(numbers: Array<[Spot, number]>): Promise<Uint8ClampedArray> {
  const byNumber = new Map(numbers.map(([spot, number]) => [number, spot]));
  const top = Math.max(0, ...byNumber.keys());
  const spots = Array.from({ length: top }, (_, i) => byNumber.get(i + 1) ?? { id: `away${i}`, x: 1000 + 80 * i, y: 1000 });
  const s = await build(spots.map((spot) => ({ ...spot, isHidden: false })));
  return s.canvas();
}

/** The players' picture now, on the canvas in session view and in the window, against `expected`. */
function expectPlayersSee(s: PlayerViewScene, expected: Uint8ClampedArray): void {
  expect(samePixels(s.canvas(), expected)).toBe(true);
  expect(samePixels(s.frame(), expected)).toBe(true);
}

describe('a look-alike the players do not see', () => {
  it.each([
    ['hidden', [A, { ...B, isHidden: true }], undefined],
    ['under fog', [A, B], (s: PlayerViewScene): void => s.setFog({ paint: fogRectangle({ x: 110, y: 30, width: 60, height: 60 }) })],
    ['out of their sight', [A, B], (s: PlayerViewScene): void => { s.lighting.perception = perceiving({ B: 'unseen' }); }],
  ] as const)('changes no pixel of the players\' frame when %s', async (_case, tokens, arrange) => {
    const s = await build([...tokens], arrange);
    const reference = await build([A], arrange);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    s.store.getState().setGMView(false);
    reference.store.getState().setGMView(false);
    s.tokens.refreshPlayerSight();
    expect(samePixels(s.canvas(), reference.canvas())).toBe(true);
  });

  it('leaves the numbers of the others as if it were not there, while the GM view keeps its own', async () => {
    const s = await build([A, { ...B, isHidden: true }, C]);
    const reference = await build([A, C]);
    const gm = s.canvas();
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    // The GM sees 1 and 3; the players 1 and 2.
    expect(sameSpot(gm, await showing([[A, 1], [C, 3]]), C)).toBe(true);
    expect(sameSpot(gm, reference.canvas(), C)).toBe(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('takes its look-alike\'s badge while the players only sense it, and leaves its outline alone', async () => {
    // The outlines show as the lighting's list of the players' layers shows them.
    const sensed = (s: PlayerViewScene): void => {
      s.lighting.perception = perceiving({ B: 'sensed' });
      s.tokens.getSensedOutlineLayer().visible = true;
    };
    const s = await build([A, B], sensed);
    const frame = s.frame();
    expect(sameSpot(frame, (await build([A])).frame(), A)).toBe(true);
    expect(sameSpot(frame, (await build([B], sensed)).frame(), B)).toBe(true);
    expect(differingPixels(frame, (await build([A])).frame())).toBeGreaterThan(0);
  });

  it('comes back with the smallest number free once the players see it again', async () => {
    const s = await build([A, B]);
    s.frame();
    s.lighting.perception = perceiving({ B: 'sensed' });
    s.frame();
    await s.add(C);
    s.frame();
    s.lighting.perception = undefined;
    // A keeps 1, C came into view as 2, B comes back as 3.
    const reference = await build([A, C, B]);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    expect(samePixels(s.frame(), await showing([[A, 1], [C, 2], [B, 3]]))).toBe(true);
  });
});

describe('session view, the peek and pictures of the scene', () => {
  it('shows the players\' badges on the canvas in session view and gives the GM\'s back after', async () => {
    const s = await build([A, { ...B, isHidden: true }, C]);
    const gm = s.canvas();
    const thumbnail = s.thumbnail();
    s.store.getState().setGMView(false);
    expect(samePixels(s.canvas(), s.frame())).toBe(true);
    expect(samePixels(s.canvas(), (await build([A, C])).frame())).toBe(true);
    // A picture of the scene taken meanwhile is the GM's.
    expect(samePixels(s.thumbnail(), thumbnail)).toBe(true);
    s.store.getState().setGMView(true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('shows them during the peek and gives the GM\'s canvas back after', async () => {
    const s = await build([A, B, C], (scene) => { scene.lighting.perception = perceiving({ B: 'unseen' }); });
    const gm = s.canvas();
    s.peek(true);
    expect(samePixels(s.canvas(), await showing([[A, 1], [C, 2]]))).toBe(true);
    s.peek(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('numbers the window by its own sight in the command palette\'s player mode, which keeps the lighting and the GM\'s badges on the canvas', async () => {
    const s = await build([A, B, C], (scene) => { scene.lighting.perception = perceiving({ B: 'unseen' }); });
    const gm = s.canvas();
    s.events.emit('player-mode-changed', true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
    expect(samePixels(s.frame(), await showing([[A, 1], [C, 2]]))).toBe(true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });
});

describe('a scene loaded in session view', () => {
  it('is numbered by its own sight in the window and on the canvas, not by the sight kept from the scene before', async () => {
    const s = await build([A, B, C]);
    s.store.getState().setGMView(false);
    s.tokens.refreshPlayerSight();
    // Until the load ends the lighting answers with the sight of the scene before, which saw all three places.
    s.store.getState().setMapLoading(true);
    const loaded = (spot: Spot, instanceNumber: number): TokenEntity => ({ kind: 'token', imagePath: '', size: 1, ...spot, instanceNumber }) as TokenEntity;
    s.store.setState((state) => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, tokens: { A: loaded(A, 1), B: loaded(B, 2), C: loaded(C, 3) } } }));
    s.events.emit('map-loaded');
    await expect.poll(() => ['A', 'B', 'C'].every((id) => s.tokens.getTokenSprites()[id] instanceof Container)).toBe(true);
    await s.settle();
    // The load ends: the loaded scene's sight leaves B in the dark.
    s.lighting.perception = perceiving({ B: 'unseen' });
    s.store.getState().setMapLoading(false);
    expectPlayersSee(s, await showing([[A, 1], [C, 2]]));
  });
});

describe('session view while tokens are hidden and revealed', () => {
  it('gives both badges back when the hidden look-alike is revealed', async () => {
    const s = await build([A, B]);
    s.store.getState().setGMView(false);
    hide(s, 'B', true);
    expectPlayersSee(s, await showing([[A, 1]]));
    hide(s, 'B', false);
    const gmView = await showing([[A, 1], [B, 2]]);
    expectPlayersSee(s, gmView);
    s.store.getState().setGMView(true);
    expect(samePixels(s.canvas(), gmView)).toBe(true);
  });

  it('gives a revealed token its disc with the players\' number, beside a token keeping the GM\'s', async () => {
    const s = await build([A, B, C]);
    s.store.getState().setGMView(false);
    hide(s, 'A', true);
    hide(s, 'B', true);
    expectPlayersSee(s, await showing([[C, 1]]));
    hide(s, 'B', false);
    expectPlayersSee(s, await showing([[B, 1], [C, 3]]));
  });

  it('goes back to the GM\'s numbers once the players see what the GM sees', async () => {
    const s = await build([A, { ...B, isHidden: true }, C]);
    s.store.getState().setGMView(false);
    expectPlayersSee(s, await showing([[A, 1], [C, 2]]));
    hide(s, 'C', true);
    expectPlayersSee(s, await showing([[A, 1]]));
    hide(s, 'B', false);
    expectPlayersSee(s, await showing([[A, 1], [B, 2]]));
    hide(s, 'C', false);
    const gmView = await showing([[A, 1], [B, 2], [C, 3]]);
    expectPlayersSee(s, gmView);
    s.store.getState().setGMView(true);
    expect(samePixels(s.canvas(), gmView)).toBe(true);
  });
});

describe('rendering on change', () => {
  it.each([['the GM view', true], ['session view', false]])('renders nothing on an unchanged scene in %s while every render mirrors a players\' frame', async (_view, gmView) => {
    const s = await build([A, { ...B, isHidden: true }, C]);
    s.store.getState().setGMView(gmView);
    s.frame();
    const scheduler = new RenderScheduler(s.app);
    const stopMirror = setBeforeRender(s.app, () => captureBeforeRender(s.frameLayers(), () => s.app.renderer.render(s.app.stage), () => undefined));
    try {
      let time = 1000;
      const tick = (): void => { s.app.ticker.update(time += 8); };
      const renders = vi.spyOn(s.app.renderer, 'render');
      for (let i = 0; i < 20; i++) tick();
      expect(renders).toHaveBeenCalled();
      renders.mockClear();
      for (let i = 0; i < 120; i++) tick();
      expect(renders).not.toHaveBeenCalled();
      s.tokens.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView, s.lighting.perception);
      s.tokens.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView, s.lighting.perception);
      s.tokens.refreshPlayerSight();
      expect(hasPendingChanges(s.app.stage.renderGroup)).toBe(false);
      // A change still renders.
      hide(s, 'C', true);
      tick();
      expect(renders).toHaveBeenCalled();
    } finally {
      stopMirror();
      scheduler.destroy();
    }
  });
});
