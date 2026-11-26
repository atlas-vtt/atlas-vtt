import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../../../src/app/online/gmScreen/keys/defaultLayouts.ts';
import { applyLayoutEdit, type KeyLibrary } from '../../../../src/app/online/gmScreen/keys/layoutEdits.ts';
import { GRID_SLOTS, MAX_LAYOUT_KEYS, parseLayout, parseLayoutEdit, type GmScreenLayout, type LayoutSlot } from '../../../../src/app/online/protocol/index.ts';
import { rollableFormula } from '../../../../src/app/tools/rollableFormula';

const library: KeyLibrary = { moodName: (id) => (id === 'tavern' ? 'Tavern' : null), rollName: () => null, rollable: rollableFormula };

function apply(layout: GmScreenLayout, edit: Record<string, unknown>): GmScreenLayout | string {
  const parsed = parseLayoutEdit(edit, 'tablet');
  if (parsed === null) return 'unparsed';
  const result = applyLayoutEdit(layout, parsed, 'tablet', library);
  return 'refused' in result ? result.refused : result.layout;
}

/** A tablet grid of folders full of dice, `keys` keys in all. */
function crowded(keys: number): GmScreenLayout {
  let left = keys;
  const dice = (count: number): LayoutSlot[] => Array.from({ length: count }, () => (left-- > 0 ? { k: 'dice', formula: '1d6' } : null));
  const slots = Array.from({ length: GRID_SLOTS.tablet }, (): LayoutSlot => (left-- > 0 ? { k: 'folder', name: 'F', glyph: 'dice', slots: dice(GRID_SLOTS.tablet - 1) } : null));
  return parseLayout({ slots }, 'tablet') ?? { slots: [] };
}

describe('a change to a grid', () => {
  it('swaps a key moved onto another, and leaves its own slot empty when moved onto an empty one', () => {
    const swapped = apply(defaultLayout('tablet'), { op: 'move', from: [0], to: [1] });
    expect(typeof swapped !== 'string' && swapped.slots.slice(0, 2)).toEqual([{ k: 'command', command: 'pause' }, { k: 'command', command: 'stopAll' }]);
    const moved = apply(defaultLayout('tablet'), { op: 'move', from: [0], to: [19] });
    expect(typeof moved !== 'string' && [moved.slots[0], moved.slots[19]]).toEqual([null, { k: 'command', command: 'stopAll' }]);
  });

  it('refuses a key once the grid holds the most it may, and takes one in place of another', () => {
    const full = crowded(MAX_LAYOUT_KEYS);
    expect(apply(full, { op: 'put', at: [GRID_SLOTS.tablet - 1], key: { k: 'moods' } })).toBe('full');
    expect(typeof apply(full, { op: 'put', at: [0, 0], key: { k: 'moods' } })).toBe('object');
    expect(typeof apply(crowded(MAX_LAYOUT_KEYS - 1), { op: 'put', at: [GRID_SLOTS.tablet - 1], key: { k: 'moods' } })).toBe('object');
  });

  it("names a mood key with the library's name, never the device's", () => {
    const put = apply(defaultLayout('tablet'), { op: 'put', at: [19], key: { k: 'mood', id: 'tavern', name: 'Hacked' } });
    expect(typeof put !== 'string' && put.slots[19]).toEqual({ k: 'mood', id: 'tavern', name: 'Tavern' });
  });
});
