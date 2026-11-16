import { describe, expect, it } from 'vitest';
import { floorNaming } from '../../src/app/import/uvtt/uvttFloorNames';

const files = (...names: string[]): { fileName: string }[] => names.map((fileName) => ({ fileName }));
const order = (...names: string[]): string[] => floorNaming(files(...names)).floors.map((floor) => floor.file.fileName);
const levelNames = (...names: string[]): string[] => floorNaming(files(...names)).floors.map((floor) => floor.name);

describe('the floors of files picked together', () => {
  // The names of real exports (see uvttRealExports.test.ts), listed in an order a file picker may give
  it.each<[string, string[], string[]]>([
    ['Dungeon Alchemist\'s `-_00`', ['Inn by the Lake-_02.dd2vtt', 'Inn by the Lake-_00.dd2vtt', 'Inn by the Lake-_10.dd2vtt', 'Inn by the Lake-_01.dd2vtt'],
      ['Inn by the Lake-_00.dd2vtt', 'Inn by the Lake-_01.dd2vtt', 'Inn by the Lake-_02.dd2vtt', 'Inn by the Lake-_10.dd2vtt']],
    ['`_floor_N`', ['tower_floor_2.dd2vtt', 'tower_floor_0.dd2vtt', 'tower_floor_1.dd2vtt'], ['tower_floor_0.dd2vtt', 'tower_floor_1.dd2vtt', 'tower_floor_2.dd2vtt']],
    ['`.N`', ['sorcerers-tower.1.dd2vtt', 'sorcerers-tower.0.dd2vtt'], ['sorcerers-tower.0.dd2vtt', 'sorcerers-tower.1.dd2vtt']],
    ['`L01` between shared words', ['Small-Home-16x18-L02-nogrid-lights.uvtt', 'Small-Home-16x18-L01-nogrid-lights.uvtt'],
      ['Small-Home-16x18-L01-nogrid-lights.uvtt', 'Small-Home-16x18-L02-nogrid-lights.uvtt']],
    ['a basement\'s `B1` below the numbered floors', ['Penhew-32x40-01-Ground-nogrid.uvtt', 'Penhew-32x40-02-Exhibit-nogrid.uvtt', 'Penhew-32x40-B1-Basement-nogrid.uvtt'],
      ['Penhew-32x40-B1-Basement-nogrid.uvtt', 'Penhew-32x40-01-Ground-nogrid.uvtt', 'Penhew-32x40-02-Exhibit-nogrid.uvtt']],
  ])('stand bottom first by the number in their names: %s', (_label, given, expected) => {
    expect(order(...given)).toEqual(expected);
  });

  it('stand by name where not every file gives a number of its own, numbers in names compared as numbers', () => {
    expect(order('Keep 10.uvtt', 'Keep 9.uvtt', 'Keep.uvtt')).toEqual(['Keep.uvtt', 'Keep 9.uvtt', 'Keep 10.uvtt']);
    expect(order('Keep_1.uvtt', 'Keep_1 copy.uvtt')).toEqual(['Keep_1.uvtt', 'Keep_1 copy.uvtt']);
  });

  it('put a roof on top, whatever its number says', () => {
    expect(order('Inn_roof.dd2vtt', 'Inn_1.dd2vtt', 'Inn_0.dd2vtt')).toEqual(['Inn_0.dd2vtt', 'Inn_1.dd2vtt', 'Inn_roof.dd2vtt']);
    expect(order('Inn-_02 Roof.dd2vtt', 'Inn-_00.dd2vtt', 'Inn-_01.dd2vtt')).toEqual(['Inn-_00.dd2vtt', 'Inn-_01.dd2vtt', 'Inn-_02 Roof.dd2vtt']);
    expect(order('Roof.dd2vtt', 'Tower.dd2vtt')).toEqual(['Tower.dd2vtt', 'Roof.dd2vtt']);
    expect(order('Inn-_01.dd2vtt', 'Inn-_00 roof.dd2vtt', 'Inn-_02.dd2vtt')).toEqual(['Inn-_01.dd2vtt', 'Inn-_02.dd2vtt', 'Inn-_00 roof.dd2vtt']);
  });

  it('are named by what their names say beyond the shared words and the number, else by their place', () => {
    expect(levelNames('Penhew-32x40-B1-Basement-nogrid.uvtt', 'Penhew-32x40-01-Ground-nogrid.uvtt')).toEqual(['Basement', 'Ground']);
    // Nothing in a file says which floor is the ground: the lowest is often a cellar
    expect(levelNames('Inn-_00.dd2vtt', 'Inn-_01.dd2vtt', 'Inn-_02.dd2vtt')).toEqual(['Level 1', 'Level 2', 'Level 3']);
    expect(levelNames('Inn_0.dd2vtt', 'Inn_1.dd2vtt', 'Inn_roof.dd2vtt')).toEqual(['Level 1', 'Level 2', 'Roof']);
    expect(levelNames('keep cellar.uvtt', 'keep hall.uvtt')).toEqual(['Cellar', 'Hall']);
  });

  it('name the scene by the words every name starts with, without one that only says a floor follows', () => {
    expect(floorNaming(files('Inn by the Lake-_00.dd2vtt', 'Inn by the Lake-_01.dd2vtt')).sceneName).toBe('Inn by the Lake');
    expect(floorNaming(files('Small-Home-16x18-L01-nogrid.uvtt', 'Small-Home-16x18-L02-nogrid.uvtt')).sceneName).toBe('Small-Home-16x18');
    expect(floorNaming(files('tower_floor_0.dd2vtt', 'tower_floor_1.dd2vtt')).sceneName).toBe('tower');
    expect(floorNaming(files('Level_0.dd2vtt', 'Level_1.dd2vtt')).sceneName).toBe('Level');
  });

  it('name the scene after the bottom floor\'s file where the names share no word', () => {
    expect(floorNaming(files('Rooftop.dd2vtt', 'Cellar.dd2vtt'))).toMatchObject({ sceneName: 'Cellar', floors: [{ name: 'Cellar' }, { name: 'Rooftop' }] });
    expect(floorNaming(files('Tower1.dd2vtt', 'Tower2.dd2vtt')).floors.map((floor) => floor.name)).toEqual(['Tower1', 'Tower2']);
  });

  it('tell floors apart whose names are the same', () => {
    expect(floorNaming(files('map.dd2vtt', 'map.dd2vtt'))).toMatchObject({ sceneName: 'map', floors: [{ name: 'Level 1' }, { name: 'Level 2' }] });
  });
});
