import { Graphics, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { computeSight, SEES_ALL } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { darkvision } from '../../../../vision/__tests__/senseSources';

const SIZE = 256;
const MAP = 1024;
/** The whole map on screen: one screen pixel is four world pixels. */
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };

const lights: EngineLight[] = [
  { key: 'a', x: 250, y: 750, bright: 80, dim: 160, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' },
  { key: 'b', x: 760, y: 360, bright: 60, dim: 120, flame: 8, color: [0.6, 0.8, 1], intensity: 1, animation: 'none' },
];
const walls: WallSegment[] = [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 640, y: 150 }, p2: { x: 640, y: 450 } }];
/** A token right of the wall that sees 250 px, darkvision 120 px. */
const sight = computeSight([{ tokenId: 't', origin: { x: 780, y: 300 }, range: 250, senses: [darkvision(120)] }], walls);

type MemoryOptions = Pick<EngineScene, 'exploredMemory' | 'exploredColor' | 'unexploredColor'>;

function scene(options: MemoryOptions & Partial<EngineScene>): EngineScene {
  return { bounds: { width: MAP, height: MAP }, albedo: null, walls, lights, sight, sightRadius: 20, ambient: 0.05, ambientColor: '#ffd9b3', ...options };
}

/**
 * Hashes of this scene with no scene option set, on the maintainer's machine (Apple silicon,
 * Chromium through ANGLE on Metal). They pin the whole look: first taken from the composite
 * before the scene options existed (commit 55c33d23), and recorded anew each time the light
 * falloff changed (the dim range lit out to its edge, then held on dark maps). Another GPU or
 * driver may round a channel differently: record them there from what the first test below
 * reports.
 */
const RECORDED = { player: 'e6fb64f5', gm: 'fb04ade6' } as const;
/**
 * The same scene without its lights, under an ambient light of 0.2: sight, darkvision, explored
 * memory and the GM's ghosted map. Recorded on beta before the light falloff changed (commit
 * f1ae04bd, same machine): what no light touches must stay as it was.
 */
const UNLIT: Partial<EngineScene> = { lights: [], ambient: 0.2 };
const UNLIT_RECORDED = { player: 'bb6aae6c', gm: 'c1acb236' } as const;
const DEFAULTS: MemoryOptions = { exploredMemory: true, exploredColor: '#ffffff', unexploredColor: '#000000' };

/** Screen points: remembered but unseen (world 100, 100), never seen (900, 900), seen by the token (780, 300). */
const REMEMBERED = [25, 25] as const;
const UNEXPLORED = [225, 225] as const;
const SEEN = [195, 75] as const;
/** Screen point at the centre of light a (world 250, 750). */
const LIT = [62, 187] as const;
/** Screen point in light a's dim range (world 250, 850): the map lies darker there than the fog map. */
const LIT_DIM = [62, 212] as const;

/** FNV-1a over every channel of the render. */
function hashOf(at: PixelReader): string {
  let hash = 0x811c9dc5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (const channel of at(x, y)) hash = Math.imul(hash ^ channel, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** The largest difference of a channel between two renders. */
function largestDifference(a: PixelReader, b: PixelReader): number {
  let largest = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const other = b(x, y);
      a(x, y).forEach((channel, i) => { largest = Math.max(largest, Math.abs(channel - other[i]!)); });
    }
  }
  return largest;
}

function expectColour(pixel: readonly [number, number, number], hex: number): void {
  const expected = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
  // The composite's dither moves a channel by at most one level.
  pixel.forEach((channel, i) => expect(Math.abs(channel - expected[i]!)).toBeLessThanOrEqual(1));
}

