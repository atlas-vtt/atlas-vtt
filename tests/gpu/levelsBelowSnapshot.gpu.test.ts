import '../setup/obsidianDom';
import { Matrix, RenderTexture, type Renderer, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { BELOW_PLAYER_DIM } from '../../src/app/pixi/lighting/levels/LevelsBelow';
import { LEVELS, openLevelsView, paintedTexture, worldOf, type LevelsView } from '../helpers/levelsView';
import { light, magenta, token } from '../helpers/levelsFuzz';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const HOLE = { x: 100, y: 100, w: 200, h: 200 };
const rect = ({ x, y, w, h }: typeof HOLE): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const hole: LevelSurface = { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(HOLE) };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, type: 'solid', levels: ['upper'] });

/** What the tests read of a level below inside the view: its stage and engine, and how many snapshots are held. */
interface Inside {
  view: {
    levelsBelow: {
      levels: Map<string, { stage: { render(renderer: Renderer, target: RenderTexture, camera: Matrix): void }; engine: { setMode(mode: 'player' | 'gm'): void; setView(m: Matrix, zoom: number): void } }>;
      snapshots: { snapshots: Map<string, unknown> };
    };
  };
}

const inside = (view: LevelsView): Inside['view']['levelsBelow'] => (view.controller.renderer as unknown as Inside).view.levelsBelow;

/** The scene: a scout on the upper floor whose view through the hole a wall cuts in part, a lamp below. */
async function scene(view: LevelsView, scout: [number, number], walls: Record<string, WallSegment>): Promise<void> {
  const lights: Record<string, LightSource> = { lamp: light('lamp', [210, 230], 'ground', 90) };
  const tokens: Record<string, TokenEntity> = { scout: token('scout', scout, 'upper', { vision: { enabled: true } }) };
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: { ...view.store.getState().objects, tokens, walls, lights, levelSurfaces: { hole } },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: 0.3 });
  await view.settle();
}

/**
 * The level below as the view drew it before snapshots: its own composite rendered through the
 * picture's camera at the picture's pixels, read back.
 */
function livePicture(view: LevelsView, scale: number, x: number, y: number): Uint8ClampedArray {
  const level = inside(view).levels.get('ground')!;
  const camera = new Matrix(scale, 0, 0, scale, x, y);
  level.engine.setMode('player');
  level.engine.setView(camera.clone().invert(), scale);
  const target = RenderTexture.create({ width: PANE, height: PANE, resolution: 1, antialias: false });
  try {
    level.stage.render(view.app.renderer, target, camera);
    return (view.app.renderer as WebGLRenderer).extract.pixels({ target }).pixels;
  } finally {
    target.destroy(true);
  }
}

describe('a level below seen through an opening is a world-space snapshot', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  it.each([[1, 0, 0], [1.7, -60, -90], [0.6, 20, 10]])('shows the players what the level\'s own composite drew live, within a texel\'s filtering (scale %f)', async (scale, x, y) => {
    // A smooth floor below, in its magenta hue: a picture at another sampling of it differs only where the light or sight does.
    const below = paintedTexture(MAP, MAP, (px, py) => [140 + px / 6, 30, 140 + py / 6]);
    const view = await openLevelsView({ map: MAP, pane: PANE, below });
    views.push(view);
    // The wall cuts the scout's view into the right half of the hole: a sight edge runs across it.
    await scene(view, [150, 60], { w: wall('w', 200, 0, 200, 140) });
    const frame = await view.settledPlayerFrame(scale, x, y);
    const live = livePicture(view, scale, x, y);
    let pixels = 0;
    let close = 0;
    let total = 0;
    for (let sy = 0; sy < PANE; sy++) {
      for (let sx = 0; sx < PANE; sx++) {
        const p = worldOf(sx, sy, 1, scale, x, y);
        // Inside the hole, a world pixel off its rim.
        if (p.x < HOLE.x + 1 || p.y < HOLE.y + 1 || p.x > HOLE.x + HOLE.w - 1 || p.y > HOLE.y + HOLE.h - 1) continue;
        const o = (sy * PANE + sx) * 4;
        const diff = Math.max(...[0, 1, 2].map((c) => Math.abs(frame[o + c]! - live[o + c]! * BELOW_PLAYER_DIM)));
        pixels++;
        total += diff;
        if (diff <= 3) close++;
      }
    }
    expect(pixels).toBeGreaterThan(2000);
    // The snapshot is read texel by texel: where a screen pixel takes in several of them (zoomed out), sight's soft edge differs a little.
    expect(close / pixels).toBeGreaterThan(scale < 1 ? 0.97 : 0.999);
    expect(total / pixels).toBeLessThan(1);
  });

  it('fails closed: the players\' frame shows nothing of the level below the moment the party stops seeing it', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    const walls = { w: wall('w', 0, 400, MAP, 400) };
    await scene(view, [150, 60], walls);
    const count = (pixels: Uint8ClampedArray): number => {
      let n = 0;
      for (let o = 0; o < pixels.length; o += 4) if (magenta(pixels, o)) n++;
      return n;
    };
    const scale = PANE / MAP;
    expect(count(view.playerFrame(scale, 0, 0))).toBeGreaterThan(5000);
    // The scout steps behind the wall: the very next frame, before any display frame runs, shows none of it.
    view.store.getState().setTokenPositions([{ id: 'scout', x: 150, y: 460 }]);
    expect(count(view.playerFrame(scale, 0, 0))).toBe(0);
    expect(count(view.gmCanvas(scale, 0, 0))).toBeGreaterThan(5000);
  });

  it('draws nothing anew while the camera pans and zooms, draws when the level changes, and gives its textures back when it is no longer seen', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, [150, 60], {});
    const renderer = view.app.renderer as WebGLRenderer;
    let drawn = 0;
    const render = renderer.render.bind(renderer);
    renderer.render = ((...args: Parameters<typeof render>) => {
      if ((args[0] as { container?: { label?: string } }).container?.label === 'level-below') drawn++;
      return render(...args);
    }) as typeof renderer.render;
    view.gmCanvas(0.5, 0, 0);
    view.playerFrame(0.5, 0, 0);
    drawn = 0;
    for (let i = 0; i < 12; i++) {
      view.gmCanvas(0.4 + i * 0.1, -i * 7, i * 3);
      view.playerFrame(0.4 + i * 0.1, -i * 7, i * 3);
    }
    expect(drawn).toBe(0);
    // A lamp below moves: each look in use is drawn once.
    view.store.setState({ objects: { ...view.store.getState().objects, lights: { lamp: light('lamp', [150, 150], 'ground', 90) } } });
    view.gmCanvas(1, 0, 0);
    view.playerFrame(1, 0, 0);
    expect(drawn).toBe(2);
    expect(inside(view).snapshots.snapshots.size).toBe(2);
    // The player window closes: the players' snapshot goes; the opening goes: the level and the GM's go.
    view.controller.renderer.releaseBelowPicture?.();
    expect(inside(view).snapshots.snapshots.size).toBe(1);
    view.store.setState({ objects: { ...view.store.getState().objects, levelSurfaces: {} } });
    await view.settle();
    expect(inside(view).levels.size).toBe(0);
    expect(inside(view).snapshots.snapshots.size).toBe(0);
  });
});
