import { describe, expect, it } from 'vitest';
import { DRAWN_PROP_KINDS, DRAWN_TERRAIN_KINDS } from '../../../src/app/dungeons/drawnKinds';
import { PROP_SPECS, isCellPiece, propReach } from '../../../src/app/dungeons/props/catalogue';
import { ALL_PROP_KINDS, PROP_KINDS, propKey } from '../../../src/app/dungeons/props/propKinds';
import { drawnPropKinds } from '../../../src/app/dungeons/render/propShapes';
import { drawnTerrainKinds } from '../../../src/app/dungeons/render/terrain/drawTerrain';
import { draft } from '../../../src/app/dungeons/terrain/catalog';
import { FloorTerrain } from '../../../src/app/dungeons/terrain/floorTerrain';
import type { DungeonRoom } from '../../../src/app/dungeons/model';
import { type MessageKey, t } from '../../../src/app/i18n';
import { floorStack } from '../../../src/app/dungeons/floors/floorStack';

const NATURAL = ['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals', 'mushrooms', 'boulder'];

describe('the catalogue of pieces', () => {
  it('has a spec for every kind and a kind for every spec', () => {
    expect(Object.keys(PROP_SPECS).sort()).toEqual([...PROP_KINDS].sort());
    expect(ALL_PROP_KINDS.size).toBe(PROP_KINDS.length);
  });

  it('gives wall pieces no floor and every other piece a footing', () => {
    for (const kind of PROP_KINDS) {
      const spec = PROP_SPECS[kind];
      if (spec.wallPiece) {
        expect('out' in spec.footprint && spec.footprint.out === 0, kind).toBe(true);
        expect(spec.footing, kind).toBeUndefined();
      } else {
        expect(spec.footing, kind).toBeDefined();
      }
    }
  });

  it('matches the catalogue table', () => {
    expect(PROP_SPECS.hearth).toMatchObject({ footprint: { along: 2, out: 1 }, clear: 'front', footing: 'block' });
    expect(PROP_SPECS.hearth.cover).toBeUndefined();
    expect(PROP_SPECS.flowstone.wallPiece).toBe(true);
    expect(PROP_SPECS.statue.cover).toBe('total');
    expect(PROP_SPECS.bust).toMatchObject({ footprint: { reach: 0.2 }, clear: 'front', cover: 'half' });
    expect(PROP_SPECS.curtain.wallPiece).toBe(true);
    expect(isCellPiece(PROP_SPECS.campfire)).toBe(true);
    expect(isCellPiece(PROP_SPECS.well)).toBe(false);
    expect(propReach('well')).toBe(0.42);
    expect(propReach('boulder')).toBe(0.5);
  });

  it('names every kind in English', () => {
    for (const kind of PROP_KINDS) {
      const name = `dungeonProp.name.${propKey(kind)}`;
      const count = `dungeonProp.count.${propKey(kind)}`;
      expect(t(name as MessageKey), kind).not.toBe(name);
      expect(t(count as MessageKey, { count: 2 }), kind).not.toBe(count);
    }
  });

  it('marks the seven formations natural and nothing else', () => {
    expect(PROP_KINDS.filter((kind) => PROP_SPECS[kind].natural).sort()).toEqual([...NATURAL].sort());
  });
});

describe('drawn kinds', () => {
  it('offers exactly the prop kinds that have a drawing', () => {
    expect([...DRAWN_PROP_KINDS].sort()).toEqual(drawnPropKinds().sort());
  });

  it('offers exactly the terrain kinds that have a drawing', () => {
    expect([...DRAWN_TERRAIN_KINDS].sort()).toEqual(drawnTerrainKinds().sort());
  });

  it('places no terrain kind it is not offered', () => {
    const room: DungeonRoom = { id: 0, x: 0, y: 0, w: 6, h: 6, kind: 'room', rotunda: false, wing: 'regular', group: 0, parent: null, axis: { x: 0, y: 1 }, colonnade: false, boss: false };
    const floor = new FloorTerrain(0, { rooms: [room], doors: [], stairs: [], columns: [], offeredTerrain: new Set(['rubble-heap']) }, floorStack('down', 1));
    expect(floor.place(draft('rubble-field', 0, [{ x: 2, y: 2 }]))).toBeNull();
    expect(floor.place(draft('rubble-heap', 0, [{ x: 3, y: 3 }]))).toBeTypeOf('number');
  });
});
