import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import { lightFade } from '../../../../lighting/lightingConstants';
import type { TokenEntity } from '../../../../types';
import type { TokenSense } from '../../../../types/senseTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { seenSpots } from '../../../../vision/perception';
import { SEES_ALL, computeSight, lightReach, sightSources, type LightReach, type Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { LightingMode } from '../compositeFilter';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 256;
const MAP = 1024;
/** The whole map on screen, one screen pixel for four world pixels, on a blue-grey floor. */
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0, tint: 0x6699cc };
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const scale = { unitDistance: 5, cellSize: 5 };
const bounds = { width: MAP, height: MAP };

/** A lamp on the left: bright to 100 px, dim to 200 px. */
const lamp: EngineLight = { key: 'lamp', x: 250, y: 512, bright: 100, dim: 200, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none' };
/** A Darkness of 100 px over the lamp's right half. */
const darkness: EngineLight = { key: 'darkness', x: 330, y: 512, bright: 0, dim: 100, flame: 12, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
/** Right of the viewer, between it and the point behind the wall. */
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 850, y: 300 }, p2: { x: 850, y: 724 } };
const VIEWER = { x: 700, y: 512 };

/** Inside the darkness, where the lamp would be bright. */
const SWALLOWED = { x: 300, y: 512 };
/** Outside the darkness, in the lamp's bright light. */
const LIT = { x: 190, y: 512 };
/** In the dark, 80 px from the viewer: neither lamp nor darkness reaches it. */
const UNLIT = { x: 780, y: 512 };

function sightWith(senses: TokenSense[], extra: Record<string, TokenEntity> = {}): Sight {
  const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true, senses } };
  return computeSight(sightSources({ v: viewer, ...extra }, scale, bounds, { definitions: ALL_SENSES, conditions: [] }), [wall]);
}

function sense(id: string): TokenSense[] {
  const definition = ALL_SENSES.find((candidate) => candidate.id === id)!;
  return [{ id, ...(definition.range === 'required' && { range: 600 }) }];
}

/** What the rule reads for the engine's lights: the same places and radii. */
function reaches(lights: readonly EngineLight[], walls: readonly WallSegment[]): LightReach[] {
  return lights.map((light) => lightReach({ x: light.x, y: light.y }, light.dim, walls, light.bright, light));
}

/** Brighter than the veil of magical darkness, darker than anything a light shows. */
const VEIL = 14;
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
const chroma = (pixel: readonly number[]): number => Math.max(...pixel) - Math.min(...pixel);

