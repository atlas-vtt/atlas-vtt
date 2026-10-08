import { Application, Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { captureWithLayerVisibility } from '../playerSafeFrame';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../services/PlayerFrameMirror';
import type { AtlasSettings } from '../../services/SettingsService';
import type { PlayerCameraState } from '../../types/playerCamera';

const WIDTH = 96;
const HEIGHT = 64;
const SETTINGS = { showGrid: true } as AtlasSettings['localPlayerView'];
/** On a screen of 96 × 64 players see the world from (952, 468) to (1048, 532). */
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
  /** What the players' canvas shows at (x, y) of a frame 96 × 64 wide. */
  at(x: number, y: number): number[];
}

/** Players frozen on a real canvas whose pane then changes size, as when the DM closes a sidebar. */
describe('players frozen on a real canvas whose pane changes size', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  /** A map with a mark in two corners and the middle of what players are frozen on, and marks just outside it. */
  async function setup(resolution = 1): Promise<Stage> {
    const app = new Application();
    await app.init({ width: WIDTH, height: HEIGHT, resolution, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x00ff00 });
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
      getScreen: () => ({ width: app.screen.width, height: app.screen.height }),
      withPlayerSafeFrame: (capture, _settings, camera) => captureWithLayerVisibility(
        [],
        () => app.renderer.render(app.stage),
        capture,
        camera && { target: { screenWidth: app.screen.width, screenHeight: app.screen.height, position: world.position, scale: world.scale }, camera },
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
    const at = (x: number, y: number): number[] => Array.from(context.getImageData(x * resolution, y * resolution, 1, 1).data.slice(0, 3));
    return { app, target, mirrored, at };
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
    { name: 'wider', width: WIDTH + 64, height: HEIGHT, resolution: 1 },
    { name: 'wider and higher by odd amounts', width: WIDTH + 37, height: HEIGHT + 11, resolution: 1 },
    { name: 'wider on a display with two pixels per point', width: WIDTH + 37, height: HEIGHT, resolution: 2 },
  ])('shows players the very same pixels in a pane that became $name', async ({ width, height, resolution }) => {
    const stage = await setup(resolution);
    const frozen = stage.mirrored();
    expectFrozenPicture(stage);

    stage.app.renderer.resize(width, height);

    expect(stage.mirrored()).toEqual(frozen);
    expect([stage.target.width, stage.target.height]).toEqual([WIDTH * resolution, HEIGHT * resolution]);
  });

  it.each([
    { name: 'narrower', width: WIDTH / 2, height: HEIGHT },
    { name: 'lower', width: WIDTH, height: HEIGHT / 2 },
    { name: 'narrower and higher', width: WIDTH - 31, height: HEIGHT + 40 },
  ])('shows players the same picture in a pane that became $name', async ({ width, height }) => {
    const stage = await setup();
    stage.mirrored();

    stage.app.renderer.resize(width, height);
    stage.mirrored();

    expect([stage.target.width, stage.target.height]).toEqual([WIDTH, HEIGHT]);
    expectFrozenPicture(stage);
  });
});
