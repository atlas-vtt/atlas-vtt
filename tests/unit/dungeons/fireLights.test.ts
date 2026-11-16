import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../../src/app/dungeons/model';
import { fireSites } from '../../../src/app/dungeons/render/fireSites';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { dungeonScene, type DungeonSceneParts } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { worldTexel } from '../../../src/app/lighting/lightingConstants';
import { placeLight } from '../../../src/app/lighting/lightPlacement';
import { sealedWalls } from '../../../src/app/lighting/sealWalls';
import { crosses, solidSegments, splitBlocking, type Seg } from '../../../src/app/lighting/segments';
import type { LightSource } from '../../../src/app/types/lightingTypes';

/**
 * A lived-in dungeon's fires as scene lights: one in every fireplace and fire pit, a fireplace's
 * a beam out of its mouth, a house's firebox opened to its room and walled round its recess, so the
 * fire burns in the open and its light leaves only through the mouth.
 */

const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const PX = 280;

function sceneOf(model: DungeonModel): { parts: DungeonSceneParts; texel: number } {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  const image = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: PX }, image, FEET)!;
  return { parts, texel: worldTexel(image) };
}

const fireLights = (parts: DungeonSceneParts): LightSource[] => Object.values(parts.scene.lights).filter(light => light.id.includes('_fire_'));

/** The walls that stop a light on its level, as the engine traces its tile through them. */
function lightWalls(parts: DungeonSceneParts, light: LightSource, texel: number): Seg[] {
  const walls = Object.values(parts.scene.walls).filter(wall => !light.levels || wall.levels?.[0] === light.levels[0]);
  return solidSegments(splitBlocking(sealedWalls(walls, texel), 'light'));
}

/** From the light `cells` cells along `degrees` (0 up, clockwise). */
function along(light: LightSource, degrees: number, cells: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  return { x: light.x + Math.sin(a) * cells * PX, y: light.y - Math.cos(a) * cells * PX };
}

const blocked = (segs: readonly Seg[], light: LightSource, to: { x: number; y: number }): boolean => segs.some(seg => crosses(light.x, light.y, to.x, to.y, seg));

const REQUESTS = (theme: DungeonRequest['theme'], count: number): DungeonRequest[] =>
  Array.from({ length: count }, (_, k) => ({ seed: 11 + k * 37, theme, tags: ['inhabited', ...(k % 3 === 0 ? ['large'] : [])], floors: 1 + (k % 3) }));

describe('the fires of a lived-in dungeon', () => {
  it('give no light and change no wall where nobody lives', () => {
    for (const theme of ['mansion', 'fortress', 'cavern'] as const) {
      const { parts } = sceneOf(generateDungeon({ seed: 5, theme, tags: [], floors: 2 }));
      expect(fireLights(parts)).toEqual([]);
      expect(Object.keys(parts.scene.walls).filter(id => id.includes('_firebox_'))).toEqual([]);
    }
  });

  it('light every fireplace and fire pit the map draws, on its own level', () => {
    let pits = 0;
    let hearths = 0;
    for (const request of [...REQUESTS('mansion', 8), ...REQUESTS('fortress', 8), ...REQUESTS('cavern', 8)]) {
      const model = generateDungeon(request);
      const { parts } = sceneOf(model);
      const lights = fireLights(parts);
      const expected = model.floors.flatMap((floor, index) => {
        const dungeon = visibleDungeon(model, DEFAULT_VIEW, index);
        return floor.props.filter(prop => (prop.kind === 'hearth' || prop.kind === 'campfire') && dungeon.roomShapes.has(prop.room)).map(prop => ({ prop, level: parts.levelIds?.[index] }));
      });
      expect(lights.length).toBe(expected.length);
      for (const light of lights) {
        expect(light.emission).toMatchObject({ kind: 'torch', animation: 'torch' });
        expect(light.emission.dim).toBeGreaterThan(light.emission.bright);
        if (parts.levelIds) expect(parts.levelIds).toContain(light.levels?.[0]);
        if (light.emission.angle === undefined) {
          pits++;
          expect(light.rotation).toBeUndefined();
        } else {
          hearths++;
          expect(light.emission.angle).toBeGreaterThan(90);
          expect(light.emission.angle).toBeLessThan(180);
          expect(light.emission.dim).toBeLessThan(40);
        }
      }
      expect(lights.filter(light => light.emission.angle === undefined).length).toBe(expected.filter(({ prop }) => prop.kind === 'campfire').length);
    }
    expect(pits).toBeGreaterThan(0);
    expect(hearths).toBeGreaterThan(0);
  });

  it("open a house's every firebox to its room and wall the recess round it", () => {
    let fireplaces = 0;
    for (const request of REQUESTS('mansion', 16)) {
      const model = generateDungeon(request);
      const { parts, texel } = sceneOf(model);
      const lights = fireLights(parts);
      const recesses = Object.keys(parts.scene.walls).filter(id => id.includes('_firebox_'));
      expect(recesses.length).toBe(lights.length * 3);
      for (const light of lights) {
        fireplaces++;
        const segs = lightWalls(parts, light, texel);
        // The fire stands in the open: the engine does not move it out of a wall.
        expect(placeLight(light.x, light.y, 0.3 * PX, segs, texel)).toMatchObject({ x: light.x, y: light.y });
        const facing = light.rotation ?? 0;
        // Out of the mouth into the room…
        expect(blocked(segs, light, along(light, facing, 0.6))).toBe(false);
        // …but never back through the stack, or out through a cheek.
        expect(blocked(segs, light, along(light, facing + 180, 0.6))).toBe(true);
        expect(blocked(segs, light, along(light, facing + 90, 0.6))).toBe(true);
        expect(blocked(segs, light, along(light, facing - 90, 0.6))).toBe(true);
      }
    }
    expect(fireplaces).toBeGreaterThan(20);
  });

  it('shine a fireplace as wide as its mouth is seen from the fire', () => {
    const model = generateDungeon({ seed: 7, theme: 'mansion', tags: ['inhabited'], floors: 1 });
    const sites = fireSites(model.floors[0]!.props, true);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      const [m0, m1] = site.firebox!;
      const half = Math.hypot(m1!.x - m0!.x, m1!.y - m0!.y) / 2;
      const mouth = { x: (m0!.x + m1!.x) / 2, y: (m0!.y + m1!.y) / 2 };
      const depth = Math.hypot(site.at.x - mouth.x, site.at.y - mouth.y);
      expect(site.opening!.angle).toBe(Math.round((2 * Math.atan2(half, depth) * 180) / Math.PI));
    }
  });
});
