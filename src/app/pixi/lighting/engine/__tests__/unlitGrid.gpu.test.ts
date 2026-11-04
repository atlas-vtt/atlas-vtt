import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { applyGridMark, createMarkBacking, type GridMarkColor, type UnlitGrid } from '../../../../grid/gridLightingMark';
import { computeSight, SEES_ALL, type Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, readRgba, type PixelReader } from './gpuTestUtils';

const SIZE = 256;
const RED = 0xff0000;
/** On the grid's vertical line, clear of the token; on it under the token; plain floor. */
const LINE = [104, 30] as const;
const UNDER_TOKEN = [104, 160] as const;
const FLOOR = [40, 200] as const;

/** A grid of two thick lines, marked as `GridSystem` marks its grid. */
class TestGrid implements UnlitGrid {
  readonly view = new Container({ label: 'grid' });
  private readonly backing = createMarkBacking(0, 0, SIZE, SIZE);
  private marked = false;

  constructor(private readonly color: GridMarkColor) {
    const lines = new Graphics().rect(100, 0, 8, SIZE).rect(0, 60, SIZE, 8).fill({ color: color.color, alpha: 1 });
    this.view.addChild(this.backing, lines);
    applyGridMark(this.view, this.backing, false);
  }

  setMarking(on: boolean): void {
    this.marked = on;
    applyGridMark(this.view, this.backing, on);
  }

  markColor(): GridMarkColor | null {
    return this.marked && this.view.visible ? this.color : null;
  }

  isMarked(): boolean {
    return this.marked;
  }
}

/** A bright light right over the grid's line. */
const lamp: EngineLight = { key: 'l', x: LINE[0], y: LINE[1], bright: 80, dim: 160, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };

function scene(sight: Sight, ambient: number, lights: EngineLight[]): EngineScene {
  return { bounds: { width: SIZE, height: SIZE }, albedo: null, walls: [], lights, sight, sightRadius: 20, ambient };
}

/** A token's sight far from everything drawn: the players see nothing of it. */
const farSight = computeSight([{ tokenId: 't', origin: { x: 2000, y: 2000 }, range: 10, senses: [] }], []);

describe('the grid under dynamic lighting', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function engineFor(sight: Sight, ambient: number, mode: 'gm' | 'player', lights: EngineLight[] = []): Promise<{ engine: LightingEngine; renderer: WebGLRenderer }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.update(scene(sight, ambient, lights));
    engine.flush();
    return { engine, renderer };
  }

  /** Map, grid, a token over the grid's line, the lighting: rendered into a target cleared to transparent, as a thumbnail is. */
  function render(engine: LightingEngine, renderer: WebGLRenderer, grid: TestGrid | null): PixelReader {
    const world = new Container();
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(SIZE, SIZE);
    floor.tint = 0x808080;
    const token = new Sprite(Texture.WHITE);
    token.setSize(40, 40);
    token.position.set(84, 140);
    token.tint = 0x3366ff;
    world.addChild(floor, ...(grid ? [grid.view] : []), token, engine.layer);
    engine.setView(new Matrix(), 1);
    engine.setGrid(grid);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    renderer.render({ container: world, target, clear: true, clearColor: [0, 0, 0, 0] });
    const pixels = readRgba(renderer, target);
    world.removeChild(engine.layer);
    if (grid) world.removeChild(grid.view);
    world.destroy({ children: true });
    target.destroy(true);
    return (sx, sy) => {
      const i = (sy * SIZE + sx) * 4;
      return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    };
  }

  it('shows the GM the grid in its own colour in the dark', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 0, 'gm');
    const grid = new TestGrid({ color: RED, contrasting: false });
    const read = render(engine, renderer, grid);
    expect(grid.isMarked()).toBe(true);
    const [r, g, b] = read(...LINE);
    expect(r).toBeGreaterThan(245);
    expect(g).toBeLessThan(8);
    expect(b).toBeLessThan(8);
  });

  it('keeps the grid under the tokens', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 1, 'gm');
    const read = render(engine, renderer, new TestGrid({ color: RED, contrasting: false }));
    const [r, , b] = read(...UNDER_TOKEN);
    expect(b).toBeGreaterThan(r + 40);
  });

  it('leaves the scene off the grid as it was without one', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 0.5, 'gm');
    const without = render(engine, renderer, null);
    const withGrid = render(engine, renderer, new TestGrid({ color: RED, contrasting: false }));
    for (const [x, y] of [FLOOR, UNDER_TOKEN]) {
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(withGrid(x, y)[channel]! - without(x, y)[channel]!)).toBeLessThanOrEqual(1);
    }
  });

  it('shows the players the grid where the light shows them the map', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 1, 'player');
    const [r, g] = render(engine, renderer, new TestGrid({ color: RED, contrasting: false }))(...LINE);
    expect(r).toBeGreaterThan(245);
    expect(g).toBeLessThan(8);
  });

  it('never shows the players the grid over what they have not seen', async () => {
    for (const [sight, ambient] of [[farSight, 1], [SEES_ALL, 0]] as const) {
      const { engine, renderer } = await engineFor(sight, ambient, 'player');
      const grid = render(engine, renderer, new TestGrid({ color: RED, contrasting: false }))(...LINE);
      const floor = render(engine, renderer, null)(...LINE);
      for (let channel = 0; channel < 3; channel++) expect(Math.abs(grid[channel]! - floor[channel]!)).toBeLessThanOrEqual(1);
    }
  });

  it('draws a colour picked against the map white where the ambient light is low, whatever the lights', async () => {
    const black = { color: 0x000000, contrasting: true };
    const dark = await engineFor(SEES_ALL, 0, 'gm');
    expect(Math.min(...render(dark.engine, dark.renderer, new TestGrid(black))(...LINE))).toBeGreaterThan(245);
    const lit = await engineFor(SEES_ALL, 0, 'gm', [lamp]);
    expect(Math.min(...render(lit.engine, lit.renderer, new TestGrid(black))(...LINE))).toBeGreaterThan(245);
    const day = await engineFor(SEES_ALL, 1, 'gm');
    expect(Math.max(...render(day.engine, day.renderer, new TestGrid(black))(...LINE))).toBeLessThan(8);
  });

  it('keeps a colour of its own under a light', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 0, 'gm', [lamp]);
    const [r, g, b] = render(engine, renderer, new TestGrid({ color: RED, contrasting: false }))(...LINE);
    expect(r).toBeGreaterThan(245);
    expect(g).toBeLessThan(8);
    expect(b).toBeLessThan(8);
  });

  it('lets the grid draw itself once lighting is off', async () => {
    const { engine, renderer } = await engineFor(SEES_ALL, 0, 'gm');
    const grid = new TestGrid({ color: RED, contrasting: false });
    render(engine, renderer, grid);
    engine.setEnabled(false);
    expect(grid.isMarked()).toBe(false);
    expect(grid.view.blendMode).toBe('inherit');
  });
});
