import { describe, expect, it } from 'vitest';
import { applyLayoutEdit, type KeyLibrary } from '../../../../src/app/online/gmScreen/keys/layoutEdits.ts';
import { parseLayout, parseLayoutEdit, pathPrint, shownLayout, slotPrint, type GmScreenLayout } from '../../../../src/app/online/protocol/index.ts';

const LIBRARY: KeyLibrary = { moodName: () => 'Mood', rollName: () => 'Roll', rollable: () => true };
const D20 = { k: 'dice', formula: '1d20' };
const D6 = { k: 'dice', formula: '1d6' };

const grid = (slots: Record<number, unknown>): GmScreenLayout => parseLayout({ slots: Array.from({ length: 15 }, (_, place) => slots[place] ?? null) }, 'phone')!;
const folder = (name: string, inside: Record<number, unknown> = {}): unknown => ({ k: 'folder', name, glyph: 'folder', slots: Array.from({ length: 14 }, (_, place) => inside[place] ?? null) });

/** What the device saw along `path` in the grid it was sent. */
const seen = (shown: GmScreenLayout, path: readonly number[]): string => pathPrint(shownLayout(shown).slots, path)!;

function apply(now: GmScreenLayout, raw: Record<string, unknown>): GmScreenLayout | string {
  const edit = parseLayoutEdit(raw, 'phone');
  if (edit === null) return 'unparsed';
  const result = applyLayoutEdit(now, edit, 'phone', LIBRARY);
  return 'refused' in result ? result.refused : result.layout;
}

describe('a change on a grid another device changed along its way or beneath its slot', () => {
  it('is refused where two folders of one name and picture were swapped since', () => {
    const shown = grid({ 0: folder('Combat', { 0: D20 }), 1: folder('Combat', { 0: D6 }) });
    const swapped = grid({ 0: folder('Combat', { 0: D6 }), 1: folder('Combat', { 0: D20 }) });
    expect(apply(swapped, { op: 'remove', at: [0], held: seen(shown, [0]) })).toBe('changed');
  });

  it('is refused where the folder it removes was filled since', () => {
    const shown = grid({ 0: folder('Combat') });
    const filled = grid({ 0: folder('Combat', { 0: D20, 1: D6 }) });
    expect(apply(filled, { op: 'remove', at: [0], held: seen(shown, [0]) })).toBe('changed');
  });

  it('is refused inside a folder whose place another folder took since, and made where nothing changed', () => {
    const shown = grid({ 0: folder('Night', { 3: D20 }), 1: folder('Day', { 3: D20 }) });
    const swapped = grid({ 0: folder('Day', { 3: D20 }), 1: folder('Night', { 3: D20 }) });
    expect(apply(swapped, { op: 'put', at: [0, 4], key: D6, held: seen(shown, [0, 4]) })).toBe('changed');
    expect(apply(swapped, { op: 'remove', at: [0, 3], held: seen(shown, [0, 3]) })).toBe('changed');
    expect(apply(swapped, { op: 'move', from: [0, 3], to: [1, 3], held: seen(swapped, [0, 3]), there: seen(shown, [1, 3]) })).toBe('changed');
    expect(typeof apply(shown, { op: 'remove', at: [0, 3], held: seen(shown, [0, 3]) })).toBe('object');
  });

  it('tells two keys of a kind Atlas does not know apart by their own data', () => {
    const shown = grid({ 0: { k: 'timer', minutes: 5 }, 1: { k: 'timer', minutes: 10 } });
    const swapped = grid({ 0: { k: 'timer', minutes: 10 }, 1: { k: 'timer', minutes: 5 } });
    expect(slotPrint(shown.slots[0]!)).not.toBe(slotPrint(shown.slots[1]!));
    expect(apply(swapped, { op: 'remove', at: [0], held: seen(shown, [0]) })).toBe('changed');
    const large = grid({ 0: { k: 'timer', text: 'x'.repeat(2000) } });
    expect(typeof apply(large, { op: 'remove', at: [0], held: seen(large, [0]) }), 'a key sent as its kind alone is printed as it was sent').toBe('object');
  });

  it('is made in the folder of all moods however the library changed, which Atlas fills and the grid holds by its kind alone', () => {
    const shown = grid({ 0: folder('Sound', { 0: { k: 'moods' } }) });
    const renamed: KeyLibrary = { ...LIBRARY, moodName: () => 'Another name' };
    const edit = parseLayoutEdit({ op: 'move', from: [0, 0], to: [0, 1], held: seen(shown, [0, 0]), there: seen(shown, [0, 1]) }, 'phone')!;
    expect('layout' in applyLayoutEdit(shown, edit, 'phone', renamed)).toBe(true);
  });
});
