import { describe, expect, it } from 'vitest';
import { t } from '../../../src/app/i18n';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { cellKey, floorCellsOf, holdsCell } from '../../../src/app/dungeons/geometry';
import { bottomUp, stackOf, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import { approachCells, doorApproaches, spotRect } from '../../../src/app/dungeons/floors/stairSpots';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { propReach } from '../../../src/app/dungeons/props/catalogue';
import { draft, footingOf } from '../../../src/app/dungeons/terrain/catalog';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { visibleFloor } from '../../../src/app/dungeons/render/visibleDungeon';
import { cellOutlines } from '../../../src/app/dungeons/scene/cellOutline';
import { roomFacts } from '../../../src/app/dungeons/scene/roomFacts';
import { wallRings } from '../../../src/app/dungeons/scene/wallOutline';
import { keyedRooms } from '../../../src/app/dungeons/scene/roomKeys';
import { pinCell } from '../../../src/app/dungeons/scene/roomPins';
import { dungeonNote, roomPins } from '../../../src/app/dungeons/scene/toNote';
import { dungeonScene, type DungeonSceneParts } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { flightOnLevel, linkLevels, linkTargets } from '../../../src/app/levels/levelLinks';
import { sealTolerance, worldTexel } from '../../../src/app/lighting/lightingConstants';
import { sealWalls } from '../../../src/app/lighting/sealWalls';
import { mapFeatureList } from '../../../src/app/mapFeatures/mapFeatures';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { smallDungeon } from '../../fixtures/dungeonModels';
import { pointInPolygon } from '../../../src/app/dungeons/render/geometry';

/** A dungeon's scene parts as the scene writer gets them, without the vault: walls, stairs, features, note and pins. */

/** The collection's units: five feet a square. */
const FEET = { unitType: 'feet', ruleDistance: 5 } as const;

const STYLE = dungeonStyle('parchment');
const PX = 200;

function partsOf(model: DungeonModel): { parts: DungeonSceneParts; placement: { originCell: { x: number; y: number }; pxPerCell: number }; image: { width: number; height: number } } {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  const placement = { originCell: layout.originCell, pxPerCell: PX };
  const image = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, STYLE, DEFAULT_VIEW, placement, image, FEET);
  if (!parts) throw new Error('walls crowd');
  return { parts, placement, image };
}

const wallsOn = (parts: DungeonSceneParts, level: string | undefined): WallSegment[] =>
  Object.values(parts.scene.walls).filter(wall => (level ? wall.levels?.[0] === level : wall.levels === undefined));

