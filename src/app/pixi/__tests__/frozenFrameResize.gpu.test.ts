import { Application, Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { captureWithLayerVisibility } from '../playerSafeFrame';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../services/PlayerFrameMirror';
import type { AtlasSettings } from '../../services/SettingsService';
import type { PlayerCameraState } from '../../types/playerCamera';

const WIDTH = 96;
const HEIGHT = 64;
const SETTINGS = { showGrid: true } as AtlasSettings['localPlayerView'];
/** On a pane of 96 × 64 players see the world from (952, 468) to (1048, 532). */
const FROZEN: PlayerCameraState = { centerX: 1000, centerY: 500, scale: 1 };
const BACKGROUND = [0, 255, 0];
const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
const WHITE = [255, 255, 255];

interface Stage {
  app: Application;
  target: HTMLCanvasElement;
  /** Mirrors a frame and returns the players' canvas, pixel by pixel. */
  mirrored(): number[];
  /** The DM's pane takes this size. */
  resizePane(width: number, height: number): void;
  /** What the players' canvas shows at the point (x, y) of the frame they were frozen on. */
  at(x: number, y: number): number[];
}

/** Players frozen on a real canvas whose pane then changes size, as when the DM closes a sidebar. */
describe('players frozen on a real canvas whose pane changes size', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  /** A map with a mark in two corners and the middle of what players are frozen on, and marks just outside it. */
  async function setup(resolution = 1, width = WIDTH, height = HEIGHT): Promise<Stage> {
    const app = new Application();
    await app.init({ width, height, resolution, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x00ff00 });
    // The viewport's screen is the pane's size, also where the canvas has no whole number of pixels for it
    let pane = { width, height };
    cleanup.push(() => app.destroy(true, { children: true }));
    const world = new Container();
    world.addChild(
      new Graphics().rect(952, 468, 10, 10).fill(0xff0000),
      new Graphics().rect(1038, 522, 10, 10).fill(0x0000ff),
      new Graphics().rect(990, 490, 20, 20).fill(0xffffff),
      // Around the frozen frame: none of it may ever show
      new Graphics().rect(852, 368, 100, 264).rect(1048, 368, 100, 264).rect(952, 368, 96, 100).rect(952, 532, 96, 100).fill(0xffff00),
    );
    app.stage.addChild(world);

    const source: PlayerFrameSource = {
      canvas: app.canvas,
      getScreen: () => ({ ...pane, resolution }),
      withPlayerSafeFrame: (capture, _settings, camera) => captureWithLayerVisibility(
        [],
        () => app.renderer.render(app.stage),
        capture,
        camera && { target: { screenWidth: pane.width, screenHeight: pane.height, position: world.position, scale: world.scale }, camera },
      ),
    };
    const target = document.createElement('canvas');
    const context = target.getContext('2d', { willReadFrequently: true })!;
    const mirror = new PlayerFrameMirror(target, context, {
      source: () => source,
      heldFrame: () => null,
      frozenCamera: () => FROZEN,
      settings: () => SETTINGS,
      onFrame: () => undefined,
    });
    const mirrored = (): number[] => {
      mirror.frame();
      return Array.from(context.getImageData(0, 0, target.width, target.height).data);
    };
    const at = (x: number, y: number): number[] =>
      Array.from(context.getImageData(Math.floor(x * resolution), Math.floor(y * resolution), 1, 1).data.slice(0, 3));
    const resizePane = (nextWidth: number, nextHeight: number): void => {
      app.renderer.resize(nextWidth, nextHeight);
      pane = { width: nextWidth, height: nextHeight };
    };
    return { app, target, mirrored, resizePane, at };
  }

  function expectFrozenPicture({ at }: Stage): void {
    expect(at(5, 5)).toEqual(RED);
    expect(at(90, 58)).toEqual(BLUE);
    expect(at(48, 32)).toEqual(WHITE);
    expect(at(20, 5)).toEqual(BACKGROUND);
    expect(at(1, 32)).toEqual(BACKGROUND);
    expect(at(94, 32)).toEqual(BACKGROUND);
    expect(at(48, 1)).toEqual(BACKGROUND);
    expect(at(48, 62)).toEqual(BACKGROUND);
  }

  it.each([
    { name: 'wider', from: [WIDTH, HEIGHT], to: [WIDTH + 64, HEIGHT], resolution: 1 },
    { name: 'wider and higher by odd amounts', from: [WIDTH, HEIGHT], to: [WIDTH + 37, HEIGHT + 11], resolution: 1 },
    { name: 'wider on a display with two pixels per point', from: [WIDTH, HEIGHT], to: [WIDTH + 37, HEIGHT], resolution: 2 },
    // 97 points are 121.25 pixels and 98 are 122.5: neither pane has a whole number of pixels
    { name: 'a point wider on a display at 125 %', from: [97, 65], to: [98, 65], resolution: 1.25 },
    { name: 'wider and higher on a display at 125 %', from: [97, 65], to: [160, 90], resolution: 1.25 },
    { name: 'wider and higher on a display at 175 %', from: [97, 65], to: [131, 76], resolution: 1.75 },
  ] as const)('shows players the very same pixels in a pane that became $name', async ({ from, to, resolution }) => {
    const stage = await setup(resolution, ...from);
    const frozen = stage.mirrored();
    const frozenSize = [stage.target.width, stage.target.height];
    expectFrozenPicture(stage);

    stage.resizePane(to[0], to[1]);

    expect(stage.mirrored()).toEqual(frozen);
    expect([stage.target.width, stage.target.height]).toEqual([Math.round(from[0] * resolution), Math.round(from[1] * resolution)]);
    expect(frozenSize).not.toEqual([stage.app.canvas.width, stage.app.canvas.height]);
  });

  it.each([
    { name: 'narrower', width: WIDTH / 2, height: HEIGHT },
    { name: 'lower', width: WIDTH, height: HEIGHT / 2 },
    { name: 'narrower and higher', width: WIDTH - 31, height: HEIGHT + 40 },
  ])('shows players the same picture in a pane that became $name', async ({ width, height }) => {
    const stage = await setup();
    stage.mirrored();

    stage.resizePane(width, height);
    stage.mirrored();

    expect([stage.target.width, stage.target.height]).toEqual([WIDTH, HEIGHT]);
    expectFrozenPicture(stage);
  });
});
