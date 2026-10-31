import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { loneTrees } from '../../../../src/app/dungeons/render/forest/loneTrees';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { dungeonScene } from '../../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';

const SEEDS = Array.from({ length: 40 }, (_, k) => k + 1);
const forest = (seed: number, floors = 1, tags: string[] = []): DungeonModel => generateDungeon({ seed, theme: 'forest', tags, floors });

describe('the Forest', () => {
  it('reads its entry floor as glades and every floor below as caves', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const model = forest(seed, 3);
      expect(model.theme).toBe('forest');
      expect(model.floors[0]!.forest).toBe(true);
      expect(model.floors[0]!.cave).toBeDefined();
      for (const floor of model.floors.slice(1)) expect(floor.forest).toBeUndefined();
    }
  });

  it('holds nothing only a cave holds, no secret ways and no steps, on its entry floor', () => {
    for (const seed of SEEDS) {
      const floor = forest(seed, 1, ['crumbling', 'wet']).floors[0]!;
      expect(floor.props.filter((prop) => !['campfire', 'mushrooms', 'boulder'].includes(prop.kind))).toEqual([]);
      expect(floor.doors.filter((door) => door.kind === 'secret' || door.kind === 'steps')).toEqual([]);
      expect([floor.columns, floor.rubble, floor.cracks, floor.growth].map((list) => list.length)).toEqual([0, 0, 0, 0]);
      floor.terrain.forEach((piece, index) => expect(piece.id).toBe(index));
      for (const room of new Set(floor.props.filter((prop) => prop.kind === 'boulder').map((prop) => prop.room))) {
        expect(floor.props.filter((prop) => prop.kind === 'boulder' && prop.room === room).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('takes no lava or acid and stays the same for the same request', () => {
    expect(forest(5, 1, ['lava', 'acid']).tags).not.toContain('lava');
    expect(forest(5, 1, ['lava', 'acid']).tags).not.toContain('acid');
    expect(forest(11, 2, ['wet'])).toEqual(forest(11, 2, ['wet']));
  });

  it('stands its lone trees inside the clearings, apart, and gives each a trunk that casts a shadow and gives cover', () => {
    let trees = 0;
    for (const seed of SEEDS.slice(0, 16)) {
      const model = forest(seed);
      const shown = visibleDungeon(model, DEFAULT_VIEW, 0);
      const lone = loneTrees(shown);
      trees += lone.length;
      for (const tree of lone) expect(shown.field.distance(tree.x, tree.y)).toBeLessThan(-0.5);
      lone.forEach((a, i) => lone.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius)));
      const layout = mapLayout(model, 70, DEFAULT_VIEW);
      const parts = dungeonScene(model, dungeonStyle('crayon'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: 70 }, { width: layout.widthPx, height: layout.heightPx }, { unitType: 'feet', ruleDistance: 5 })!;
      const named = Object.values(parts.scene.mapFeatures ?? {}).filter((feature) => feature.name === 'Tree');
      expect(named).toHaveLength(lone.length);
      for (const feature of named) expect(['half', 'three-quarters']).toContain(feature.terrain?.cover);
      const trunks = new Set(Object.values(parts.scene.walls ?? {}).filter((wall) => wall.id.includes('_shadow_')).map((wall) => wall.chainId));
      expect(trunks.size).toBeGreaterThanOrEqual(lone.length);
    }
    expect(trees).toBeGreaterThan(10);
  });
});