describe('a dungeon of several floors as one scene', () => {
  const model = generateDungeon({ seed: 7, theme: 'cavern', tags: ['medium'], floors: 3 });
  const { parts, placement } = partsOf(model);
  const ids = parts.levelIds!;

  it('has a level per floor, every wall on exactly one of them and every floor walled', () => {
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const wall of Object.values(parts.scene.walls)) expect(wall.levels).toHaveLength(1);
    for (const id of ids) expect(wallsOn(parts, id).length).toBeGreaterThan(20);
    // Wall ids name their floor, so no floor's walls replace another's
    expect(Object.keys(parts.scene.walls).length).toBe(ids.reduce((sum, id) => sum + wallsOn(parts, id).length, 0));
  });

  it('joins the two floors of each stairwell, both ways, on exactly its cells', () => {
    const links = Object.values(parts.scene.levelLinks ?? {});
    const stairwells = model.floors.flatMap((floor, index) => floor.stairs.filter(s => s.to > index).map(stair => ({ stair, index })));
    expect(links).toHaveLength(stairwells.length);
    for (const { stair, index } of stairwells) {
      const link = parts.scene.levelLinks![`levellink_dungeon_${stair.link}`]!;
      expect(link.levels).toEqual([ids[index], ids[stair.to]]);
      expect(link.direction).toBeUndefined();
      const x = (stair.x - placement.originCell.x) * PX;
      const y = (stair.y - placement.originCell.y) * PX;
      expect(link.polygon).toEqual([{ x, y }, { x: x + stair.w * PX, y }, { x: x + stair.w * PX, y: y + stair.h * PX }, { x, y: y + stair.h * PX }]);
      // The other end is the same rectangle on the floor it leads to
      expect(model.floors[stair.to]!.stairs.find(s => s.link === stair.link)).toMatchObject({ x: stair.x, y: stair.y, w: stair.w, h: stair.h });
      const levels = [...ids].reverse().map(id => ({ id, elevation: { bottom: 0, top: 10 }, background: null }));
      expect(linkTargets(link, ids[index]!, levels)).toEqual([ids[stair.to]]);
      expect(linkTargets(link, ids[stair.to]!, levels)).toEqual([ids[index]]);
    }
  });

  it('keys the rooms A1 …, B1 …, from where each floor is entered, and pins each on its floor', () => {
    const keys = parts.rooms.map(room => room.key);
    expect(keys[0]).toBe('A1');
    expect(keys.filter(key => key.startsWith('B'))[0]).toBe('B1');
    expect(new Set(keys).size).toBe(keys.length);
    const floorA = keyedRooms(visibleFloor(model, DEFAULT_VIEW, 0), 3);
    expect(floorA[0]!.room.id).toBe(0);
    for (const room of parts.rooms) expect(room.level).toBe(ids['ABC'.indexOf(room.key[0]!)]);
    const pins = Object.values(roomPins(parts.rooms, 'atlas-vtt/collections/C/notes/Deep.md'));
    expect(pins.map(pin => pin.label)).toEqual(keys);
    for (const pin of pins) {
      expect(pin).toMatchObject({ icon: 'number', gmOnly: true });
      expect(pin.notePath).toMatch(/^atlas-vtt\/collections\/C\/notes\/Deep\.md#[A-C]\d+/);
    }
  });

  it('writes a note with the GM\'s name and a heading per room its pin links', () => {
    const note = dungeonNote('The Deep Halls', parts.rooms);
    // A heading names its key and never what the room was built for.
    expect(note.startsWith('# The Deep Halls\n\n## A1\n')).toBe(true);
    const headings = [...note.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(parts.rooms.map(room => room.heading));
    for (const pin of Object.values(roomPins(parts.rooms, 'n.md'))) expect(headings).toContain(pin.notePath.slice('n.md#'.length));
    // A cave's ways between floors are pitches and scree slopes.
    expect(note).toMatch(/(A pitch drops|A scree slope leads down) to floor B\./);
    expect(note).toMatch(/(An aven rises|A scree slope leads up) to floor A\./);
  });

  it('names every terrain piece, piece of furniture and column a map feature on its floor\'s level', () => {
    const features = Object.values(parts.scene.mapFeatures ?? {});
    expect(mapFeatureList(parts.scene.mapFeatures)).toHaveLength(features.length);
    for (const feature of features) expect(ids).toContain(feature.level);
    model.floors.forEach((floor, index) => {
      const shown = visibleFloor(model, DEFAULT_VIEW, index);
      const rooms = new Set(shown.rooms.map(room => room.id));
      const on = features.filter(feature => feature.level === ids[index]);
      expect(on.length).toBeGreaterThanOrEqual(floor.props.filter(prop => rooms.has(prop.room)).length + floor.terrain.filter(piece => rooms.has(piece.room)).length);
    });
  });
});

describe('the parapet round a gallery', () => {
  it('is half cover on the floor cells beside the hole, never on the hole', () => {
    let galleries = 0;
    // The generator cuts galleries only for a room type's reason; one is laid here by hand over a room of the floor below.
    for (let seed = 1; seed <= 60 && galleries < 3; seed++) {
      const model = generateDungeon({ seed, theme: 'fortress', tags: [], floors: 2 });
      const upper = model.floors[0]!;
      const room = upper.rooms.find(r => r.kind === 'room' && r.w >= 5 && r.h >= 5 && !upper.terrain.some(p => p.room === r.id));
      if (!room) continue;
      const cells = [0, 1].flatMap(dx => [0, 1].map(dy => ({ x: room.x + 2 + dx, y: room.y + 2 + dy })));
      const gallery = { ...draft('gallery', room.id, cells), id: upper.terrain.length, opening: { bottom: 1, link: 900 + seed } };
      upper.terrain.push(gallery);
      galleries++;
      const { parts, placement } = partsOf(model);
      const parapets = Object.values(parts.scene.mapFeatures ?? {}).filter(feature => feature.name === 'Parapet' && feature.level === parts.levelIds![0]);
      expect(parapets.length).toBeGreaterThan(0);
      const hole = new Set(gallery.cells.map(cellKey));
      for (const feature of parapets) {
        expect(feature.terrain).toEqual({ cover: 'half' });
        const xs = feature.polygon.map(p => p.x / placement.pxPerCell + placement.originCell.x);
        const ys = feature.polygon.map(p => p.y / placement.pxPerCell + placement.originCell.y);
        const centre = { x: Math.floor((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.floor((Math.min(...ys) + Math.max(...ys)) / 2) };
        expect(hole.has(cellKey(centre))).toBe(false);
      }
    }
    expect(galleries).toBeGreaterThan(0);
  });
});

describe('the holes and bridges of a dungeon of several floors', () => {
  it('open the floor over the floor below on exactly their cells, bridges laid over them, none on the deepest floor', () => {
    let holes = 0;
    let bridges = 0;
    const area = (ring: { x: number; y: number }[]): number => Math.abs(ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length]!.y - ring[(i + 1) % ring.length]!.x * p.y, 0) / 2);
    for (let seed = 1; seed <= 60 && (holes < 5 || bridges === 0); seed++) {
      const generated = generateDungeon({ seed, theme: 'cavern', tags: ['large'], floors: 3 });
      // A cave's chasms keep rock to cross by; a bridge is laid by hand over the first of each floor's holes.
      const model = { ...generated, floors: generated.floors.map((floor) => {
        const hole = floor.terrain.find((p) => p.opening && p.kind === 'chasm');
        if (!hole) return floor;
        const { opening: _opening, ...rest } = hole;
        return { ...floor, terrain: [...floor.terrain, { ...rest, id: floor.terrain.length, kind: 'bridge' as const, traits: {}, cells: [hole.cells[0]!], spans: hole.id }] };
      }) };
      const { parts } = partsOf(model);
      const ids = parts.levelIds!;
      const surfaces = Object.values(parts.scene.levelSurfaces ?? {});
      expect(surfaces.filter(surface => surface.level === ids[2])).toEqual([]);
      model.floors.slice(0, 2).forEach((floor, index) => {
        const on = surfaces.filter(surface => surface.level === ids[index]);
        const open = on.filter(surface => surface.open);
        const laid = on.filter(surface => !surface.open);
        const cut = floor.terrain.filter(piece => piece.opening && ['chasm', 'shaft', 'gallery'].includes(piece.kind));
        const over = floor.terrain.filter(piece => piece.kind === 'bridge' && cut.some(hole => hole.id === piece.spans));
        holes += cut.length;
        bridges += over.length;
        expect(open.reduce((sum, s) => sum + area(s.polygon), 0)).toBeCloseTo(cut.reduce((sum, piece) => sum + piece.cells.length, 0) * PX * PX);
        expect(laid.reduce((sum, s) => sum + area(s.polygon), 0)).toBeCloseTo(over.reduce((sum, piece) => sum + piece.cells.length, 0) * PX * PX);
        // A bridge lies over its hole: after every opening
        const order = on.map(surface => surface.open);
        expect(order).toEqual([...open.map(() => true), ...laid.map(() => false)]);
      });
    }
    expect(holes).toBeGreaterThan(0);
    expect(bridges).toBeGreaterThan(0);
  });
});

describe('a Fortress of several floors, rising from its entrance floor', () => {
  const model = generateDungeon({ seed: 7, theme: 'fortress', tags: ['medium'], floors: 3 });
  const { parts, placement } = partsOf(model);
  const ids = parts.levelIds!;
  const levels = bottomUp(stackOf(model)).map(index => ({ id: ids[index]!, elevation: { bottom: 0, top: 10 }, background: null }));

  it('joins the floors of a Fortress with stairs walked up from the entrance floor', () => {
    const stairs = model.floors[0]!.stairs;
    expect(stairs.length).toBeGreaterThan(0);
    for (const stair of stairs) {
      const link = parts.scene.levelLinks![`levellink_dungeon_${stair.link}`]!;
      expect(link.levels).toEqual([ids[1], ids[0]]);
      expect(linkLevels(link, levels)).toEqual([ids[0], ids[1]]);
      // On the entrance floor the stairs are entered at their foot, the edge towards which they descend.
      const open = flightOnLevel(link, ids[0]!, levels)!.open;
      const world = (x: number, y: number): { x: number; y: number } => ({ x: (x - placement.originCell.x) * PX, y: (y - placement.originCell.y) * PX });
      const { x, y, w, h, down } = stair;
      const foot = down.y > 0 ? [world(x, y + h), world(x + w, y + h)] : down.y < 0 ? [world(x, y), world(x + w, y)] : down.x > 0 ? [world(x + w, y), world(x + w, y + h)] : [world(x, y), world(x, y + h)];
      const sorted = (edge: readonly { x: number; y: number }[]): string[] => edge.map(p => `${p.x},${p.y}`).sort();
      expect(sorted(open)).toEqual(sorted(foot));
    }
  });

  it("gives a Fortress's entrance floor no openings", () => {
    expect(Object.values(parts.scene.levelSurfaces ?? {}).filter(surface => surface.level === ids[0])).toEqual([]);
  });

  it('says the stairs lead up on the entrance floor of a Fortress', () => {
    const visible = visibleFloor(model, DEFAULT_VIEW, 0);
    const stair = model.floors[0]!.stairs[0]!;
    const room = visible.rooms.find(r => r.kind === 'room' && stair.x >= r.x && stair.x < r.x + r.w && stair.y >= r.y && stair.y < r.y + r.h)!;
    expect(roomFacts(visible, room, DEFAULT_VIEW)).toContain(t('dungeonScene.stairsUp', { floor: 'B' }));
  });
});

describe('murder holes in the scene', () => {
  it('lay floor over each murder hole, so a token stands on it rather than falling through the cut picture', () => {
    const model = generateDungeon({ seed: 2, theme: 'fortress', tags: [], floors: 3 });
    const { parts, placement } = partsOf(model);
    const ids = parts.levelIds!;
    let holes = 0;
    model.floors.forEach((floor, index) => {
      for (const hole of floor.terrain.filter(p => p.kind === 'murder-hole')) {
        holes++;
        const c = hole.cells[0]!;
        const centre = { x: (c.x + 0.5 - placement.originCell.x) * PX, y: (c.y + 0.5 - placement.originCell.y) * PX };
        const over = Object.values(parts.scene.levelSurfaces ?? {}).filter(s => s.level === ids[index] && pointInPolygon(s.polygon, centre.x, centre.y));
        expect(over.map(s => s.open), `murder hole ${hole.id}`).toEqual([false]);
      }
    });
    expect(holes).toBeGreaterThan(1);
  });
});

describe('a dungeon of one floor', () => {
  it('has no levels, and its walls, pins and features none either', () => {
    const { parts } = partsOf(generateDungeon({ seed: 11, tags: ['small'], floors: 1 }));
    expect(parts.levelIds).toBeNull();
    expect(parts.scene.levelLinks).toBeUndefined();
    expect(parts.scene.levelSurfaces).toBeUndefined();
    expect(Object.values(parts.scene.walls).every(wall => wall.levels === undefined)).toBe(true);
    expect(Object.keys(parts.scene.walls).every(id => id.startsWith('wall_dungeon_'))).toBe(true);
    expect(parts.rooms.map(room => room.key).slice(0, 3)).toEqual(['1', '2', '3']);
    expect(parts.rooms.every(room => room.level === undefined)).toBe(true);
    expect(Object.values(parts.scene.mapFeatures ?? {}).every(feature => feature.level === undefined)).toBe(true);
  });
});

describe('a room\'s line of facts', () => {
  const model = smallDungeon();
  const visible = visibleFloor(model, DEFAULT_VIEW, 0);
  const room = (id: number) => visible.rooms.find(r => r.id === id)!;

  it('names exits by compass direction and kind, the way out, stairs, furniture and columns', () => {
    expect(roomFacts(visible, room(0), DEFAULT_VIEW)).toBe('Exits: a door to the north, an opening to the east, and a secret door to the west. An opening to the south leads outside. In the room: a fountain.');
    expect(roomFacts(visible, room(1), DEFAULT_VIEW)).toBe('Exits: 3 doors to the east, south, and west. In the room: a statue, a colonnade, and a broken column.');
    expect(roomFacts(visible, room(8), DEFAULT_VIEW)).toBe('Exits: a door to the west and steps down to the east. In the room: a fire pit.');
    expect(roomFacts(visible, room(4), DEFAULT_VIEW)).toContain('steps up to the west');
    expect(roomFacts(visible, room(5), DEFAULT_VIEW)).toBe('Exits: a door to the north. Stairs lead down to floor B. In the room: a dais and a colonnade.');
  });

  it('leaves out what the view does not show', () => {
    expect(roomFacts(visible, room(0), { props: false, water: false })).toBe('Exits: a door to the north, an opening to the east, and a secret door to the west. An opening to the south leads outside.');
  });

  it('names the boss room and a five-room stage in the heading', () => {
    expect(keyedRooms(visible, 1).find(keyed => keyed.room.id === 5)!.heading).toMatch(/^\d+ · Boss room$/);
    const staged = smallDungeon();
    staged.floors[0]!.rooms[0]!.stage = 'entrance';
    expect(keyedRooms(visibleFloor(staged, DEFAULT_VIEW, 0), 1)[0]!.heading).toBe('1 · Entrance and guardian');
  });
});

describe('a room\'s pin', () => {
  it('stands off stairs, furniture, columns and terrain no one walks on, and dry and off doors wherever the room allows', () => {
    let rooms = 0;
    let wet = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const model = generateDungeon({ seed, tags: [], floors: 1 + (seed % 3) });
      model.floors.forEach((floor, index) => {
        const visible = visibleFloor(model, DEFAULT_VIEW, index);
        const keys = (cells: readonly { x: number; y: number }[]): Set<string> => new Set(cells.map(c => cellKey(c.x, c.y)));
        const never = keys([...floor.stairs.flatMap(cellsOfStair), ...floor.terrain.filter(p => footingOf(p.kind) === 'block').flatMap(p => p.cells)]);
        for (const { room } of keyedRooms(visible, model.floors.length)) {
          const preferNot = keys([
            ...floor.stairs.flatMap(s => approachCells(s, stairEnd(stackOf(model), index, s.to))),
            ...doorApproaches(room, visible.doors),
            ...floor.waterCells,
            ...floor.terrain.flatMap(piece => piece.cells),
          ]);
          const clearOfThings = (x: number, y: number): boolean =>
            !never.has(cellKey(Math.floor(x), Math.floor(y)))
            && floor.props.every(prop => Math.hypot(prop.x - x, prop.y - y) >= propReach(prop.kind) * prop.scale + 0.3)
            && floor.columns.every(column => Math.hypot(column.x - x, column.y - y) >= column.radius + 0.4);
          const p = pinCell(visible, room);
          const where = `seed ${seed} floor ${index} room ${room.id} at ${p.x},${p.y}`;
          rooms++;
          // A cave's chamber may reach past its rectangle; its own cells hold its pin.
          if (!room.cells) expect(p.x > room.x && p.x < room.x + room.w && p.y > room.y && p.y < room.y + room.h, where).toBe(true);
          expect(holdsCell(room, Math.floor(p.x), Math.floor(p.y)), `${where}: on the room's own cells`).toBe(true);
          const roomCells = floorCellsOf(room);
          const anyIdeal = roomCells.some(c => !room.rotunda && clearOfThings(c.x + 0.5, c.y + 0.5) && !preferNot.has(cellKey(c.x, c.y)));
          const ideal = clearOfThings(p.x, p.y) && !preferNot.has(cellKey(Math.floor(p.x), Math.floor(p.y)));
          if (anyIdeal) expect(ideal, where).toBe(true);
          else if (!ideal) wet++;
          if (roomCells.some(c => clearOfThings(c.x + 0.5, c.y + 0.5)) && !room.rotunda) expect(clearOfThings(p.x, p.y), where).toBe(true);
        }
      });
    }
    expect(rooms).toBeGreaterThan(300);
    // Rooms under water or walked terrain wall to wall, or too small for anything else
    expect(wet / rooms).toBeLessThan(0.15);
  });
});

