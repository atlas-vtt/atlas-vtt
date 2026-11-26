import { describe, expect, it } from 'vitest';
import { hotkeyCaps } from '../../src/app/keyboard/hotkeyCaps';
import { cheatSheetSections, filterCheatSheet } from '../../src/app/keyboard/cheatSheetSections';
import { DEFAULT_MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';

describe('the cheat sheet', () => {
  it('writes a binding as the caps of the platform\'s keyboard', () => {
    expect(hotkeyCaps('Mod+Shift+z', true)).toEqual(['⇧', '⌘', 'Z']);
    expect(hotkeyCaps('Mod+Shift+z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(hotkeyCaps('Mod++', false)).toEqual(['Ctrl', '+']);
    expect(hotkeyCaps('Mod', true)).toEqual(['⌘']);
    expect(hotkeyCaps('Backspace', true)).toEqual(['⌫']);
    expect(hotkeyCaps('PageUp', false)).toEqual(['Page Up']);
    expect(hotkeyCaps('', false)).toEqual([]);
  });

  it('keeps the rows whose name or keys hold every word of a search', () => {
    const sections = cheatSheetSections({ ...DEFAULT_MAP_HOTKEYS, assets: '' }, false, false);
    expect(sections.find((section) => section.rows.some((row) => row.id === 'assets'))?.rows.find((row) => row.id === 'assets')?.combos).toEqual([]);
    const found = filterCheatSheet(sections, 'redo ctrl');
    expect(found.flatMap((section) => section.rows.map((row) => row.id))).toEqual(['redo', 'redoAlt']);
    expect(filterCheatSheet(sections, 'no such shortcut')).toEqual([]);
  });
});
