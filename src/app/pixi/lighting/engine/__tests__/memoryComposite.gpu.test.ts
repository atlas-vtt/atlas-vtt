import { Graphics, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { computeSight } from '../../../../vision/sight';
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
 * falloff changed (the dim range lit out to its edge, then held on dark maps, then the fade
 * within the dim range and the senses' fade towards their range, 2026-10-23). Another GPU or
 * driver may round a channel differently: record them there from what the first test below
 * reports.
 */
const RECORDED = { player: '016b47bc', gm: '62870fd9' } as const;
/**
 * The same scene without its lights, under an ambient light of 0.2: sight, darkvision, explored
 * memory and the GM's ghosted map. Recorded on beta before the light falloff changed (commit
 * f1ae04bd, same machine), and anew when a sense came to fade towards the edge of its range
 * (`SENSE_FADE`, 2026-10-23): what no light touches stays as it was but for that.
 */
const UNLIT: Partial<EngineScene> = { lights: [], ambient: 0.2 };
const UNLIT_RECORDED = { player: '6b7d35a6', gm: 'fe953c1b' } as const;
const DEFAULTS: MemoryOptions = { exploredMemory: true, exploredColor: '#ffffff', unexploredColor: '#000000' };

/** Screen points: remembered but unseen (world 100, 100), never seen (900, 900), seen by the token (780, 300). */
const REMEMBERED = [25, 25] as const;
const UNEXPLORED = [225, 225] as const;
const SEEN = [195, 75] as const;

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

  it('leaves what tokens see and the GM view as they were', async () => {
    const custom: MemoryOptions = { exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#336699' };
    expect((await render('player', custom))(...SEEN)).toEqual((await render('player'))(...SEEN));
    expect(hashOf(await render('gm', custom))).toBe(RECORDED.gm);
  });
});
