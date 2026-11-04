import { describe, expect, it } from 'vitest';
import { keyCommand, scopeOf, type KeyPress } from '../../../../src/app/statblocks/editor/template-editor/keyCommands';
import {
  existingSelection, focusAfterDelete, inSiblingOrder, stepInReadingOrder, withSibling,
} from '../../../../src/app/statblocks/editor/template-editor/selection';
import { gapAt } from '../../../../src/app/statblocks/editor/template-editor/gapGeometry';
import { shortcutText } from '../../../../src/app/statblocks/editor/template-editor/shortcutText';
import { sampleTemplate } from './editorKit';

const sample = sampleTemplate();
const { layout } = sample;
const all = (): boolean => true;
const HEADER = ['header-name', 'header-token', 'header-level', 'header-type', 'header-hp', 'header-description'];

describe('selection', () => {
  it('walks the header\'s parts, then the tiles row by row; never a row of its own', () => {
    const order: string[] = [];
    for (let id = stepInReadingOrder(sample, null, 1, all); id; id = stepInReadingOrder(sample, id, 1, all)) order.push(id);
    expect(order).toEqual([...HEADER, 'title001', 'stat-ac1', 'stat-hp1', 'stat-sp1', 'stat-cr1', 'divider1']);
    expect(stepInReadingOrder(sample, null, -1, all)).toBe('divider1');
    expect(stepInReadingOrder(sample, 'header-name', -1, all)).toBeNull();
  });

  it('skips tiles and parts the canvas does not draw', () => {
    expect(stepInReadingOrder(sample, 'title001', 1, (id) => id !== 'stat-ac1')).toBe('stat-hp1');
    expect(stepInReadingOrder(sample, 'header-hp', -1, (id) => id !== 'header-type')).toBe('header-level');
  });

  it('adds siblings with Shift+click and starts over for a block of another parent', () => {
    expect(withSibling(layout, ['stat-ac1'], 'stat-hp1')).toEqual(['stat-ac1', 'stat-hp1']);
    expect(withSibling(layout, ['stat-ac1', 'stat-hp1'], 'stat-ac1')).toEqual(['stat-hp1']);
    expect(withSibling(layout, ['stat-ac1'], 'stat-sp1')).toEqual(['stat-sp1']);
    // A part of the header is picked on its own.
    expect(withSibling(layout, ['stat-ac1'], 'header-hp')).toEqual(['header-hp']);
    expect(withSibling(layout, ['header-hp'], 'stat-ac1')).toEqual(['stat-ac1']);
    expect(inSiblingOrder(layout, ['stat-hp1', 'stat-ac1'])).toEqual(['stat-ac1', 'stat-hp1']);
  });

  it('moves focus after a delete to the next tile in reading order, else the one before', () => {
    expect(focusAfterDelete(sample, ['stat-ac1'])).toBe('stat-hp1');
    expect(focusAfterDelete(sample, ['stat-hp1'])).toBe('stat-sp1');
    expect(focusAfterDelete(sample, ['divider1'])).toBe('stat-cr1');
    expect(focusAfterDelete(sample, ['stat-sp1', 'stat-cr1'])).toBe('divider1');
  });

  it('forgets ids an undo took away, keeping the same array while all are there', () => {
    const selection = ['stat-ac1'];
    expect(existingSelection(sample, selection)).toBe(selection);
    expect(existingSelection(sample, ['gone0000', 'stat-ac1'])).toEqual(['stat-ac1']);
    expect(existingSelection(sample, ['header-level'])).toEqual(['header-level']);
    expect(existingSelection({ ...sample, header: { hidden: ['level'] } }, ['header-level'])).toEqual([]);
  });
});

function press(key: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return { key, code: undefined, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers };
}

