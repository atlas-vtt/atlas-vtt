import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { guardProblems } from '../caveChecks';

describe('a hidden crawl that cuts a way short', () => {
  it('never leads into a chamber at a corner of its floor, where a passage running along the wall beyond leaves the cell before it a spur', () => {
    // The main path swung out of a narrow tunnel along a chamber's wall, and a crawl from it entered the chamber's corner.
    const model = generateDungeon({ seed: 1_508_228, theme: 'cavern', tags: ['wet', 'winding'], floors: 2 });
    model.floors.forEach((_, index) => expect(guardProblems(model, index), `floor ${index}`).toEqual([]));
  });
});
