import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { CAVE_ALWAYS_TRAITS, CAVE_NEVER_TRAITS } from '../../../../src/app/dungeons/caveModel';
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
    for (const room of floor.rooms) delete room.continuing;
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

  it('names a squeeze that leads on too tight to follow', () => {
    const model = plainCave(1);
    const { room } = chamberWithWay(model);
    room.continuing = { x: 0, y: -1 };
    expect(factsOf(model, room)).toContain('A squeeze leads on to the north, too tight to follow.');
  });

  it('opens the note of a cave with a character with what it always and never does, in one sentence', () => {
    const model = plainCave(1);
    expect(caveCharacterLine(model)).toBeNull();
    model.cave!.character = { always: 'curves-back', never: 'dead-passages' };
    expect(caveCharacterLine(model)).toBe('The passages curve back on themselves; no passage ends blind.');
    expect(dungeonNote('The Vein', [], model)).toBe('# The Vein\n\nThe passages curve back on themselves; no passage ends blind.\n');
    expect(dungeonNote('The Vein', [])).toBe('# The Vein\n');
  });

  it('has a sentence for every character', () => {
    for (const always of CAVE_ALWAYS_TRAITS) for (const never of CAVE_NEVER_TRAITS) {
      const line = caveCharacterLine({ cave: { variant: 'limestone', faults: [], character: { always, never } } });
      expect(line).toMatch(/^[A-Z][^;]+; [a-z][^;]+\.$/);
      expect(line).not.toContain('dungeonScene');
    }
  });
});
