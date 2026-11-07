// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestMatch, findItems, insertItems, previewTemplate } from '../../../../src/app/statblocks/editor/template-editor/insertItems';
import { handleTemplateKey, type KeyboardTarget } from '../../../../src/app/statblocks/editor/template-editor/useTemplateKeyboard';
import { FakeSession, sampleTemplate } from './editorKit';

afterEach(cleanup);

describe('the insert menu\'s items', () => {
  it('are the seven kinds of the grid, in plain words, each saying what it makes', () => {
    expect(insertItems().map((item) => [item.label, item.type])).toEqual([
      ['Value', 'stat'], ['Metric', 'metric'], ['Abilities', 'entries'], ['Table', 'scores'], ['Counters', 'counters'], ['Text', 'text'], ['Divider', 'divider'],
    ]);
    for (const item of insertItems()) expect(item.example, item.label).not.toBe('');
  });

  it('finds items by every word typed, in their name, their line or other words', () => {
    expect(findItems(insertItems(), 'ability scores').map((item) => item.label)).toEqual(['Table']);
    expect(findItems(insertItems(), 'actions').map((item) => item.label)).toEqual(['Abilities']);
    expect(findItems(insertItems(), 'zzz')).toEqual([]);
  });

  it('starts the keys on the item named exactly what was typed, else on one whose name starts with it', () => {
    const items = findItems(insertItems(), 'text');
    expect(items.length).toBeGreaterThan(1);
    expect(items[bestMatch(items, 'text')]?.label).toBe('Text');
    const values = findItems(insertItems(), 'val');
    expect(values[bestMatch(values, 'val')]?.label).toBe('Value');
  });

});

describe('the keys from the view\'s scope', () => {
  function target(session: FakeSession, root: HTMLElement): KeyboardTarget {
    return {
      rootRef: { current: root }, session, selection: [], drawn: () => true, select: vi.fn(), settle: vi.fn(),
      editLabel: vi.fn(), openInsert: vi.fn(), openMenu: vi.fn(), openSave: vi.fn(), clipOwner: {},
    };
  }

  it('undoes from the scope where focus left the editor\'s elements, and never inside an input', () => {
    const session = new FakeSession(sampleTemplate());
    session.apply((source) => ({ ...source, description: 'changed' }));
    const root = document.body.createDiv();
    const undo = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(handleTemplateKey(target(session, root), undo, false)).toBe(false);
    expect(handleTemplateKey(target(session, root), undo, false, true)).toBe(true);
    expect(session.getSnapshot().canUndo).toBe(false);

    const input = root.createEl('input', { type: 'text' });
    input.focus();
    expect(handleTemplateKey(target(session, root), new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }), false, true)).toBe(false);
    root.remove();
  });

  it('opens Save with Mod+S from the scope or inside the editor, from a field being typed in too, and nowhere else', () => {
    const session = new FakeSession(sampleTemplate());
    const root = document.body.createDiv();
    const save = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true });
    const keys = target(session, root);
    expect(handleTemplateKey(keys, save(), false)).toBe(false);
    expect(keys.openSave).not.toHaveBeenCalled();
    expect(handleTemplateKey(keys, save(), false, true)).toBe(true);
    expect(keys.openSave).toHaveBeenCalledTimes(1);

    const input = root.createEl('input', { type: 'text' });
    input.focus();
    expect(handleTemplateKey(keys, save(), false)).toBe(true);
    expect(keys.openSave).toHaveBeenCalledTimes(2);
    expect(handleTemplateKey(keys, new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, shiftKey: true }), false, true)).toBe(false);
    root.remove();
  });
});
