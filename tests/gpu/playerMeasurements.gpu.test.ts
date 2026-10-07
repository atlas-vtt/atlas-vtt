import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler, hasPendingChanges, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { captureBeforeRender } from '../../src/app/pixi/playerSafeFrame';
import { fogRectangle } from '../helpers/fogOperations';
import { differingIn, differingPixels, playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';
import type { Perception } from '../../src/app/vision/perception';

const { scene } = playerViewScenes();
/** Goblin and hero on cell centres; rulers run down from them. */
const GOBLIN = { id: 'goblin', x: 60, y: 60 };
const HERO = { id: 'hero', x: 180, y: 60 };
const FOG_OVER_GOBLIN = { paint: fogRectangle({ x: 30, y: 30, width: 60, height: 60 }) };

/** A scene with `tokens`, and in it whatever `arrange` does. */
async function build(tokens: Array<typeof GOBLIN & { isHidden?: boolean }>, arrange?: (s: PlayerViewScene) => void): Promise<PlayerViewScene> {
  const s = await scene();
  await s.add(...tokens);
  arrange?.(s);
  return s;
}

const perceiving = (answers: Record<string, Perception>) => (id: string): Perception => answers[id] ?? 'seen';

describe('a ruler drawn from a token the players do not see', () => {
  it('leaves the players\' frame as it was while the GM\'s canvas shows the ruler', async () => {
    const s = await build([{ ...GOBLIN, isHidden: true }, HERO]);
    const frame = s.frame();
    const gm = s.canvas();
    s.measureFrom(60, 60, 60, 220, true);
    expect(samePixels(s.frame(), frame)).toBe(true);
    expect(differingPixels(s.canvas(), gm)).toBeGreaterThan(200);
    // Captures leave the GM's canvas as it was.
    const withRuler = s.canvas();
    s.frame();
    expect(samePixels(s.canvas(), withRuler)).toBe(true);
  });

  it.each([
    ['under fog', (s: PlayerViewScene): void => s.setFog(FOG_OVER_GOBLIN)],
    ['unseen by their sight', (s: PlayerViewScene): void => { s.lighting.perception = perceiving({ goblin: 'unseen' }); }],
    ['only sensed', (s: PlayerViewScene): void => { s.lighting.perception = perceiving({ goblin: 'sensed' }); }],
  ])('leaves out a ruler from a token %s', async (_case, arrange) => {
    const s = await build([GOBLIN, HERO], arrange);
    const frame = s.frame();
    s.measureFrom(60, 60, 60, 220, true);
    expect(samePixels(s.frame(), frame)).toBe(true);
    expect(differingPixels(s.canvas(), frame)).toBeGreaterThan(200);
  });

  it('leaves out a ruler whose token was deleted', async () => {
    const s = await build([GOBLIN, HERO]);
    s.measureFrom(60, 60, 60, 220, true);
    s.store.getState().deleteToken('goblin');
    const reference = await build([HERO]);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
  });

  it('mirrors a ruler from a seen token, and one from empty floor, as the GM view shows it', async () => {
    const s = await build([HERO]);
    const before = s.frame();
    s.measureFrom(180, 60, 180, 220, true);
    expect(differingPixels(s.frame(), before)).toBeGreaterThan(200);
    expect(samePixels(s.frame(), s.canvas())).toBe(true);
    s.pointer('pointerup', 180, 220);
    s.measureFrom(220, 220, 20, 220, true);
    expect(samePixels(s.frame(), s.canvas())).toBe(true);
  });
});

describe('a kept ruler', () => {
  const kept = async (tokens: Parameters<typeof build>[0]): Promise<PlayerViewScene> => build(tokens, (s) => {
    s.events.emit('measure-persistence-changed', true);
    s.measureFrom(60, 60, 60, 220);
    s.store.getState().setActiveTool('select');
  });

  it('leaves the frame while its token is hidden after the fact, and comes back when it is revealed', async () => {
    const s = await kept([GOBLIN, HERO]);
    const shown = s.frame();
    s.store.getState().updateToken('goblin', { isHidden: true });
    const reference = await build([{ ...GOBLIN, isHidden: true }, HERO]);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    s.store.getState().updateToken('goblin', { isHidden: false });
    expect(samePixels(s.frame(), shown)).toBe(true);
  });

  it('stays out of the frame for good when its token was hidden as it started, even once revealed', async () => {
    const s = await kept([{ ...GOBLIN, isHidden: true }, HERO]);
    s.store.getState().updateToken('goblin', { isHidden: false });
    const reference = await build([GOBLIN, HERO]);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    expect(differingPixels(s.canvas(), reference.canvas())).toBeGreaterThan(200);
  });

  it('stays out while its token is moved away hidden', async () => {
    const s = await kept([GOBLIN, HERO]);
    s.store.getState().updateToken('goblin', { isHidden: true });
    s.store.getState().moveToken('goblin', 180, 180);
    const reference = await build([{ ...GOBLIN, x: 180, y: 180, isHidden: true }, HERO]);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
  });

  it('follows a seen token that walked off the start out of the players\' sight, and back', async () => {
    const s = await kept([GOBLIN, HERO]);
    s.store.getState().moveToken('goblin', 180, 180);
    const walked = s.frame();
    const noRuler = await build([{ ...GOBLIN, x: 180, y: 180 }, HERO]);
    expect(differingPixels(walked, noRuler.frame())).toBeGreaterThan(200);
    s.lighting.perception = perceiving({ goblin: 'unseen' });
    noRuler.lighting.perception = perceiving({ goblin: 'unseen' });
    expect(samePixels(s.frame(), noRuler.frame())).toBe(true);
    s.lighting.perception = undefined;
    expect(samePixels(s.frame(), walked)).toBe(true);
  });
});

describe('session view, the peek and pictures of the scene', () => {
  it('hides a ruler from a hidden token on the canvas in session view, and the GM view gets it back', async () => {
    const s = await build([{ ...GOBLIN, isHidden: true }, HERO]);
    s.events.emit('measure-persistence-changed', true);
    s.measureFrom(60, 60, 60, 220);
    const gm = s.canvas();
    const thumbnail = s.thumbnail();
    const reference = await build([{ ...GOBLIN, isHidden: true }, HERO]);
    s.store.getState().setGMView(false);
    reference.store.getState().setGMView(false);
    expect(samePixels(s.canvas(), reference.canvas())).toBe(true);
    expect(samePixels(s.frame(), reference.frame())).toBe(true);
    // A picture of the scene taken meanwhile is the GM's, ruler included.
    expect(samePixels(s.thumbnail(), thumbnail)).toBe(true);
    expect(differingPixels(thumbnail, reference.thumbnail())).toBeGreaterThan(200);
    s.store.getState().setGMView(true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('shows a ruler from a seen token in session view as the GM view does', async () => {
    const s = await build([HERO]);
    s.measureFrom(180, 60, 180, 220, true);
    const gm = s.canvas();
    s.store.getState().setGMView(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('hides it during the peek and gives the GM\'s canvas back after', async () => {
    const s = await build([GOBLIN, HERO]);
    s.lighting.perception = perceiving({ goblin: 'unseen' });
    s.events.emit('measure-persistence-changed', true);
    s.measureFrom(60, 60, 60, 220);
    const gm = s.canvas();
    const reference = await build([GOBLIN, HERO]);
    reference.lighting.perception = s.lighting.perception;
    s.peek(true);
    reference.peek(true);
    expect(samePixels(s.canvas(), reference.canvas())).toBe(true);
    s.peek(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('hides a kept ruler on the canvas when its token is dragged under fog in session view', async () => {
    const s = await build([GOBLIN, HERO]);
    s.events.emit('measure-persistence-changed', true);
    s.measureFrom(180, 60, 180, 220);
    s.setFog({ paint: fogRectangle({ x: 140, y: 140, width: 80, height: 80 }) });
    s.store.getState().setActiveTool('select');
    s.store.getState().setGMView(false);
    const shown = s.canvas();
    const reference = await build([GOBLIN, { ...HERO, x: 180, y: 180 }]);
    reference.setFog({ paint: fogRectangle({ x: 140, y: 140, width: 80, height: 80 }) });
    reference.store.getState().setGMView(false);
    // Where the ruler runs above the fog, the hero having left it.
    const ruler = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => differingIn(a, b, 160, 80, 200, 130);
    s.pointer('pointerdown', 180, 60);
    s.pointer('pointermove', 180, 120);
    expect(differingPixels(s.canvas(), shown)).toBeGreaterThan(0);
    expect(ruler(s.canvas(), reference.canvas())).toBeGreaterThan(100);
    // The hero is under fog now, still held: its ruler leaves the canvas with it.
    s.pointer('pointermove', 180, 180);
    expect(ruler(s.canvas(), reference.canvas())).toBe(0);
    s.pointer('pointerup', 180, 180);
    expect(samePixels(s.canvas(), reference.canvas())).toBe(true);
  });
});

describe('rendering on change', () => {
  it.each([['the GM view', true], ['session view', false]])('renders nothing on an unchanged scene in %s while every render mirrors a players\' frame', async (_view, gmView) => {
    const s = await build([{ ...GOBLIN, isHidden: true }, HERO]);
    s.events.emit('measure-persistence-changed', true);
    s.measureFrom(60, 60, 60, 220);
    s.measureFrom(180, 60, 180, 220);
    s.store.getState().setGMView(gmView);
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
      const seen = s.tokens.playersSeeInFrame(s.lighting.perception);
      s.measure.getPlayerViewLayers(seen);
      s.measure.getPlayerViewLayers(seen);
      s.measure.refreshVisibility();
      expect(hasPendingChanges(s.app.stage.renderGroup)).toBe(false);
      // A change still renders.
      s.store.getState().updateToken('hero', { isHidden: true });
      tick();
      expect(renders).toHaveBeenCalled();
    } finally {
      stopMirror();
      scheduler.destroy();
    }
  });
});