describe('keyCommand', () => {
  it('maps the template editor column of the keyboard table (§7.7)', () => {
    expect(keyCommand(press('ArrowUp'), true)).toBe('select-previous');
    expect(keyCommand(press('ArrowDown', { altKey: true }), true)).toBe('move-down');
    expect(keyCommand(press('ArrowLeft'), true)).toBe('select-previous');
    expect(keyCommand(press('ArrowRight', { altKey: true }), true)).toBe('move-down');
    expect(keyCommand(press('ArrowLeft', { altKey: true }), true)).toBe('move-up');
    expect(keyCommand(press('Enter'), true)).toBe('edit-label');
    expect(keyCommand(press('/'), true)).toBe('insert');
    expect(keyCommand(press('Delete'), true)).toBe('delete');
    expect(keyCommand(press('Backspace'), true)).toBe('delete');
    expect(keyCommand(press('Escape'), true)).toBe('escape');
    expect(keyCommand(press('Tab'), true)).toBe('next-region');
    expect(keyCommand(press('Tab', { shiftKey: true }), true)).toBe('previous-region');
    expect(keyCommand(press('F10', { shiftKey: true }), true)).toBe('open-menu');
  });

  it('reads Mod as Cmd on macOS and Ctrl elsewhere', () => {
    expect(keyCommand(press('d', { metaKey: true }), true)).toBe('duplicate');
    expect(keyCommand(press('d', { ctrlKey: true }), true)).toBeNull();
    expect(keyCommand(press('d', { ctrlKey: true }), false)).toBe('duplicate');
    expect(keyCommand(press('g', { metaKey: true }), true)).toBeNull();
    expect(keyCommand(press('z', { metaKey: true }), true)).toBe('undo');
    expect(keyCommand(press('Z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
    expect(keyCommand(press('c', { ctrlKey: true }), false)).toBe('copy');
    expect(keyCommand(press('v', { ctrlKey: true }), false)).toBe('paste');
  });

  it('reads letters by their key code, which Alt does not change ("∂" is Alt+D on macOS)', () => {
    expect(keyCommand(press('∂', { metaKey: true, code: 'KeyD' }), true)).toBe('duplicate');
  });

  it('takes "/" typed with Shift, as some layouts need', () => {
    expect(keyCommand(press('/', { shiftKey: true }), true)).toBe('insert');
  });

  it('leaves other keys alone', () => {
    expect(keyCommand(press('a'), true)).toBeNull();
    expect(keyCommand(press('ArrowUp', { shiftKey: true }), true)).toBeNull();
    expect(keyCommand(press('Enter', { shiftKey: true }), true)).toBeNull();
  });

  it('lets undo and redo act anywhere in the view, everything else only on blocks', () => {
    expect(scopeOf('undo')).toBe('view');
    expect(scopeOf('delete')).toBe('blocks');
  });
});

describe('shortcutText', () => {
  it('writes shortcuts as each platform does', () => {
    expect(shortcutText(['Mod', 'Alt'], 'R', true)).toBe('⌥⌘R');
    expect(shortcutText(['Mod', 'Shift'], 'G', false)).toBe('Ctrl+Shift+G');
  });
});

describe('gapAt', () => {
  const stack = [{ left: 0, top: 0, right: 100, bottom: 20 }, { left: 0, top: 36, right: 100, bottom: 56 }];

  it('finds the gap between two blocks of a stack, and a line across it', () => {
    expect(gapAt(stack, { x: 50, y: 28 }, 'stack')).toEqual({ index: 1, orientation: 'horizontal', x: 0, y: 28, length: 100 });
    expect(gapAt(stack, { x: 50, y: 10 }, 'stack')).toBeNull();
  });

  it('counts a point just inside a block as in the gap, for lists that stand 2 px apart', () => {
    const tight = [{ left: 0, top: 0, right: 100, bottom: 20 }, { left: 0, top: 22, right: 100, bottom: 42 }];
    expect(gapAt(tight, { x: 10, y: 18 }, 'stack')?.index).toBe(1);
  });

  it('never joins the last block of one column to the first of the next', () => {
    const columns = [{ left: 0, top: 200, right: 100, bottom: 220 }, { left: 120, top: 0, right: 220, bottom: 20 }];
    expect(gapAt(columns, { x: 110, y: 210 }, 'stack')).toBeNull();
  });

  it('finds the gap between blocks of a row, and a line along it', () => {
    const row = [{ left: 0, top: 0, right: 40, bottom: 30 }, { left: 56, top: 0, right: 96, bottom: 40 }];
    expect(gapAt(row, { x: 48, y: 15 }, 'row')).toEqual({ index: 1, orientation: 'vertical', x: 48, y: 0, length: 40 });
  });
});
