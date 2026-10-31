import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { CAVE_ALWAYS_TRAITS, CAVE_NEVER_TRAITS, CAVE_VARIANTS } from '../../../../src/app/dungeons/caveModel';
import { floorCellsOf } from '../../../../src/app/dungeons/geometry';
import type { CaveWay, DungeonDoor, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { draft } from '../../../../src/app/dungeons/terrain/catalog';
import { visibleFloor } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { roomFacts } from '../../../../src/app/dungeons/scene/roomFacts';
import { caveCharacterLine, dungeonNote } from '../../../../src/app/dungeons/scene/toNote';

/** A fresh cave of `floors` floors with its character and every way taken out, so each test sets what it reads. */
function plainCave(floors: number): DungeonModel {
  const model = generateDungeon({ seed: 4_242, theme: 'cavern', tags: [], floors });
  delete model.cave?.character;
  for (const floor of model.floors) {
    for (const door of floor.doors) delete door.way;
    floor.terrain = floor.terrain.filter((p) => p.kind !== 'aven' && !(p.kind === 'shaft' && p.opening?.bottom === null));
  }
  return model;
}

/** A chamber of floor `index` with an open way out to another room, the door and the direction it leaves by. */
function chamberWithWay(model: DungeonModel, index = 0): { room: DungeonRoom; door: DungeonDoor; direction: string } {
  const floor = model.floors[index]!;
  for (const room of floor.rooms.filter((r) => r.kind === 'room')) {
    const door = floor.doors.find((d) => d.kind === 'opening' && d.from === room.id && d.to !== null);
    if (door) return { room, door, direction: door.dir.y < 0 ? 'north' : door.dir.y > 0 ? 'south' : door.dir.x > 0 ? 'east' : 'west' };
  }
  throw new Error('no chamber with an open way');
}

const factsOf = (model: DungeonModel, room: DungeonRoom, index = 0): string => roomFacts(visibleFloor(model, DEFAULT_VIEW, index), room, DEFAULT_VIEW);

/** The ways that are no walk: a walk is the narrows every other way out of the room is too. */
const WAYS: readonly [CaveWay, string][] = [
  ['crawl', 'a crawl'],
  ['squeeze', 'a squeeze'],
  ['letterbox', 'a letterbox squeeze'],
  ['sump', 'a sump'],
  ['traverse', 'a traverse'],
  ['breakdown', 'a breakdown choke'],
];

describe('the note names a cave\'s ways', () => {
  it('names each way out by how it is passed', () => {
    for (const [way, words] of WAYS) {
      const model = plainCave(1);
      const { room, door, direction } = chamberWithWay(model);
      door.way = way;
      expect(factsOf(model, room), way).toContain(`${words} to the ${direction}`);
    }
    const model = plainCave(1);
    const { room, door } = chamberWithWay(model);
    door.way = 'walk';
    expect(factsOf(model, room)).toMatch(/narrows to the/);
  });

  it('says how far a climb within the floor rises or drops, and which way', () => {
    const model = plainCave(1);
    const { room, door, direction } = chamberWithWay(model);
    door.way = 'climb';
    door.drop = { depth: 20, kind: 'shaft' };
    door.descends = true;
    expect(factsOf(model, room)).toContain(`a 20 ft climb down to the ${direction}`);
    delete door.descends;
    door.drop = { depth: 10, kind: 'chimney' };
    expect(factsOf(model, room)).toContain(`a 10 ft climb up to the ${direction}`);
  });

  it('says where a chamber\'s one way on is a crawl or tighter, and nowhere else', () => {
    const model = plainCave(1);
    const floor = model.floors[0]!;
    // A chamber with one way on besides the way it is entered by, and no stairwell.
    const room = floor.rooms.find((r) => r.kind === 'room' && r.parent !== null && floor.doors.filter((d) => (d.from === r.id || d.to === r.id) && d.kind !== 'secret' && !(d.to === r.id && d.from === r.parent)).length === 1)!;
    const on = floor.doors.find((d) => (d.from === room.id || d.to === room.id) && !(d.to === room.id && d.from === room.parent))!;
    on.kind = 'opening';
    for (const [way, words] of [['crawl', 'The only way on is a crawl.'], ['squeeze', 'The only way on is a squeeze.'], ['letterbox', 'The only way on is a letterbox squeeze.']] as const) {
      on.way = way;
      expect(factsOf(model, room), way).toContain(words);
    }
    on.way = 'walk';
    expect(factsOf(model, room)).not.toContain('The only way on');
  });

  it('keeps a secret door a hidden crawl and steps a scree slope, whatever their way', () => {
    const model = plainCave(1);
    const { room, door, direction } = chamberWithWay(model);
    door.kind = 'secret';
    door.way = 'crawl';
    expect(factsOf(model, room)).toContain(`a hidden crawl to the ${direction}`);
    door.kind = 'steps';
    door.way = 'walk';
    expect(factsOf(model, room)).toMatch(new RegExp(`a scree slope (up|down) to the ${direction}`));
  });

  it('says where an aven rises: into the dark with no floor above, to the floor above where a room of it lies over the aven', () => {
    const one = plainCave(1);
    const { room } = chamberWithWay(one);
    one.floors[0]!.terrain.push({ ...draft('aven', room.id, [floorCellsOf(room)[0]!]), id: one.floors[0]!.terrain.length });
    const facts = factsOf(one, room);
    expect(facts).toContain('An aven rises into the dark.');
    expect(facts).not.toContain('Terrain: Aven');

    const two = plainCave(2);
    const lower = two.floors[1]!;
    const over = (c: { x: number; y: number }): boolean => two.floors[0]!.rooms.some((r) => floorCellsOf(r).some((d) => d.x === c.x && d.y === c.y));
    const chamber = lower.rooms.find((r) => r.kind === 'room' && floorCellsOf(r).some(over))!;
    lower.terrain.push({ ...draft('aven', chamber.id, [floorCellsOf(chamber).find(over)!]), id: lower.terrain.length });
    expect(factsOf(two, chamber, 1)).toContain('An aven rises to floor A.');
  });

  it('says a shaft with no floor below drops into the dark', () => {
    const model = plainCave(1);
    const { room } = chamberWithWay(model);
    model.floors[0]!.terrain.push({ ...draft('shaft', room.id, [floorCellsOf(room)[0]!]), opening: { bottom: null, link: 7 }, id: model.floors[0]!.terrain.length });
    const facts = factsOf(model, room);
    expect(facts).toContain('A shaft drops into the dark.');
    expect(facts).not.toContain('bottomless');
  });

  it('says how deep each way up or down is and how it is passed, counting ways alike together', () => {
    const one = plainCave(1);
    const { room } = chamberWithWay(one);
    const cells = floorCellsOf(room);
    const terrain = one.floors[0]!.terrain;
    const piece = (kind: 'aven' | 'shaft', at: number, depth: number, way: 'shaft' | 'chimney' | 'squeeze'): void => {
      terrain.push({ ...draft(kind, room.id, [cells[at]!], { traits: { drop: { depth, kind: way } } }), ...(kind === 'shaft' && { opening: { bottom: null, link: 50 + at } }), id: terrain.length });
    };
    piece('shaft', 0, 30, 'shaft');
    piece('shaft', 1, 20, 'chimney');
    piece('shaft', 2, 20, 'chimney');
    piece('aven', 3, 20, 'squeeze');
    piece('aven', 4, 40, 'shaft');
    piece('aven', 5, 10, 'chimney');
    const facts = factsOf(one, room);
    expect(facts).toContain('A shaft drops 30 ft into the dark.');
    expect(facts).toContain('2 chimneys drop 20 ft into the dark.');
    expect(facts).toContain('A vertical squeeze rises 20 ft into the dark.');
    expect(facts).toContain('An aven rises 40 ft into the dark.');
    expect(facts).toContain('A chimney rises 10 ft into the dark.');
    expect(facts).not.toMatch(/Terrain: .*(Shaft|Chimney|Aven)/);

    const two = plainCave(2);
    const upper = two.floors[0]!;
    const lower = two.floors[1]!;
    const over = (c: { x: number; y: number }): boolean => upper.rooms.some((r) => floorCellsOf(r).some((d) => d.x === c.x && d.y === c.y));
    const chamber = lower.rooms.find((r) => r.kind === 'room' && floorCellsOf(r).some(over))!;
    lower.terrain.push({ ...draft('aven', chamber.id, [floorCellsOf(chamber).find(over)!], { traits: { drop: { depth: 30, kind: 'shaft' } } }), id: lower.terrain.length });
    expect(factsOf(two, chamber, 1)).toContain('An aven rises 30 ft to floor A.');
    const top = upper.rooms.find((r) => r.kind === 'room')!;
    upper.terrain.push({ ...draft('shaft', top.id, [floorCellsOf(top)[0]!], { traits: { drop: { depth: 40, kind: 'chimney' } } }), opening: { bottom: 1, link: 77 }, id: upper.terrain.length });
    expect(factsOf(two, top, 0)).toContain('A chimney drops 40 ft to floor B.');
  });

  it('says how far a pitch between floors drops and how it is passed, from either end', () => {
    let found = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const model = generateDungeon({ seed: seed * 919, theme: 'cavern', tags: [], floors: 2 });
      model.floors.forEach((floor, index) => {
        for (const stair of floor.stairs.filter((s) => s.way === 'pitch')) {
          const room = floor.rooms.find((r) => r.kind === 'room' && floorCellsOf(r).some((c) => c.x === stair.x && c.y === stair.y));
          if (!room) continue;
          found++;
          expect(factsOf(model, room, index)).toMatch(stair.to > index ? /A (pitch|chimney|vertical squeeze) drops 10 ft to floor B\./ : /(An aven|A chimney|A vertical squeeze) rises 10 ft to floor A\./);
        }
      });
    }
    expect(found).toBeGreaterThan(0);
  });

  it('opens the note of a cave with a character with what made it, then what it always and never does', () => {
    const model = plainCave(1);
    model.cave!.variant = 'limestone';
    expect(caveCharacterLine(model)).toBeNull();
    model.cave!.character = { always: 'curves-back', never: 'dead-passages' };
    expect(caveCharacterLine(model)).toBe('Water cut these caves. The passages curve back on themselves; no passage ends blind.');
    expect(dungeonNote('The Vein', [], model)).toBe('# The Vein\n\nWater cut these caves. The passages curve back on themselves; no passage ends blind.\n');
    model.cave!.variant = 'fault';
    expect(caveCharacterLine(model)).toBe('A fault tore these caves open. The passages curve back on themselves; no passage ends blind.');
    expect(dungeonNote('The Vein', [])).toBe('# The Vein\n');
  });

  it('has a sentence for every character and every formation', () => {
    for (const always of CAVE_ALWAYS_TRAITS) for (const never of CAVE_NEVER_TRAITS) {
      const line = caveCharacterLine({ cave: { variant: 'limestone', faults: [], character: { always, never } } });
      expect(line).toMatch(/^Water cut these caves\. [A-Z][^;]+; [a-z][^;]+\.$/);
      expect(line).not.toContain('dungeonScene');
    }
    for (const variant of CAVE_VARIANTS) {
      const line = caveCharacterLine({ cave: { variant, faults: [], character: { always: 'low-roofs', never: 'calm-water' } } });
      expect(line).toMatch(/^[A-Z][^.;]+\. The roofs hang low/);
      expect(line).not.toContain('dungeonScene');
    }
  });
});