const cellsOfStair = (s: Parameters<typeof spotRect>[0]): { x: number; y: number }[] => {
  const r = spotRect(s);
  const out: { x: number; y: number }[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push({ x, y });
  return out;
};

describe('the outlines of tall objects', () => {
  it('stand on columns, statues and wells, block light alone, and sealing never bridges one to a wall or another', () => {
    let outlines = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const model = generateDungeon({ seed, theme: seed % 2 ? 'fortress' : undefined, tags: seed % 2 ? ['colonnades'] : ['large'], floors: 1 + (seed % 2) });
      const { parts, image } = partsOf(model);
      const tolerance = sealTolerance(worldTexel(image));
      for (const level of parts.levelIds ?? [undefined]) {
        const walls = wallsOn(parts, level);
        const objects = walls.filter(w => w.id.includes('_shadow_'));
        outlines += new Set(objects.map(w => w.chainId)).size;
        // Shadows, not cover: light alone, one-way from inside so the top is lit.
        for (const wall of objects) {
          expect(wall.blocks).toBe('light');
          expect(wall.direction).toBeDefined();
        }
        // A house's windows stop a token alone and its garden's hedges sight alone; every other wall stops both.
        for (const wall of walls.filter(w => !w.id.includes('_shadow_'))) expect(wall.id.includes('_grounds_') ? [undefined, 'sight'] : [undefined, 'movement']).toContain(wall.blocks);
        const owner = (id: string): string => (id.includes('_shadow_') ? id.replace(/_\d+$/, '') : 'walls');
        for (const bridge of sealWalls(walls, tolerance).slice(walls.length)) {
          const named = bridge.id.split(':').filter(part => part.startsWith('wall_'));
          expect(named.length, `seed ${seed}: ${bridge.id}`).toBeGreaterThan(0);
          const owners = new Set(named.map(owner));
          if ([...owners].some(o => o !== 'walls')) expect(owners.size, `seed ${seed}: ${bridge.id}`).toBe(1);
        }
      }
    }
    expect(outlines).toBeGreaterThan(50);
  });
});

