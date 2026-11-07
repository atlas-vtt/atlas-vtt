import { describe, expect, it } from 'vitest';
import { MANSION } from '../../../src/app/dungeons/themes/mansion';
import { entranceRoom, typeOf, typingProblems } from './themeInvariants';
import { failuresOf, themeRuns } from './themeRuns';
import { describeThemeTerrain } from './themeTerrainRules';

/**
 * The rules every Haunted Mansion keeps whatever its layout, held over 500 houses of one to three
 * floors; the house's own (zones, sizes, doors) are `house/housePrograms.test.ts`.
 */
describe('generated Haunted Mansions', () => {
  const runs = themeRuns('mansion');

  it('opens on the entrance hall', () => {
    expect(failuresOf(runs, (m) => (typeOf(m, entranceRoom(m)) === 'entrance-hall' ? [] : [`entered by a ${typeOf(m, entranceRoom(m))}`]))).toEqual([]);
  });

  it('uses only the types of its own theme and types every normal room', () => {
    const ids = new Set<string>(MANSION.rooms.map((spec) => spec.id));
    expect(failuresOf(runs, (m) => typingProblems(m, ids))).toEqual([]);
  });

  describeThemeTerrain(runs, MANSION);
});
