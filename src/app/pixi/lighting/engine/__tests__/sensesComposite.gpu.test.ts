import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { TokenEntity } from '../../../../types';
import type { TokenSense } from '../../../../types/senseTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { seenSpots, type SeenSpot } from '../../../../vision/perception';
import { computeVisibility } from '../../../../vision/visibility';
import type { SenseDefinition } from '../../../../types/senseTypes';
import { computeSight, sightSources, type Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';

const SIZE = 256;
const MAP = 1024;
/** The whole map on screen, one screen pixel for four world pixels, on a blue-grey floor. */
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
/** One game unit is one world pixel. */
const scale = { unitDistance: 5, cellSize: 5 };

/** A lamp on the left: bright to 100 px, dim to 200 px. */
const lamp: EngineLight = { key: 'lamp', x: 250, y: 512, bright: 100, dim: 200, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
/** Right of the viewer, between it and the point behind the wall. */
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 850, y: 300 }, p2: { x: 850, y: 724 } };
const VIEWER = { x: 700, y: 512 };

/** World points, read at their screen pixel. */
const BRIGHT = { x: 300, y: 512 };
/** In the lamp's dim range early in its fade, where its light is still clearly brighter than darkvision's grey. */
const DIM = { x: 365, y: 512 };
/** Deeper in the lamp's fade, where its dim light has fallen well below its bright range's. */
const DIM_DEEP = { x: 395, y: 512 };
/** In the dark, 80 px from the viewer. */
const DARK = { x: 780, y: 512 };
/** In the dark, about 500 px from the viewer: beyond a sense given 400 px. */
const DARK_FAR = { x: 700, y: 1010 };
/** In the dark, 200 px from the viewer behind the wall. */
const BEHIND = { x: 900, y: 512 };

function sightWith(senses: TokenSense[]): Sight {
  const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses } };
  return computeSight(sightSources({ v: viewer }, scale, { width: MAP, height: MAP }, { definitions: ALL_SENSES, conditions: [] }), [wall]);
}

/** The footprint of a token at `point`, as walls leave it. */
function spotAt(point: { x: number; y: number }, radius = 31): SeenSpot {
  return { ...point, radius, polygon: computeVisibility(point, radius, [wall]) };
}

/** The one sense `id`, 400 px far where it takes a distance. */
function sense(id: string): TokenSense[] {
  const definition = ALL_SENSES.find((candidate) => candidate.id === id)!;
  return [{ id, ...(definition.range === 'required' && { range: 400 }) }];
}

const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
/** In sight and unlit: black but for a trace of the lamp's bounce. */
const isDark = (pixel: readonly number[]): boolean => luminance(pixel) < 4;
/** Largest difference between two channels: 0 for a grey. */
const chroma = (pixel: readonly number[]): number => Math.max(...pixel) - Math.min(...pixel);

