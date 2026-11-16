import { BufferImageSource, Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { levelStack, shownAt, stackGrid, VIEWED } from '../../../../levels/levelStack';
import type { LevelSurface } from '../../../../types/sceneLevelTypes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { LevelStackTexture } from '../../levels/LevelStackTexture';
import { snapshotGrid, type SnapshotGrid } from '../../levels/belowSnapshot';
import { LightingEngine } from '../LightingEngine';
import type { EngineScene } from '../types';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 192;
const MAP = 512;
const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function scene(overrides: Partial<EngineScene> = {}): EngineScene {
  return { bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 1, ...overrides };
}

/**
 * A snapshot standing for the level below over `grid`: every texel its own colour, so a texel
 * taken from the wrong place, row or orientation shows. Returns the texture and its pixels.
 */
function patternSnapshot(grid: SnapshotGrid): { texture: Texture; pixels: Uint8Array } {
  const pixels = new Uint8Array(grid.width * grid.height * 4);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const o = (y * grid.width + x) * 4;
      pixels.set([(x * 37 + 15) % 256, (y * 53 + 15) % 256, (x * 11 + y * 29 + 64) % 256, 255], o);
    }
  }
  const source = new BufferImageSource({ resource: pixels, width: grid.width, height: grid.height, format: 'rgba8unorm', scaleMode: 'nearest', alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: false });
  return { texture: new Texture({ source }), pixels };
}

/** The snapshot texel that holds world point `w` (`snapshotTexel` in the composite), from the stack texel holding it. */
function snapshotTexelAt(grid: SnapshotGrid, stackTexel: number, w: { x: number; y: number }): { x: number; y: number } {
  const of = (value: number, origin: number): number => {
    const cell = Math.floor(value / stackTexel);
    const inside = Math.min(grid.sub - 1, Math.max(0, Math.floor(((value - cell * stackTexel) * grid.sub) / stackTexel)));
    return (cell - origin) * grid.sub + inside;
  };
  return { x: of(w.x, grid.x), y: of(w.y, grid.y) };
}

