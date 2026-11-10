import { describe, expect, it } from 'vitest';
import { moveEntryPatch, moveEntryToPatch } from '../../../../src/app/statblocks/editor/statblock-pane/entryPatches';

const items = [{ name: 'Bite' }, { name: 'Lash' }, { name: 'Roar' }, { name: 'Sting' }];

describe('moveEntryToPatch', () => {
  it('places a dragged entry after the one that will stand before it', () => {
    expect(moveEntryToPatch('actions', items, 0, 2)).toEqual({ op: 'move', list: 'actions', item: items[0], after: items[2] });
    expect(moveEntryToPatch('actions', items, 3, 1)).toEqual({ op: 'move', list: 'actions', item: items[3], after: items[0] });
    expect(moveEntryToPatch('actions', items, 2, 0)).toEqual({ op: 'move', list: 'actions', item: items[2], after: null });
  });

  it('moves nothing to its own place or off the list', () => {
    expect(moveEntryToPatch('actions', items, 1, 1)).toBeNull();
    expect(moveEntryToPatch('actions', items, 1, 4)).toBeNull();
    expect(moveEntryToPatch('actions', items, 7, 0)).toBeNull();
  });

  it('is what a step of Alt+↑/↓ does', () => {
    expect(moveEntryPatch('actions', items, 1, -1)).toEqual(moveEntryToPatch('actions', items, 1, 0));
    expect(moveEntryPatch('actions', items, 1, 1)).toEqual({ op: 'move', list: 'actions', item: items[1], after: items[2] });
  });
});
