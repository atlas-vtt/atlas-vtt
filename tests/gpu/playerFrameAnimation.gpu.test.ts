import { Application, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiquidLayerDeps } from '../../src/app/pixi/liquids/LiquidLayer';
import { createViewLiquids } from '../../src/app/pixi/liquids/viewLiquids';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { TickerRelay, WINDOW_ASLEEP_AFTER_MS } from '../../src/app/pixi/tickerRelay';
import type { LiquidSurface } from '../../src/app/types/liquidTypes';
import { playerFrameSource, playerWindow, viewOf } from '../helpers/playerFrameView';

const SIZE = 128;
const CELL = 70;
const POND: LiquidSurface = {
  id: 'pond', kind: 'liquid', liquid: 'water', flow: { x: 1, y: 0 },
  polygon: [{ x: 8, y: 8 }, { x: 120, y: 8 }, { x: 120, y: 120 }, { x: 8, y: 120 }],
  colors: { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' },
};

type State = ReturnType<LiquidLayerDeps['store']['getState']>;
const store: LiquidLayerDeps['store'] = {
  getState: () => ({ objects: { liquids: { pond: POND } }, levels: undefined, viewedLevel: undefined, grid: { size: CELL } }) as unknown as State,
  subscribe: () => () => undefined,
};

/**
 * A map view whose water moves, rendering only on change, and a player window shown it live.
 * The test runs without yielding, so the view's ticker never gets an animation frame of its own:
 * its window is hidden, as the DM's is behind a player window in front of it.
 */
describe('a player window in front of the DM window it shows', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function open(keepTime: boolean): Promise<{ pictures: Uint8ClampedArray[]; displayFrames: (count: number, dmToo: boolean) => void }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x7a6a55 });
    const scheduler = new RenderScheduler(app);
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: app.renderer.events });
    viewport.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill(0x7a6a55));
    app.stage.addChild(viewport);
    viewport.moveCenter(SIZE / 2, SIZE / 2);
    const liquids = createViewLiquids(app, viewport, store);
    viewport.addChild(liquids.container);
    liquids.buildPending();
    liquids.setMode('play');
    const { source, frames } = playerFrameSource({ renderer: app.renderer, stage: app.stage, ...viewOf(viewport, app.renderer), app });
    const relay = new TickerRelay([app.ticker]);
    if (keepTime) source.keepTime = (at) => relay.frame(at);
    let time = performance.now();
    const players = playerWindow(source, { width: SIZE, height: SIZE, resolution: 1 }, () => time);
    app.ticker.start();
    cleanup.push(() => {
      players.mirror.stop();
      frames.destroy();
      liquids.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    });

    const pictures: Uint8ClampedArray[] = [];
    const displayFrames = (count: number, dmToo: boolean): void => {
      for (let i = 0; i < count; i++) {
        time += 1000 / 60;
        const mirrored = players.frames.length;
        players.frame();
        if (dmToo) app.ticker.update(time);
        if (players.frames.length > mirrored) pictures.push(players.pixels());
      }
    };
    // Both windows shown: the first frames reach players as ever
    displayFrames(10, true);
    return { pictures, displayFrames };
  }

  const distinct = (pictures: Uint8ClampedArray[]): number => new Set(pictures.map((picture) => picture.join(','))).size;
  /** A second of display frames once the DM window counts as asleep. */
  const ASLEEP_FRAMES = Math.ceil(WINDOW_ASLEEP_AFTER_MS / (1000 / 60)) + 60;

  it('shows the water moving while the DM window is hidden', async () => {
    const { pictures, displayFrames } = await open(true);
    expect(distinct(pictures)).toBeGreaterThan(1);
    pictures.length = 0;

    displayFrames(ASLEEP_FRAMES, false);

    // The liquids' 30 frames a second, a players' frame each, every one another moment
    expect(pictures.length).toBeGreaterThanOrEqual(25);
    expect(distinct(pictures)).toBe(pictures.length);
  });

  it('without the view\'s clocks kept, shows players one still picture', async () => {
    const { pictures, displayFrames } = await open(false);
    pictures.length = 0;

    displayFrames(ASLEEP_FRAMES, false);

    expect(distinct(pictures)).toBeLessThanOrEqual(1);
  });
});