describe('cell outlines', () => {
  const area = (ring: { x: number; y: number }[]): number => ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length]!.y - ring[(i + 1) % ring.length]!.x * p.y, 0) / 2;

  it('traces an L of cells as one ring with its six corners', () => {
    const rings = cellOutlines([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 64);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(6);
    expect(area(rings[0]!)).toBe(3);
  });

  it('keeps cells that touch at a corner apart', () => {
    const rings = cellOutlines([{ x: 0, y: 0 }, { x: 1, y: 1 }], 64);
    expect(rings.map(ring => ring.length)).toEqual([4, 4]);
  });

  it('gives a ring of cells around a hole as the rectangles of its rows', () => {
    const ring = [0, 1, 2].flatMap(y => [0, 1, 2].map(x => ({ x, y }))).filter(c => !(c.x === 1 && c.y === 1));
    const rings = cellOutlines(ring, 64);
    expect(rings).toHaveLength(4);
    expect(rings.reduce((sum, r) => sum + area(r), 0)).toBe(8);
  });
});

describe('vegetation in the scene', () => {
  it('names undergrowth as difficult terrain and climbers on the cells they hang over, under everything else, and lists what grows in the note', () => {
    const model = generateDungeon({ seed: 3, theme: 'mansion', tags: ['overgrown', 'ruined'], floors: 1 });
    const floor = model.floors[0]!;
    const { parts } = partsOf(model);
    const features = Object.values(parts.scene.mapFeatures ?? {});
    const brambles = features.filter(feature => feature.name === 'Brambles');
    expect(brambles.length).toBeGreaterThan(0);
    for (const feature of brambles) expect(feature.terrain).toEqual({ difficult: true });
    const ivy = features.filter(feature => feature.name === 'Ivy');
    expect(ivy.length).toBeGreaterThan(0);
    for (const feature of ivy) expect(feature.terrain).toBeUndefined();
    expect(features.some(feature => feature.name === 'Weeds')).toBe(false);
    // Vegetation lies first, so whatever stands on it is found over it.
    const firstSolid = features.findIndex(feature => !['Ivy', 'Moss', 'Ferns', 'Roots', 'Pale fungi', 'Flowering vines', 'Dead creepers'].includes(feature.name));
    expect(features.slice(firstSolid).some(feature => feature.name === 'Ivy')).toBe(false);
    const grownRooms = new Set(floor.growth.filter(g => floor.rooms[g.room]?.kind === 'room').map(g => g.room)).size;
    expect(parts.rooms.filter(room => room.facts.includes('Growing here: ')).length).toBe(grownRooms);
    expect(parts.rooms.some(room => room.facts.includes('Terrain: ') && room.facts.includes('Brambles'))).toBe(true);
  });
});

