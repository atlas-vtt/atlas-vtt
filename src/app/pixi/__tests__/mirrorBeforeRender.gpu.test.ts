import { Application, Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderScheduler, hasPendingChanges, requestRender, setBeforeRender } from '../RenderScheduler';
import { captureBeforeRender, frameCamera } from '../playerSafeFrame';
import { PlayerFrameTexture } from '../PlayerFrameTexture';
import { copiedPixel } from '../lighting/engine/__tests__/gpuTestUtils';
import type { PlayerFrame } from '../../types/playerFrame';

const SIZE = 64;
/** A players' frame larger than the canvas, on the middle of the map: it comes in four pieces. */
const FRAME: PlayerFrame = { width: 96, height: 96, resolution: 1, antialias: false, centerX: SIZE / 2, centerY: SIZE / 2, scale: 1 };
const MAP = [0, 0, 255];
const DM_ONLY = [255, 0, 0];

describe('mirroring a real stage right before its render', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  /** A blue map covered by a red DM-only layer, rendered on change and mirrored without the layer, through `frame`. */
  async function setup(frame: PlayerFrame = FRAME): Promise<{
    app: Application; world: Container; stageRenders: () => number; captured: number[][]; tick: () => void;
  }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x00ff00 });
    const scheduler = new RenderScheduler(app);
    const frames = new PlayerFrameTexture(app.renderer);
    cleanup.push(() => { frames.destroy(); scheduler.destroy(); app.destroy(true, { children: true }); });
    const world = new Container();
    const dmOnly = new Graphics().rect(0, 0, SIZE, SIZE).fill(0xff0000);
    world.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill(0x0000ff), dmOnly);
    app.stage.addChild(world);

    const captured: number[][] = [];
    setBeforeRender(app, () => captureBeforeRender(
      [{ layer: dmOnly, visible: false }],
      () => frames.render(app.stage, frame),
      // The middle of the frame lies in its first piece
      () => frames.copy((piece) => { if (piece.left === 0 && piece.top === 0) captured.push(copiedPixel(piece.image, 48, 48)); }),
      frameCamera(world, frame),
    ));
    const renders = vi.spyOn(app.renderer, 'render');
    /** Renders of the scene: the pieces of a frame are drawn with renders of their own. */
    const stageRenders = (): number => renders.mock.calls.filter(([options]) => 'container' in options && options.container === app.stage).length;
    let time = 1000;
    return { app, world, stageRenders, captured, tick: () => app.ticker.update(time += 8) };
  }

  it('costs one player render and one DM render, ends on the DM frame and leaves nothing pending', async () => {
    const { app, stageRenders, captured, tick } = await setup();

    tick();
    expect(stageRenders()).toBe(2);
    expect(captured).toEqual([MAP]);
    expect(copiedPixel(app.canvas, 8, 8)).toEqual(DM_ONLY);
    expect(hasPendingChanges(app.stage.renderGroup)).toBe(false);

    for (let i = 0; i < 5; i++) tick();
    expect(stageRenders()).toBe(2);
  });

  it('leaves nothing pending after a frame mirrored through a camera of the players\' own', async () => {
    // World (500, 500) in the middle of the frame: off the map, so players see the background
    const { app, world, stageRenders, captured, tick } = await setup({ ...FRAME, centerX: 500, centerY: 500 });

    tick();
    expect(captured).toEqual([[0, 255, 0]]);
    expect(copiedPixel(app.canvas, 8, 8)).toEqual(DM_ONLY);
    expect([world.position.x, world.position.y]).toEqual([0, 0]);
    expect(hasPendingChanges(app.stage.renderGroup)).toBe(false);

    for (let i = 0; i < 5; i++) tick();
    expect(stageRenders()).toBe(2);

    requestRender(app);
    for (let i = 0; i < 5; i++) tick();
    expect(stageRenders()).toBe(4);
  });
});
