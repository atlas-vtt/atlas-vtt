import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { doorMiddle } from '../../../src/app/dungeons/geometry';
import type { DungeonModel, DungeonRequest } from '../../../src/app/dungeons/model';
import { fireSites } from '../../../src/app/dungeons/render/fireSites';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { propsAsDrawn } from '../../../src/app/dungeons/render/propsAsDrawn';
import { visibleDungeon, type VisibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { LIGHT_SPACING, MAX_WALL_LIGHTS, wallLightsOf, type WallLight } from '../../../src/app/dungeons/render/wallLights/wallLightSites';
import { dungeonScene, type DungeonSceneParts } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { worldTexel } from '../../../src/app/lighting/lightingConstants';
import { placeLight } from '../../../src/app/lighting/lightPlacement';
import { sealedWalls } from '../../../src/app/lighting/sealWalls';
import { crosses, solidSegments, splitBlocking, type Seg } from '../../../src/app/lighting/segments';
import type { LightSource } from '../../../src/app/types/lightingTypes';

/**
 * The lights a lived-in dungeon hangs on its walls: none where nobody lives; where people do, on
 * the walls as drawn, off doors, windows, stairs and stacks, apart from each other and from what a
 * fire already lights, a cap per floor, some rooms dark; and in the scene each stands in the open
 * before its wall, which stops its back half.
 */

const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const PX = 280;
const THEMES = ['fortress', 'mansion', 'cavern'] as const;

const requests = (theme: (typeof THEMES)[number], count: number, tags: string[] = ['inhabited']): DungeonRequest[] =>
  Array.from({ length: count }, (_, k) => ({ seed: 3 + k * 41, theme, tags: [...tags, ...(k % 3 === 0 ? ['large'] : [])], floors: 1 + (k % 3) }));

const floorsOf = (model: DungeonModel): VisibleDungeon[] => model.floors.map((_, index) => visibleDungeon(model, DEFAULT_VIEW, index));

function sceneOf(model: DungeonModel): { parts: DungeonSceneParts; texel: number } {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  const image = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: PX }, image, FEET)!;
  return { parts, texel: worldTexel(image) };
}

