import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonTerrain, TerrainKind } from '../../../src/app/dungeons/model';
import { FEATURES } from '../../../src/app/dungeons/themes/features';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { dungeonScene } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../../src/app/dungeons/styleCatalog';
import { MAX_AREA_CORNERS } from '../../../src/app/lighting/lightArea';
import { MAX_LIQUID_CORNERS } from '../../../src/app/liquids/liquids';
import type { LiquidSurface } from '../../../src/app/types/liquidTypes';
import { drainCells } from '../../../src/app/dungeons/water';

/** The collection's units: five feet a square. */
const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const PX = 200;

function partsOf(model: DungeonModel, look: DungeonStyleId, view = DEFAULT_VIEW) {
  const layout = mapLayout(model, PX, view);
  return dungeonScene(model, dungeonStyle(look), view, { originCell: layout.originCell, pxPerCell: PX }, { width: layout.widthPx, height: layout.heightPx }, FEET)!;
}

function inside(polygon: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The first seed of `tags` whose dungeon has a liquid of `kind`. */
function dungeonWith(tags: string[], kind: LiquidSurface['liquid'], look: DungeonStyleId, floors = 1): { model: DungeonModel; liquids: LiquidSurface[]; parts: ReturnType<typeof partsOf> } {
  for (let seed = 1; seed < 200; seed++) {
    const model = generateDungeon({ seed, tags, floors });
    const parts = partsOf(model, look);
    const liquids = Object.values(parts.scene.liquids ?? {}).filter(l => l.liquid === kind);
    if (liquids.length) return { model, liquids, parts };
  }
  throw new Error(`no ${kind}`);
}

describe('a dungeon\'s water, lava and acid in its scene', () => {
  it('glows from every lava channel as a whole, bridges included, and moves around what the map draws over it', () => {
    const { model, liquids, parts } = dungeonWith(['dry', 'lava'], 'lava', 'parchment');
    const floor = model.floors[0]!;
    const layout = mapLayout(model, PX, DEFAULT_VIEW);
    const world = (x: number, y: number) => ({ x: (x - layout.originCell.x) * PX, y: (y - layout.originCell.y) * PX });
    const lights = Object.values(parts.scene.lights).filter(l => l.area);
    for (const channel of floor.terrain.filter(p => p.kind === 'channel' && p.traits.hazard === 'lava')) {
      for (const c of channel.cells) {
        const p = world(c.x + 0.5, c.y + 0.5);
        expect(lights.some(l => inside(l.area!, p.x, p.y))).toBe(true);
      }
    }
    for (const light of lights) {
      expect(light.emission.dim).toBe(20);
      expect(light.emission.bright).toBe(5);
      expect(light.emission.animation).toBe('smoulder');
    }
    expect(liquids.some(l => l.flow)).toBe(true);
    const over = [
      ...floor.terrain.filter(p => p.kind === 'bridge').flatMap(p => p.cells.map(c => world(c.x + 0.5, c.y + 0.5))),
      ...floor.stairs.map(s => world(s.x + s.w / 2, s.y + s.h / 2)),
      ...floor.props.map(p => world(p.x, p.y)),
    ];
    for (const p of over) expect(liquids.some(l => inside(l.polygon, p.x, p.y) && !(l.holes ?? []).some(h => inside(h, p.x, p.y)))).toBe(false);
  });

  it('gives water no light, and its pools lie on the floor of their rooms', () => {
    const { liquids, parts } = dungeonWith(['wet'], 'water', 'parchment');
    const areas = Object.values(parts.scene.lights).flatMap(l => (l.area ? [l.area] : []));
    for (const liquid of liquids) {
      expect(areas.some(area => inside(area, liquid.polygon[0]!.x, liquid.polygon[0]!.y))).toBe(false);
      expect(liquid.polygon.length).toBeGreaterThanOrEqual(3);
      expect(liquid.polygon.length).toBeLessThanOrEqual(MAX_LIQUID_CORNERS);
    }
  });

  it('keeps pools water in every look, lava and acid only where the dungeon has them, each floor\'s on its level', () => {
    for (let seed = 1; seed < 60; seed++) {
      const model = generateDungeon({ seed, tags: ['flooded'], floors: 2 });
      const parts = partsOf(model, 'volcanic');
      const hazards = new Set(model.floors.flatMap(f => f.terrain.filter(p => p.kind === 'channel').map(p => p.traits.hazard)));
      for (const liquid of Object.values(parts.scene.liquids ?? {})) {
        expect(parts.levelIds).toContain(liquid.level);
        if (liquid.liquid !== 'water') expect(hazards.has(liquid.liquid)).toBe(true);
      }
      for (const light of Object.values(parts.scene.lights)) expect(parts.levelIds).toContain(light.levels?.[0]);
    }
  });

  it('makes one surface of a lake with an island, never a surface per row, each within a surface\'s corners and its light within an area light\'s', () => {
    for (let seed = 1; seed < 80; seed++) {
      const parts = partsOf(generateDungeon({ seed, tags: ['flooded', 'large'], floors: 1 }), 'parchment');
      for (const liquid of Object.values(parts.scene.liquids ?? {})) {
        // A surface keeps its drawn shore up to the surface limit: fitted to an area light's 256 it ran off the shore in chords.
        const corners = liquid.polygon.length + (liquid.holes ?? []).reduce((sum, hole) => sum + hole.length, 0);
        expect(corners).toBeLessThanOrEqual(MAX_LIQUID_CORNERS);
      }
      for (const light of Object.values(parts.scene.lights)) expect(light.area!.length).toBeLessThanOrEqual(MAX_AREA_CORNERS);
    }
  }, 60_000);

  it('keeps standing water to the entrance floor of a rising dungeon', () => {
    const pools = (model: DungeonModel, f: number): DungeonModel['floors'][number]['rooms'] => model.floors[f]!.rooms.filter((r) => r.type && (FORTRESS.rooms.find((s) => s.id === r.type)?.terrain.features ?? []).some((reason) => FEATURES[reason].water === 'pool'));
    let wetEntrance = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const tags of [['wet'], ['flooded'], ['flooded', 'ruined']]) {
        const model = generateDungeon({ seed: seed * 613, theme: 'fortress', tags, floors: 3, waterLevel: 0.6 });
        if (model.floors[0]!.waterCells.length > 0) wetEntrance++;
        for (const f of [1, 2]) {
          const inPool = (c: { x: number; y: number }): boolean => pools(model, f).some((r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h);
          expect(model.floors[f]!.waterCells.filter((c) => !inPool(c)), `seed ${seed * 613} [${tags.join(',')}] floor ${f}`).toEqual([]);
        }
      }
    }
    expect(wetEntrance).toBeGreaterThan(0);
  });

  it('has lava and acid only where its tags ask for them', () => {
    const molten = (tags: string[]): Set<string> => {
      const found = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) {
        for (const floor of generateDungeon({ seed, tags, floors: 2 }).floors) for (const piece of floor.terrain) if (piece.traits.hazard === 'lava' || piece.traits.hazard === 'acid') found.add(piece.traits.hazard);
      }
      return found;
    };
    expect(molten([])).toEqual(new Set());
    expect(molten(['dry'])).toEqual(new Set());
    expect(molten(['lava'])).toEqual(new Set(['lava']));
    expect(molten(['acid'])).toEqual(new Set(['acid']));
  });

  it('cuts the columns standing in a pool out of its surface', () => {
    for (let seed = 1; seed < 400; seed++) {
      const model = generateDungeon({ seed, tags: ['flooded', 'colonnades'], floors: 1 });
      const pools = Object.values(partsOf(model, 'parchment').scene.liquids ?? {}).filter(l => l.holes?.length);
      if (!pools.length) continue;
      for (const pool of pools) for (const hole of pool.holes!) expect(inside(pool.polygon, hole[0]!.x, hole[0]!.y)).toBe(true);
      return;
    }
    throw new Error('no column stands in a pool');
  });

  it('counts a cell twice in squares with small tiles', () => {
    const { model } = dungeonWith(['dry', 'lava'], 'lava', 'parchment');
    const small = partsOf(model, 'parchment', { ...DEFAULT_VIEW, smallTiles: true });
    const light = Object.values(small.scene.lights)[0]!;
    expect(light.emission.dim).toBe(40);
  });
});

describe('water beside an opening in the floor', () => {
  const piece = (kind: TerrainKind): DungeonTerrain => ({ id: 0, kind, room: 0, cells: [{ x: 4, y: 7 }], name: `dungeon.terrain.${kind}`, traits: {} });

  it('keeps a cell clear round every hole, pit and shaft, murder holes included, as it would drain away', () => {
    for (const kind of ['chasm', 'shaft', 'gallery', 'pit', 'murder-hole'] as const) {
      const kept = drainCells([piece(kind)]);
      expect([...kept].sort(), kind).toEqual(['3,6', '3,7', '3,8', '4,6', '4,7', '4,8', '5,6', '5,7', '5,8']);
    }
  });

  it('lets water lie beside a piece that is no hole', () => {
    expect(drainCells([piece('rubble-heap')]).size).toBe(0);
  });
});