describe('magical darkness in the composite', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function render(sight: Sight, scene: Partial<EngineScene> = {}, mode: LightingMode = 'player'): Promise<(point: { x: number; y: number }) => readonly [number, number, number]> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    engine.setEnabled(true);
    engine.setMode(mode);
    engine.update({ bounds, albedo: null, walls: [wall], lights: [lamp, darkness], sight, sightRadius: 20, ambient: 0, ...scene });
    engine.flush();
    const at: PixelReader = renderThroughEngine(engine, renderer, camera);
    watch.stop();
    // Every new pass runs under the strict context: no GL error, no attribute buffer too short.
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    return (point) => at(Math.round(point.x * camera.scale), Math.round(point.y * camera.scale));
  }

  it('swallows the light inside it and leaves the light outside as it was', async () => {
    const without = await render(sightWith([]), { lights: [lamp] });
    const at = await render(sightWith([]));
    expect(luminance(without(SWALLOWED))).toBeGreaterThan(80);
    expect(luminance(at(SWALLOWED))).toBeLessThan(VEIL);
    // Outside it only the bounce of the swallowed light is missing: a step of the 255 at most.
    for (const point of [LIT, UNLIT]) {
      at(point).forEach((channel, i) => expect(Math.abs(channel - without(point)[i]!)).toBeLessThanOrEqual(2));
    }
    expect(luminance(at(LIT))).toBeGreaterThan(120);
  });

  it('swallows daylight too', async () => {
    const at = await render(sightWith([]), { ambient: 1, lights: [darkness] });
    expect(luminance(at(SWALLOWED))).toBeLessThan(VEIL);
    expect(luminance(at(UNLIT))).toBeGreaterThan(100);
  });

  describe('the veil the players see in its place', () => {
    const cool = ([r, g, b]: readonly number[]): boolean => b! > r! + 3 && b! > g!;

    it('lies over daylight the darkness swallows: faint and cool, soft at its edge', async () => {
      const at = await render(sightWith([]), { ambient: 1, lights: [darkness] });
      expect(cool(at(SWALLOWED))).toBe(true);
      expect(luminance(at(SWALLOWED))).toBeLessThan(VEIL);
      // The darkness and its veil fade out inside the radius: daylight as ever one screen pixel beyond.
      const beyond = at({ x: darkness.x, y: darkness.y - 106 });
      expect(luminance(beyond)).toBeGreaterThan(100);
      expect(beyond).toEqual(at({ x: darkness.x, y: darkness.y - 160 }));
    });

    it('lies over a lamp\'s light the darkness swallows, where the rule counts that light, and nowhere else in the darkness', async () => {
      // A darkness that reaches far past the lamp's light, and the lamp with the area the rule gives it.
      const wide: EngineLight = { ...darkness, dim: 300 };
      const shining: EngineLight = { ...lamp, area: lightReach({ x: lamp.x, y: lamp.y }, lamp.dim, [wall], lamp.bright, lamp).polygon };
      const at = await render(sightWith([]), { lights: [shining, wide] });
      expect(cool(at(SWALLOWED))).toBe(true);
      expect(luminance(at(SWALLOWED))).toBeLessThan(VEIL);
      // 310 px from the lamp, 230 px into the darkness: no light of the lamp's is swallowed here.
      const past = { x: 560, y: 512 };
      expect(at(past)).toEqual((await render(sightWith([]), { lights: [] }))(past));
    });

    it('lies over what a sense that does not see in magical darkness would show', async () => {
      const at = await render(sightWith(sense('darkvision')), { lights: [darkness] });
      expect(cool(at(SWALLOWED))).toBe(true);
      expect(luminance(at(SWALLOWED))).toBeLessThan(VEIL);
    });

    it('is not drawn where nothing is swallowed: an unlit room looks the same with the source as without it', async () => {
      const at = await render(sightWith([]), { lights: [darkness] });
      const without = await render(sightWith([]), { lights: [] });
      for (let x = darkness.x - 96; x <= darkness.x + 96; x += 16) {
        for (let y = darkness.y - 96; y <= darkness.y + 96; y += 16) expect([x, y, at({ x, y })]).toEqual([x, y, without({ x, y })]);
      }
    });
  });

  it('agrees with the rule: where `lightLevelAt` says magically dark the picture is dark, where it says lit the picture is lit', async () => {
    const lights = [lamp, darkness];
    const at = await render(sightWith([]), { lights });
    const rule = reaches(lights, [wall]);
    let dark = 0;
    let lit = 0;
    for (let x = 60; x <= 500; x += 8) {
      for (const y of [420, 470, 512, 560, 610]) {
        const point = { x, y };
        // The soft edge of the darkness lies inside this band, and the lamp's fade where it has faded to under a fifth.
        const fromDarkness = Math.hypot(x - darkness.x, y - darkness.y);
        const fromLamp = Math.hypot(x - lamp.x, y - lamp.y);
        if (Math.abs(fromDarkness - darkness.dim) < 14 || (fromLamp < lamp.dim + 4 && lightFade(lamp.bright, lamp.dim, fromLamp) < 0.2)) continue;
        const level = lightLevelAt(point, { ambient: 0 }, rule);
        const shown = luminance(at(point));
        if (level === 'magical-dark') {
          dark++;
          expect([x, y, shown < VEIL]).toEqual([x, y, true]);
        } else if (level !== 'dark') {
          lit++;
          expect([x, y, shown > 25]).toEqual([x, y, true]);
        }
      }
    }
    expect(dark).toBeGreaterThan(40);
    expect(lit).toBeGreaterThan(40);
  });

  it('is not seen into by darkvision that does not see in magical darkness', async () => {
    const at = await render(sightWith(sense('dnd5e-darkvision')));
    const plain = await render(sightWith([]));
    expect(luminance(at(UNLIT))).toBeGreaterThan(20);
    expect(at(SWALLOWED)).toEqual(plain(SWALLOWED));
  });

  it('is seen into by devil\'s sight and truesight, in colour and as bright as their darkness', async () => {
    for (const id of ['dnd5e-devils-sight', 'dnd5e-truesight', 'truesight', 'blindsight']) {
      const at = await render(sightWith(sense(id)));
      const [r, , b] = at(SWALLOWED);
      expect([id, b - r > 40]).toEqual([id, true]);
      expect(Math.abs(luminance(at(SWALLOWED)) - luminance(at(UNLIT)))).toBeLessThan(6);
    }
  });

  it('is seen into by Pathfinder darkvision as dim light, in black and white, and by greater darkvision as bright', async () => {
    const dim = await render(sightWith(sense('pathfinder2e-darkvision')));
    expect(chroma(dim(SWALLOWED))).toBeLessThanOrEqual(8);
    expect(luminance(dim(SWALLOWED))).toBeGreaterThan(20);
    expect(luminance(dim(SWALLOWED))).toBeLessThan(luminance(dim(UNLIT)) * 0.75);
    const greater = await render(sightWith(sense('pathfinder2e-greater-darkvision')));
    expect(Math.abs(luminance(greater(SWALLOWED)) - luminance(greater(UNLIT)))).toBeLessThan(VEIL);
  });

  it('gives way to a light of higher priority, and wins against one of its own', async () => {
    const without = await render(sightWith([]), { lights: [lamp] });
    const outshone = await render(sightWith([]), { lights: [{ ...lamp, priority: 1 }, darkness] });
    expect(Math.abs(luminance(outshone(SWALLOWED)) - luminance(without(SWALLOWED)))).toBeLessThan(10);
    const tied = await render(sightWith([]), { lights: [{ ...lamp, priority: 1 }, { ...darkness, priority: 1 }] });
    expect(luminance(tied(SWALLOWED))).toBeLessThan(VEIL);
    // The order the lights are listed in decides nothing.
    const reversed = await render(sightWith([]), { lights: [darkness, { ...lamp, priority: 1 }] });
    expect(reversed(SWALLOWED)).toEqual(outshone(SWALLOWED));
  });

  it('is not lit by the bounce of a light beside it', async () => {
    const beside: EngineLight = { ...lamp, x: 330, y: 380 };
    const far: EngineLight = { ...darkness, x: 330, y: 560, dim: 60 };
    const at = await render(sightWith([]), { lights: [beside, far] });
    // Nothing but the veil over the light it swallows: as over swallowed daylight, where no light is to bounce.
    const veil = await render(sightWith([]), { ambient: 1, lights: [far] });
    expect(luminance(at({ x: 330, y: 570 }))).toBeLessThan(VEIL);
    expect(at({ x: 330, y: 570 })).toEqual(veil({ x: 330, y: 570 }));
  });

  it('ends at walls like light: nothing behind a wall is darkened', async () => {
    const atWall: EngineLight = { ...darkness, x: 800, y: 512, dim: 120 };
    const at = await render(SEES_ALL, { ambient: 1, lights: [atWall] });
    const without = await render(SEES_ALL, { ambient: 1, lights: [] });
    expect(luminance(at({ x: 820, y: 512 }))).toBeLessThan(VEIL);
    expect(at({ x: 880, y: 512 })).toEqual(without({ x: 880, y: 512 }));
  });

  it('still shows a party token that stands in it, within its footprint', async () => {
    const friend: TokenEntity = { id: 'f', kind: 'token', imagePath: 'f.png', ...SWALLOWED, vision: { enabled: true } };
    const tokens = { v: { id: 'v', kind: 'token', imagePath: 'v.png', ...VIEWER, vision: { enabled: true } } as TokenEntity, f: friend };
    const sight = sightWith([], { f: friend });
    const lights = [darkness];
    const spots = seenSpots(sight, { ambient: 0 }, reaches(lights, [wall]), tokens, 70, [wall]);
    expect(spots.map((spot) => spot.x)).toContain(SWALLOWED.x);
    const at = await render(sight, { lights, spots });
    expect(luminance(at(SWALLOWED))).toBeGreaterThan(60);
    // Beside the footprint the darkness is as dark as without the token.
    expect(luminance(at({ x: SWALLOWED.x, y: SWALLOWED.y + 60 }))).toBeLessThan(VEIL);
  });

  it('shows the GM the map under a tinted veil, never black', async () => {
    const at = await render(sightWith([]), {}, 'gm');
    const without = await render(sightWith([]), { lights: [lamp] }, 'gm');
    expect(luminance(at(SWALLOWED))).toBeGreaterThan(8);
    expect(luminance(at(SWALLOWED))).toBeLessThan(luminance(without(SWALLOWED)) * 0.5);
    const [r, , b] = at(SWALLOWED);
    expect(b).toBeGreaterThan(r);
  });
});