/** Renders a white map, the eraser and the engine's layer through a camera at `scale`, offset (x, y). */
function shoot(renderer: WebGLRenderer, engine: LightingEngine, eraser: Sprite | null, scale: number, x: number, y: number, resolution: number): Uint8ClampedArray {
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const stage = new Container();
  const world = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(MAP, MAP);
  world.addChild(map);
  if (eraser) world.addChild(eraser);
  world.addChild(engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
  renderer.render({ container: stage, target, clear: true });
  const pixels = readRgba(renderer, target);
  world.removeChildren();
  stage.destroy({ children: true });
  target.destroy(true);
  return pixels;
}

describe('the composite over openings', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  it.each([[1, MAP], [2, MAP], [1, 8192], [2, 8192]])('shows the snapshot below where the stack shows it, each pixel from the snapshot texel in its own stack texel, and the viewed level as before everywhere else (resolution %i, stack over %i px)', async (resolution, stackSide) => {
    const renderer = await createTestRenderer(SIZE, resolution);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    // Destroyed after the engine, whose composite reads it.
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update(scene());
    engine.flush();

    const [scale, x, y] = [0.61, -13.3, 7.7];
    const before = shoot(renderer, engine, null, scale, x, y, resolution);
    // On a stack over 8,192 px a stack texel is 4 px, split into snapshot texels of a world pixel.
    const stack = levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(60.3, 80.7, 140, 97) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: stackSide, height: stackSide }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const grid = snapshotGrid(stack)!;
    expect(grid.sub).toBe(stackSide === MAP ? 1 : 4);
    const snapshot = patternSnapshot(grid);
    cleanup.push(() => snapshot.texture.destroy(true));
    engine.setBelow({ textures: [snapshot.texture, null], x: grid.x, y: grid.y, sub: grid.sub }, 1);
    const after = shoot(renderer, engine, stackTexture.eraser, scale, x, y, resolution);

    const device = SIZE * resolution;
    let holes = 0;
    let wrong = 0;
    let moved = 0;
    for (let sy = 0; sy < device; sy++) {
      for (let sx = 0; sx < device; sx++) {
        const world = { x: ((sx + 0.5) / resolution - x) / scale, y: ((sy + 0.5) / resolution - y) / scale };
        if (world.x < 0 || world.y < 0 || world.x > MAP || world.y > MAP) continue;
        const o = (sy * device + sx) * 4;
        // Pixels whose centre lies on a snapshot texel's edge (and so on a stack texel's) may read either texel.
        const cell = { x: world.x / grid.texel, y: world.y / grid.texel };
        if (Math.abs(cell.x - Math.round(cell.x)) < 1e-3 || Math.abs(cell.y - Math.round(cell.y)) < 1e-3) continue;
        if (shownAt(stack, world) === VIEWED) {
          if (Math.abs(after[o]! - before[o]!) + Math.abs(after[o + 1]! - before[o + 1]!) + Math.abs(after[o + 2]! - before[o + 2]!) > 0) moved++;
        } else {
          holes++;
          const t = snapshotTexelAt(grid, stack.grid.texel, world);
          const e = (t.y * grid.width + t.x) * 4;
          if ([0, 1, 2].some((c) => Math.abs(after[o + c]! - snapshot.pixels[e + c]!) > 1)) wrong++;
        }
      }
    }
    expect(holes).toBeGreaterThan(1000);
    expect({ wrong, moved }).toEqual({ wrong: 0, moved: 0 });
    expect(watch.findings).toEqual([]);
  });

  it('shows nothing below where no picture of it was drawn for this render, black for the GM', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    // Destroyed after the engine, whose composite reads it.
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('gm');
    engine.update(scene());
    engine.flush();
    const stack = levelStack({ id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(0, 0, 256, 256) }] }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: MAP, height: MAP }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const pixels = shoot(renderer, engine, stackTexture.eraser, 0.375, 0, 0, 1);
    const at = (sx: number, sy: number): number[] => Array.from(pixels.slice((sy * SIZE + sx) * 4, (sy * SIZE + sx) * 4 + 3));
    expect(Math.max(...at(20, 20))).toBeLessThanOrEqual(1);
    expect(Math.min(...at(150, 150))).toBeGreaterThan(200);
  });

  it('draws a level below only in its own texels', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    // A level below renders only while the view's own lighting holds the back buffer, which PIXI's blend filters need even off-screen.
    renderer.backBuffer.useBackBuffer = true;
    const stackTexture = new LevelStackTexture();
    cleanup.push(() => stackTexture.destroy());
    const engine = new LightingEngine(renderer, undefined, { levelIndex: 1, backBuffer: false });
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    // Everything is seen and lit: only the stack decides what of the level shows.
    engine.update(scene({ sight: computeSight([{ tokenId: 't', origin: { x: 256, y: 256 }, range: 2000, senses: [] }], []) }));
    engine.flush();
    // Two openings: the floor of the viewed level between them lies inside the stack's texels.
    const surfaces: LevelSurface[] = [
      { id: 'west', kind: 'level-surface', open: true, polygon: rect(0, 0, 128, 512) },
      { id: 'east', kind: 'level-surface', open: true, polygon: rect(384, 0, 128, 512) },
    ];
    const stack = levelStack({ id: 'upper', surfaces }, [{ id: 'ground', surfaces: [] }], ['ground'], stackGrid({ width: MAP, height: MAP }));
    stackTexture.update(stack, (bound) => engine.setStack(bound));
    const pixels = shoot(renderer, engine, null, 0.375, 0, 0, 1);
    const at = (sx: number, sy: number): number => pixels[(sy * SIZE + sx) * 4]!;
    expect(at(20, 96)).toBeGreaterThan(200);
    expect(at(170, 96)).toBeGreaterThan(200);
    // The viewed level's own floor: black in the players' view.
    expect(at(96, 96)).toBeLessThanOrEqual(1);
  });
});