describe('senses in the composite', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  function render(senses: TokenSense[], scene: Partial<EngineScene> = {}, mode: LightingMode = 'player'): Promise<(point: { x: number; y: number }) => readonly [number, number, number]> {
    return renderSight(sightWith(senses), scene, mode);
  }

  async function renderSight(sight: Sight, scene: Partial<EngineScene> = {}, mode: LightingMode = 'player'): Promise<(point: { x: number; y: number }) => readonly [number, number, number]> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [wall], lights: [lamp], sight, sightRadius: 20, ambient: 0, ...scene });
    engine.flush();
    const at: PixelReader = renderThroughEngine(engine, renderer, camera);
    return (point) => at(Math.round(point.x * camera.scale), Math.round(point.y * camera.scale));
  }

  it('shows sight alone what the lamp lights, and nothing of the dark', async () => {
    const at = await render([]);
    expect(luminance(at(BRIGHT))).toBeGreaterThan(luminance(at(DIM)));
    expect(luminance(at(DIM))).toBeGreaterThan(20);
    expect(isDark(at(DARK))).toBe(true);
    expect(at(BEHIND)).toEqual([0, 0, 0]);
  });

  it('darkvision: the dark within range in shades of grey, nothing behind the wall or beyond its range', async () => {
    const at = await render(sense('darkvision'));
    expect(luminance(at(DARK))).toBeGreaterThan(20);
    expect(chroma(at(DARK))).toBeLessThan(12);
    expect(at(BEHIND)).toEqual([0, 0, 0]);
    expect(isDark(at(DARK_FAR))).toBe(true);
  });

  it('the generic darkvision leaves dim light as it is; D&D darkvision sees it as bright', async () => {
    const plain = await render([]);
    const generic = await render(sense('darkvision'));
    const dnd = await render(sense('dnd5e-darkvision'));
    expect(generic(DIM)).toEqual(plain(DIM));
    // Seen as bright, the lamp's light is its bright level there, faded as the light is (`FADE_GLSL`), and the sense fades towards its range's edge.
    expect(luminance(dnd(DIM_DEEP))).toBeGreaterThan(luminance(plain(DIM_DEEP)) * 1.2);
    expect(dnd(DARK)).toEqual(generic(DARK));
    expect(dnd(BRIGHT)).toEqual(plain(BRIGHT));
  });

  it('low-light vision: dim light as bright, the dark stays dark', async () => {
    const plain = await render([]);
    const at = await render(sense('low-light-vision'));
    expect(luminance(at(DIM_DEEP))).toBeGreaterThan(luminance(plain(DIM_DEEP)) * 1.2);
    expect(isDark(at(DARK))).toBe(true);
    expect(at(BRIGHT)).toEqual(plain(BRIGHT));
  });

  it('low-light vision raises dim ambient light to bright, and leaves bright and dark ambient light alone', async () => {
    for (const [ambient, raised] of [[0.5, true], [1, false], [0.15, false]] as const) {
      const plain = await render([], { ambient, lights: [] });
      const at = await render(sense('low-light-vision'), { ambient, lights: [] });
      if (raised) expect(luminance(at(DARK))).toBeGreaterThan(luminance(plain(DARK)) * 1.2);
      else expect(at(DARK)).toEqual(plain(DARK));
    }
  });

  it('blindsight, truesight and devil\'s sight: the dark in colour and brighter than darkvision, nothing behind the wall', async () => {
    const grey = await render(sense('darkvision'));
    for (const id of ['blindsight', 'dnd5e-truesight', 'dnd5e-devils-sight', 'shadowdark-darkness-adapted', 'cyberpunkred-low-light-ir-uv']) {
      const at = await render(sense(id));
      const [r, , b] = at(DARK);
      expect(b - r).toBeGreaterThan(40);
      expect(luminance(at(DARK))).toBeGreaterThan(luminance(grey(DARK)) * 1.5);
      expect(at(BEHIND)).toEqual([0, 0, 0]);
    }
  });

  it('blindsight ends at its range; a sense without a distance reaches as far as the token sees', async () => {
    expect(isDark((await render(sense('blindsight')))(DARK_FAR))).toBe(true);
    expect(luminance((await render(sense('shadowdark-darkness-adapted')))(DARK_FAR))).toBeGreaterThan(40);
  });

  it('Pathfinder darkvision: black and white, and bright', async () => {
    const generic = await render(sense('darkvision'));
    const at = await render(sense('pathfinder2e-darkvision'));
    expect(chroma(at(DARK))).toBeLessThanOrEqual(2);
    expect(luminance(at(DARK))).toBeGreaterThan(luminance(generic(DARK)) * 1.5);
    expect(luminance(at(DARK_FAR))).toBeGreaterThan(40);
    expect(at(BEHIND)).toEqual([0, 0, 0]);
  });

  it('infravision: the dark in heat tones, warm and dim', async () => {
    const at = await render(sense('ose-infravision'));
    const [r, g, b] = at(DARK);
    expect(r).toBeGreaterThan(g + 20);
    expect(g).toBeGreaterThan(b);
    expect(at(BEHIND)).toEqual([0, 0, 0]);
  });

  it('shows the brighter look where two meet: colour over grey', async () => {
    const both = await render([...sense('darkvision'), ...sense('blindsight')]);
    const colour = await render(sense('blindsight'));
    expect(both(DARK)).toEqual(colour(DARK));
  });

  it('draws nothing for senses that only sense creatures, or that only change what the eyes see', async () => {
    const plain = await render([]);
    for (const id of ['tremorsense', 'pathfinder2e-scent', 'pathfinder2e-echolocation', 'see-invisible']) {
      const at = await render(sense(id));
      for (const point of [BRIGHT, DIM, DARK, DARK_FAR, BEHIND]) expect(at(point)).toEqual(plain(point));
    }
  });

  it('shows a token that only a precise creature sense sees within its footprint, in colour, and nothing around it', async () => {
    const spots = [spotAt(DARK)];
    const at = await render(sense('pathfinder2e-echolocation'), { spots });
    const [r, , b] = at(DARK);
    expect(b - r).toBeGreaterThan(40);
    expect(isDark(at({ x: DARK.x + 60, y: DARK.y }))).toBe(true);
    const behind = await render(sense('pathfinder2e-echolocation'), { spots: [spotAt(BEHIND)] });
    expect(luminance(behind(BEHIND))).toBeGreaterThan(40);
    expect(behind({ x: BEHIND.x, y: BEHIND.y + 60 })).toEqual([0, 0, 0]);
  });

  it('shows a party token that stands in darkness within its footprint, in the players\' view and the GM\'s', async () => {
    const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true } };
    const sight = sightWith([]);
    const spots = seenSpots(sight, { ambient: 0 }, [], { v: viewer }, 70, [wall]);
    expect(spots).toMatchObject([{ ...VIEWER, radius: 31 }]);
    const without = await render([]);
    expect(isDark(without(VIEWER))).toBe(true);
    for (const mode of ['player', 'gm'] as const) {
      const at = await render([], { spots }, mode);
      const [r, , b] = at(VIEWER);
      expect(b - r).toBeGreaterThan(40);
      expect(luminance(at(VIEWER))).toBeGreaterThan(luminance((await render([], {}, mode))({ x: VIEWER.x + 60, y: VIEWER.y })) + 40);
    }
    expect(isDark((await render([], { spots }))({ x: VIEWER.x + 60, y: VIEWER.y }))).toBe(true);
  });

  it('shows nothing past a wall of a footprint that reaches across it, however large the token', async () => {
    // 8 px left of the wall at x = 850, in a lit scene: the map right of the wall must stay unseen.
    const hugging = { x: 842, y: 512 };
    for (const radius of [31, 93, 217]) {
      const at = await render([], { spots: [spotAt(hugging, radius)], ambient: 1, lights: [] });
      expect(luminance(at({ x: 830, y: 512 }))).toBeGreaterThan(40);
      for (const past of [860, 870, 900, 1000]) expect(at({ x: past, y: 512 })).toEqual([0, 0, 0]);
      expect(at({ x: 870, y: 400 })).toEqual([0, 0, 0]);
    }
  });

  it('shows what only a sense without light and without the eyes perceives: such a region is seen, not remembered', async () => {
    // A sense of its own kind: darkness only, and no need of the eyes, so its region is in no sight.
    const eyeless: SenseDefinition = { ...ALL_SENSES.find((candidate) => candidate.id === 'ose-infravision')!, id: 'eyeless', worksWhileBlinded: true };
    const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses: [{ id: 'eyeless', range: 400 }] }, conditions: ['blind'] };
    const rules = { definitions: [eyeless], conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' as const }] };
    const sight = computeSight(sightSources({ v: viewer }, scale, { width: MAP, height: MAP }, rules), [wall]);
    expect(sight.regions.map((region) => region.sense.id)).toEqual(['eyeless']);
    const at = await renderSight(sight);
    expect(luminance(at(DARK))).toBeGreaterThan(8);
    expect(at(BEHIND)).toEqual([0, 0, 0]);
  });

  it('shows the GM what a sense perceives in the dark too', async () => {
    const plain = await render([], {}, 'gm');
    const at = await render(sense('blindsight'), {}, 'gm');
    expect(luminance(at(DARK))).toBeGreaterThan(luminance(plain(DARK)) + 40);
  });
});