describe('explored memory in the composite', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** Memory covers the left half of the map. */
  function exploredLeftHalf(renderer: WebGLRenderer): RenderTexture {
    const texture = RenderTexture.create({ width: MAP / 2, height: MAP / 2 });
    const g = new Graphics().rect(0, 0, MAP / 4, MAP / 2).fill({ color: 0xffffff });
    renderer.render({ container: g, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
    g.destroy();
    return texture;
  }

  async function render(mode: LightingMode, options: MemoryOptions & Partial<EngineScene> = {}): Promise<PixelReader> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = exploredLeftHalf(renderer);
    cleanup.push(() => explored.destroy(true));
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.setExplored(explored);
    engine.update(scene(options));
    engine.flush();
    return renderThroughEngine(engine, renderer, camera);
  }

  it('draws both views exactly as recorded when no scene option is set', async () => {
    expect(hashOf(await render('player'))).toBe(RECORDED.player);
    expect(hashOf(await render('gm'))).toBe(RECORDED.gm);
  });

  it('draws a scene without lights exactly as before the light falloff changed', async () => {
    expect(hashOf(await render('player', UNLIT))).toBe(UNLIT_RECORDED.player);
    expect(hashOf(await render('gm', UNLIT))).toBe(UNLIT_RECORDED.gm);
  });

  it('draws the default options exactly as with none set', async () => {
    expect(hashOf(await render('player', DEFAULTS))).toBe(hashOf(await render('player')));
    expect(hashOf(await render('gm', DEFAULTS))).toBe(hashOf(await render('gm')));
  });

  it('shows the fixed scene as the tests below expect it', async () => {
    const at = await render('player');
    expectColour(at(...UNEXPLORED), 0x000000);
    const sum = (pixel: readonly number[]): number => pixel.reduce((total, channel) => total + channel, 0);
    expect(sum(at(...REMEMBERED))).toBeGreaterThan(60);
    expect(sum(at(...SEEN))).toBeGreaterThan(sum(at(...REMEMBERED)));
  });

  it('fills never-seen areas with the unexplored colour', async () => {
    const at = await render('player', { unexploredColor: '#336699' });
    expectColour(at(...UNEXPLORED), 0x336699);
  });

  it('tints remembered areas with the explored colour', async () => {
    const neutral = (await render('player'))(...REMEMBERED);
    const [r, g, b] = (await render('player', { exploredColor: '#ff0000' }))(...REMEMBERED);
    expect(Math.abs(r - neutral[0])).toBeLessThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
  });

  it('shows the unexplored colour where memory would be while explored memory is off', async () => {
    const at = await render('player', { exploredMemory: false, unexploredColor: '#336699' });
    expectColour(at(...REMEMBERED), 0x336699);
    expectColour((await render('player', { exploredMemory: false }))(...REMEMBERED), 0x000000);
  });

  /** A fog map over the whole map: `color` where it is drawn, transparent elsewhere. */
  async function renderWithFogMap(mode: LightingMode, draw: (g: Graphics) => Graphics, options: MemoryOptions & Partial<EngineScene> = {}): Promise<PixelReader> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const fog = RenderTexture.create({ width: MAP / 4, height: MAP / 4 });
    const g = draw(new Graphics());
    renderer.render({ container: g, target: fog, clear: true, clearColor: [0, 0, 0, 0] });
    g.destroy();
    cleanup.push(() => fog.destroy(true));
    const explored = exploredLeftHalf(renderer);
    cleanup.push(() => explored.destroy(true));
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.setExplored(explored);
    engine.update(scene({ ...options, unexploredTexture: fog }));
    engine.flush();
    return renderThroughEngine(engine, renderer, camera);
  }

  it('shows the fog map over never-seen areas, and the unexplored colour where it is transparent', async () => {
    // The fog map's right half is drawn, its left half is transparent.
    const rightHalf = (g: Graphics): Graphics => g.rect(MAP / 8, 0, MAP / 8, MAP / 4).fill({ color: 0xcc6633 });
    const at = await renderWithFogMap('player', rightHalf, { exploredMemory: false, unexploredColor: '#336699' });
    expectColour(at(...UNEXPLORED), 0xcc6633);
    expectColour(at(...REMEMBERED), 0x336699);
  });

  it('fills the dark with the fog map where no token has vision, and leaves lit places and the GM view as they were', async () => {
    const whole = (g: Graphics): Graphics => g.rect(0, 0, MAP / 4, MAP / 4).fill({ color: 0xeeeeee });
    const noVision: Partial<EngineScene> = { sight: SEES_ALL, ambient: 0 };
    const fogged = await renderWithFogMap('player', whole, noVision);
    const plain = await render('player', noVision);
    // Far from both lights: pitch dark without the fog map, the fog map with it.
    expectColour(plain(...UNEXPLORED), 0x000000);
    expectColour(fogged(...UNEXPLORED), 0xeeeeee);
    // Wherever a light shows the map, it shows as the light shows it: no pale fog shines through.
    expect(fogged(...LIT)).toEqual(plain(...LIT));
    expect(fogged(...LIT_DIM)).toEqual(plain(...LIT_DIM));
    expect(hashOf(await renderWithFogMap('gm', whole, noVision))).toBe(hashOf(await render('gm', noVision)));
  });

  it('shows the unexplored colour, not the edge of the fog map drawn out, beyond the map', async () => {
    const whole = (g: Graphics): Graphics => g.rect(0, 0, MAP / 4, MAP / 4).fill({ color: 0xeeeeee });
    // The camera shows the map's right half and as much again beyond its edge.
    const beyond = { ...camera, x: -MAP / 2 * camera.scale };
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const fog = RenderTexture.create({ width: MAP / 4, height: MAP / 4 });
    const g = whole(new Graphics());
    renderer.render({ container: g, target: fog, clear: true, clearColor: [0, 0, 0, 0] });
    g.destroy();
    cleanup.push(() => fog.destroy(true));
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update(scene({ exploredMemory: false, unexploredColor: '#336699', unexploredTexture: fog, sight: SEES_ALL, ambient: 0, lights: [] }));
    engine.flush();
    const at = await renderThroughEngine(engine, renderer, beyond);
    expectColour(at(SIZE / 4, SIZE / 2), 0xeeeeee);
    // Where the composite reaches past the map (its sight layers may), never the fog map's edge.
    const [r, g2, b] = at(SIZE * 3 / 4, SIZE / 2);
    expect(r + g2 + b).toBeLessThan(3 * 0xee - 60);
  });

  it('fades the map a light reveals into the fog map inside its edge, and leaves its centre as it was', async () => {
    const whole = (g: Graphics): Graphics => g.rect(0, 0, MAP / 4, MAP / 4).fill({ color: 0xeeeeee });
    const noVision: Partial<EngineScene> = { sight: SEES_ALL, ambient: 0 };
    const hard = await renderWithFogMap('player', whole, noVision);
    const soft = await renderWithFogMap('player', whole, { ...noVision, unexploredSoftness: 60 });
    expect(soft(...LIT)).toEqual(hard(...LIT));
    // Near the dim edge (world 250, 900, 10 px inside it) the soft fade shows more of the pale fog map.
    const sum = (pixel: readonly number[]): number => pixel.reduce((total, channel) => total + channel, 0);
    expect(sum(soft(62, 225))).toBeGreaterThan(sum(hard(62, 225)) + 30);
  });

  it('leaves what tokens see and the GM view as they were', async () => {
    const custom: MemoryOptions = { exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#336699' };
    expect((await render('player', custom))(...SEEN)).toEqual((await render('player'))(...SEEN));
    expect(hashOf(await render('gm', custom))).toBe(RECORDED.gm);
  });
});