describe('room types', () => {
  const typeNames = /^(Gatehouse|Kitchen|Great hall|Throne room|Chapel|Barracks|Library|Drawing room|Ballroom|Entrance hall|Bedroom)$/;

  it('are never named on the map', () => {
    for (const theme of ['fortress', 'mansion', 'cavern'] as const) {
      const features = Object.values(partsOf(generateDungeon({ seed: 21, theme, tags: ['secret'], floors: 2 })).parts.scene.mapFeatures ?? {});
      expect(features.length).toBeGreaterThan(0);
      expect(features.filter(feature => typeNames.test(feature.name)).map(feature => feature.name)).toEqual([]);
    }
  });

  it('are never named in a heading, which names only the boss room and five-room stages', () => {
    const model = generateDungeon({ seed: 21, theme: 'fortress', tags: [], floors: 2 });
    const keyed = model.floors.flatMap((_, index) => keyedRooms(visibleFloor(model, DEFAULT_VIEW, index), model.floors.length));
    expect(keyed.some(({ heading }) => heading.endsWith('Boss room'))).toBe(true);
    for (const { room, key, heading } of keyed) expect(heading).toBe(room.boss ? `${key} · Boss room` : key);
  });
});

describe('a cavern\'s note', () => {
  const caves = Array.from({ length: 30 }, (_, k) => generateDungeon({ seed: 3 + k * 613, theme: 'cavern', tags: k % 2 ? ['secret'] : [], floors: 2 + (k % 2) }));

  it('speaks of narrows, crawls and scree, never of a door, and of pitches, avens and scree slopes between floors', () => {
    let pitches = 0;
    let avens = 0;
    for (const model of caves) {
      model.floors.forEach((floor, index) => {
        const visible = visibleFloor(model, DEFAULT_VIEW, index);
        for (const room of floor.rooms) {
          const facts = roomFacts(visible, room, DEFAULT_VIEW);
          expect(facts, `seed ${model.seed}`).not.toMatch(/\bdoors?\b|\bopenings?\b|\bsteps\b|\bstairs\b/i);
          if (/A pitch drops to floor/.test(facts)) pitches++;
          if (/An aven rises to floor/.test(facts)) avens++;
        }
        for (const stair of floor.stairs.filter((s) => s.way === 'pitch')) {
          const room = floor.rooms.find((r) => r.kind === 'room' && cellsOfStair(stair).every((c) => holdsCell(r, c.x, c.y)));
          if (room) expect(roomFacts(visible, room, DEFAULT_VIEW)).toMatch(stair.to > index ? /A pitch drops to floor/ : /An aven rises to floor/);
        }
      });
    }
    expect(pitches).toBeGreaterThan(0);
    expect(avens).toBeGreaterThan(0);
  });

  it('keeps its liquids inside the cave', () => {
    for (const model of caves.filter((_, k) => k % 3 === 0).map((m) => generateDungeon({ seed: m.seed, theme: 'cavern', tags: ['flooded'], floors: 2 }))) {
      const { parts, placement } = partsOf(model);
      const ids = parts.levelIds!;
      for (const liquid of Object.values(parts.scene.liquids ?? {})) {
        const index = ids.indexOf(liquid.level!);
        const rings = wallRings(visibleFloor(model, DEFAULT_VIEW, index).floors, [], 0);
        for (const p of liquid.polygon) {
          const c = { x: p.x / placement.pxPerCell + placement.originCell.x, y: p.y / placement.pxPerCell + placement.originCell.y };
          // A surface with more corners than a liquid holds is simplified by a hundredth of a cell (toLiquids' FIRST_TOLERANCE).
          expect(insideRings(rings, c) || nearRings(rings, c, WALL_SNAP), `seed ${model.seed} ${liquid.liquid} at ${c.x},${c.y}`).toBe(true);
        }
      }
    }
  });
});

/** How far a simplified liquid's corner may lie past the cave's walls: twice the first simplification. */
const WALL_SNAP = 0.02;

function insideRings(rings: readonly { x: number; y: number }[][], p: { x: number; y: number }): boolean {
  let hit = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function nearRings(rings: readonly { x: number; y: number }[][], p: { x: number; y: number }, d: number): boolean {
  return rings.some((ring) => ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    return Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) <= d;
  }));
}
