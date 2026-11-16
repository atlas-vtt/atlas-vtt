import { describe, expect, it } from 'vitest';
import { placeUnderTile, POPOVER_GAP, POPOVER_MARGIN } from '../../../src/app/react/components/dm-screen/sound/moodPopoverPlacement';
import { MOOD_CREST_GROUPS, moodCrestPath, readMoodIcon } from '../../../src/app/soundLibrary/moodLook';

const view = { width: 1200, height: 800 };
const size = { width: 340, height: 400 };

describe('where the mood popover stands', () => {
  it('hangs under its tile, centred on it, the caret under the tile\'s middle', () => {
    const place = placeUnderTile({ left: 400, top: 100, width: 200, height: 80 }, size, view);
    expect(place).toEqual({ left: 330, top: 180 + POPOVER_GAP, side: 'below', caret: 170 });
  });

  it('stands above a tile near the window\'s foot, where there is more room', () => {
    const place = placeUnderTile({ left: 400, top: 600, width: 200, height: 80 }, size, view);
    expect(place.side).toBe('above');
    expect(place.top).toBe(600 - POPOVER_GAP - size.height);
  });

  it('keeps inside the window at its edges, with the caret still under the tile but clear of the corners', () => {
    const place = placeUnderTile({ left: 0, top: 100, width: 40, height: 80 }, size, view);
    expect(place.left).toBe(POPOVER_MARGIN);
    expect(place.caret).toBe(28);
  });
});

describe('mood crests', () => {
  it('offer every crest once, each with a glyph', () => {
    const ids = MOOD_CREST_GROUPS.flatMap((group) => group.crests.map((crest) => crest.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(moodCrestPath(id)).toMatch(/^M/);
  });

  it('leave out what fits no table, and still read an older mood\'s pin icon', () => {
    const ids = new Set(MOOD_CREST_GROUPS.flatMap((group) => group.crests.map((crest) => crest.id)));
    expect(ids.has('desk')).toBe(false);
    expect(readMoodIcon('desk')).toBe('desk');
    expect(readMoodIcon('ghost')).toBe('ghost');
    expect(readMoodIcon('nonsense')).toBeUndefined();
  });
});