const wallLights = (parts: DungeonSceneParts): LightSource[] => Object.values(parts.scene.lights).filter(light => light.id.includes('_wall_'));
const gap = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('the wall lights of a lived-in dungeon', () => {
  it('are none where nobody lives', () => {
    for (const theme of THEMES) {
      for (const request of requests(theme, 6, [])) {
        const model = generateDungeon(request);
        for (const dungeon of floorsOf(model)) expect(wallLightsOf(dungeon)).toEqual([]);
        expect(wallLights(sceneOf(model).parts)).toEqual([]);
      }
    }
  });

  it('hang on the walls as drawn, off doors, windows, stairs and stacks, apart, a cap per floor, and leave rooms dark', () => {
    for (const theme of THEMES) {
      let floors = 0;
      let lights = 0;
      let rooms = 0;
      let lit = 0;
      let pairs = 0;
      for (const request of requests(theme, 30)) {
        const model = generateDungeon(request);
        for (const dungeon of floorsOf(model)) {
          const hung = wallLightsOf(dungeon);
          const cave = dungeon.floor.cave !== undefined;
          floors++;
          lights += hung.length;
          expect(hung.length).toBeLessThanOrEqual(MAX_WALL_LIGHTS[cave ? 'cave' : 'built']);
          expect(hung.every(light => light.kind === (cave ? 'cave-torch' : dungeon.floor.walls === 'edges' ? 'sconce' : 'bracket') || light.kind === 'brazier')).toBe(true);
          const fires = fireSites(propsAsDrawn(dungeon).filter(prop => dungeon.roomShapes.has(prop.room)), dungeon.floor.walls === 'edges');
          hung.forEach((light: WallLight, k) => {
            // Its flame in the open floor of its room, a wall light's drawing hung just off a drawn wall.
            expect(dungeon.field.distance(light.flame.x, light.flame.y)).toBeLessThan(light.kind === 'brazier' ? -0.4 : -0.1);
            if (light.kind !== 'brazier') expect(Math.abs(dungeon.field.distance(light.x, light.y) + 0.1)).toBeLessThan(0.05);
            for (const door of dungeon.floor.doors) expect(gap(light, doorMiddle(door))).toBeGreaterThan(0.45);
            for (const window of dungeon.floor.windows ?? []) expect(gap(light, { x: window.x + 0.5 + window.dir.x * 0.5, y: window.y + 0.5 + window.dir.y * 0.5 })).toBeGreaterThan(0.45);
            for (const s of dungeon.floor.stairs) expect(light.flame.x > s.x && light.flame.x < s.x + s.w && light.flame.y > s.y && light.flame.y < s.y + s.h).toBe(false);
            for (const s of dungeon.floor.stacks ?? []) expect(light.x > s.x && light.x < s.x + s.w && light.y > s.y && light.y < s.y + s.h).toBe(false);
            // Never where a fireplace's beam or a fire pit already lights.
            for (const fire of fires) if (!fire.opening) expect(gap(light.flame, fire.at)).toBeGreaterThan(5);
            hung.slice(k + 1).forEach((other, j) => {
              const d = gap(light.flame, other.flame);
              if (d < LIGHT_SPACING[cave ? 'cave' : 'built']) {
                // Only the two of a flanking pair stand nearer: in one room, hung one after the other, at the same distance from the wall.
                expect(j).toBe(0);
                expect(other.room).toBe(light.room);
                expect(cave).toBe(false);
                pairs++;
              }
            });
          });
          const normal = dungeon.rooms.filter(room => room.kind === 'room');
          rooms += normal.length;
          lit += normal.filter(room => hung.some(light => light.room === room.id)).length;
        }
      }
      // Lights on every floor on the whole, never too many, and many lived-in rooms dark.
      expect(lights / floors).toBeGreaterThan(theme === 'cavern' ? 2 : 3);
      expect(lights / floors).toBeLessThan(theme === 'cavern' ? 8 : 12);
      expect(lit / rooms).toBeGreaterThan(0.15);
      expect(lit / rooms).toBeLessThan(0.6);
      if (theme === 'cavern') expect(pairs).toBe(0);
      else expect(pairs).toBeGreaterThan(0);
    }
  });

  it('are the same every time for the same dungeon', () => {
    for (const theme of THEMES) {
      const request = requests(theme, 1)[0]!;
      expect(floorsOf(generateDungeon(request)).map(wallLightsOf)).toEqual(floorsOf(generateDungeon(request)).map(wallLightsOf));
    }
  });

  it('become scene lights in the open before their walls, which stop their back half', () => {
    let checked = 0;
    for (const theme of THEMES) {
      for (const request of requests(theme, 8)) {
        const model = generateDungeon(request);
        const { parts, texel } = sceneOf(model);
        const lights = wallLights(parts);
        const sites = floorsOf(model).flatMap(wallLightsOf);
        expect(lights.length).toBe(sites.length);
        lights.forEach((light, k) => {
          const site = sites[k]!;
          expect(light.emission.dim).toBeGreaterThan(light.emission.bright);
          expect(light.emission.dim).toBeLessThanOrEqual(25);
          expect(light.emission.kind).toBe(site.kind === 'sconce' ? 'candle' : 'torch');
          if (parts.levelIds) expect(parts.levelIds).toContain(light.levels?.[0]);
          const walls = Object.values(parts.scene.walls).filter(wall => !light.levels || wall.levels?.[0] === light.levels[0]);
          const segs: Seg[] = solidSegments(splitBlocking(sealedWalls(walls, texel), 'light'));
          // The engine leaves it where it is: it stands in the open.
          expect(placeLight(light.x, light.y, 0.06 * PX, segs, texel)).toMatchObject({ x: light.x, y: light.y });
          if (site.kind === 'brazier') return;
          const into = { x: Math.sin(site.rotation), y: -Math.cos(site.rotation) };
          const to = (cells: number): { x: number; y: number } => ({ x: light.x + into.x * cells * PX, y: light.y + into.y * cells * PX });
          const blocked = (at: { x: number; y: number }): boolean => segs.some(seg => crosses(light.x, light.y, at.x, at.y, seg));
          expect(blocked(to(0.1)), `${light.id} into its room`).toBe(false);
          expect(blocked(to(-0.5)), `${light.id} back through its wall`).toBe(true);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});
