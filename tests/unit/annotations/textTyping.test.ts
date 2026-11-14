// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSpots, handlesOf } from '../../../src/app/annotations/annotationHandles';
import { annotationList } from '../../../src/app/annotations/annotationList';
import { MAX_TEXT_LENGTH, MAX_TEXTS } from '../../../src/app/annotations/annotationTypes';
import { textHeight } from '../../../src/app/annotations/drawSizes';
import { FONT_FAMILIES, TEXT_PLATE } from '../../../src/app/annotations/madeText';
import { canRunMapHotkeys } from '../../../src/app/keyboard/mapHotkeys';
import { isTextEntryTarget } from '../../../src/app/keyboard/textEntry';
import { pickDrawStyle } from '../../../src/app/packages/components/toolbar/drawStyleStore';
import { TEXT_CONTENT_LABEL } from '../../../src/app/pixi/textElementView';
import { watchTextFonts } from '../../../src/app/pixi/textFonts';
import { markHandled } from '../../../src/app/pixi/utils/handledEvents';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TextElement } from '../../../src/app/types';
import { CELL, drawScene, type DrawScene } from '../../helpers/drawScene';

const openContextMenuGlobal = vi.hoisted(() => vi.fn<(entries: ContextMenuEntry[], at: { x: number; y: number }) => boolean>(() => true));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

// jsdom measures every letter 8 wide and every line 10 high (`stubJsdomGraphics`).
const LETTER = 8;
const LINE = 10;

let current: DrawScene | undefined;
beforeEach(() => openContextMenuGlobal.mockClear());
afterEach(() => {
  current?.destroy();
  current = undefined;
  document.body.replaceChildren();
});

function scene(texts: Partial<TextElement>[] = []): DrawScene & { ids: string[] } {
  const s = current = drawScene();
  const ids = texts.map((text) => s.store.getState().addText({ x: 300, y: 300, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...text }));
  getHistoryStore(s.store)!.getState().clear();
  s.store.getState().clearSelection();
  return Object.assign(s, { ids });
}
const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;
const undo = (s: DrawScene): void => getHistoryStore(s.store)!.getState().undo();
const selected = (s: DrawScene): string[] => s.store.getState().selectedIds;
const pressOn = (target: Element): MouseEvent => {
  const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  target.dispatchEvent(press);
  return press;
};
/** A double click on the map at (x, y), as the viewport's dispatch hands it on. */
function doubleClick(s: DrawScene, x: number, y: number): void {
  s.pull([[x, y]]);
  s.pull([[x, y]], { soon: true });
}

describe('typing a text on the map', () => {
  it('opens a field where the map is clicked, and writes the text in the tool\'s look once, when Enter ends it', () => {
    const s = scene();
    s.tool({ mode: 'text', color: '#ffcc00', size: 'l', look: 'plate', font: 'scifi', players: false });
    s.click(123, 45);
    const field = s.field()!;
    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    s.type('Gate');
    // Nothing is on the map, and nothing can be undone, while the text is typed.
    expect([s.texts(), steps(s)]).toEqual([[], 0]);
    expect(s.fieldKey('Enter').defaultPrevented).toBe(true);
    expect(s.field()).toBeNull();
    // Its line is centred on the click, from side to side and from top to bottom.
    expect(s.texts()).toEqual([expect.objectContaining({
      x: 123, y: 45, text: 'Gate', color: '#ffcc00', fontSize: textHeight('l', CELL), fontFamily: FONT_FAMILIES.scifi,
      ...TEXT_PLATE, hidden: true,
    })]);
    // The tool names no alignment, weight or slant: a new text is centred and upright by having none.
    for (const field of ['align', 'bold', 'italic', 'outline']) expect(s.texts()[0]).not.toHaveProperty(field);
    expect(s.texts()[0]).not.toHaveProperty('width');
    expect(steps(s)).toBe(1);
    expect(selected(s)).toEqual([s.texts()[0]!.id]);
    undo(s);
    expect(s.texts()).toEqual([]);
  });

  it('starts a new line with Shift+Enter, and leaves the Enter that ends a composition to the composition', () => {
    const s = scene();
    s.tool({ mode: 'text' });
    s.click(200, 100);
    s.type('Old');
    expect(s.fieldKey('Enter', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(s.fieldKey('Enter', { isComposing: true }).defaultPrevented).toBe(false);
    expect(s.field()).not.toBeNull();
    s.type('Old\nMill');
    s.fieldKey('Enter');
    // The first line stays where it was typed: the text grows downward, and its place is the middle of both lines.
    expect(s.texts()[0]).toMatchObject({ text: 'Old\nMill', x: 200, y: 100 + LINE / 2 });
  });

  it('gives a dragged text the drag\'s width: its words wrap, and it keeps where its lines broke', () => {
    const s = scene();
    s.tool({ mode: 'text', size: 's' });
    s.drag([[100, 100], [140, 104], [180, 105]]);
    s.type('aaa bbb ccc');
    s.fieldKey('Enter');
    // 80 wide: "aaa bbb" fits (56), a third word does not.
    expect(s.texts()[0]).toMatchObject({ text: 'aaa bbb ccc', width: 80, breaks: [8], x: 140, y: 100 - LINE / 2 + LINE });
    expect(steps(s)).toBe(1);
    // A drag to the left begins where the drag ended, and is as wide.
    s.drag([[400, 300], [340, 300], [300, 301]]);
    s.type('x');
    s.fieldKey('Enter');
    expect(s.texts()[1]).toMatchObject({ width: 100, breaks: [], x: 350 });
  });

  it('drops a new text on Escape, and one left without a letter', () => {
    const s = scene();
    s.tool({ mode: 'text' });
    s.click(100, 100);
    s.type('Gate');
    expect(s.fieldKey('Escape').defaultPrevented).toBe(true);
    expect([s.field(), s.texts(), steps(s)]).toEqual([null, [], 0]);
    s.click(100, 100);
    s.type('  \n ');
    s.fieldKey('Enter');
    expect([s.field(), s.texts(), steps(s)]).toEqual([null, [], 0]);
  });

  it('starts none for a press that pans, a press something else took, or on a level that is full', () => {
    const s = scene();
    s.tool({ mode: 'text' });
    s.click(100, 100, { button: 2 });
    expect(s.field()).toBeNull();
    // What claims a press is heard before the tool, once the view's dispatch listens.
    s.viewport.once('pointerdown', markHandled);
    s.renderer.hearPressesLast();
    s.click(100, 100);
    expect(s.field()).toBeNull();
    // A pointer that is lost during the drag starts nothing either.
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 200, 100);
    window.dispatchEvent(new Event('blur'));
    s.pointer('pointerup', 200, 100);
    expect(s.field()).toBeNull();
    s.store.setState({ objects: { ...s.store.getState().objects, texts: Object.fromEntries(Array.from({ length: MAX_TEXTS }, (_, index) => [`t${index}`, { id: `t${index}`, kind: 'text' as const, x: 900, y: 900, text: 'x', fontSize: 20, fontFamily: 'Arial', color: '#ffffff' }])) } });
    s.click(100, 100);
    expect(s.field()).toBeNull();
    expect(s.full).toHaveBeenLastCalledWith('texts');
  });

  it('finishes on a press elsewhere, which then does what it does there; not on a press in the tool\'s bars, which leaves the keyboard with the field', () => {
    const s = scene();
    const bars = document.body.createDiv({ cls: 'atlas-bottom-toolbar-row__options' });
    const button = bars.createEl('button');
    s.tool({ mode: 'text' });
    s.click(100, 100);
    s.type('Gate');
    pressOn(button);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(s.field()).not.toBeNull();
    // A press in the field itself moves its caret.
    pressOn(s.field()!);
    expect(s.field()).not.toBeNull();
    expect(pressOn(document.body).defaultPrevented).toBe(false);
    expect(s.field()).toBeNull();
    expect(s.texts()).toHaveLength(1);
  });

  it('only finishes the text on a press beside it in Text mode: that press starts no next text, the one after it does', () => {
    const s = scene();
    s.tool({ mode: 'text' });
    s.click(100, 100);
    s.type('Gate');
    // The browser's press reaches the document first, then the map, as one event.
    const press = pressOn(s.viewport.options.events.domElement);
    s.pull([[400, 300]], { native: press });
    expect(s.field()).toBeNull();
    expect(s.texts().map(({ text }) => text)).toEqual(['Gate']);
    expect(selected(s)).toEqual([]);
    // A drag from beside the text ends it too, and starts no text box.
    s.click(100, 400);
    s.type('Keep');
    const drag = pressOn(s.viewport.options.events.domElement);
    s.pull([[400, 300], [520, 300]], { native: drag });
    expect(s.field()).toBeNull();
    expect(s.texts().map(({ text }) => text)).toEqual(['Gate', 'Keep']);
    // The next press is a press like any other.
    const next = pressOn(s.viewport.options.events.domElement);
    s.pull([[400, 300]], { native: next });
    expect(s.field()?.value).toBe('');
  });

  it('follows the tool\'s bars while a new text is typed, without a write', () => {
    const s = scene();
    s.tool({ mode: 'text', font: 'medieval', size: 'm' });
    s.click(100, 100);
    s.type('Gate');
    pickDrawStyle(s.store, 'font', 'mono');
    pickDrawStyle(s.store, 'size', 'xl');
    pickDrawStyle(s.store, 'color', '#e93147');
    const root = s.host.querySelector<HTMLElement>('.atlas-map-text-field')!;
    expect(root.style.getPropertyValue('--atlas-text-field-font')).toBe(`normal normal ${textHeight('xl', CELL)}px "${FONT_FAMILIES.mono}"`);
    expect(root.style.getPropertyValue('--atlas-text-field-color')).toBe('#e93147');
    expect([s.field()?.value, s.texts(), steps(s)]).toEqual(['Gate', [], 0]);
    s.fieldKey('Enter');
    expect(s.texts()[0]).toMatchObject({ text: 'Gate', fontFamily: FONT_FAMILIES.mono, fontSize: textHeight('xl', CELL), color: '#e93147' });
    expect(steps(s)).toBe(1);
  });

  it('writes what was typed when the tool, the mode or the view is left, and when the canvas shows the players\' picture', () => {
    const s = scene();
    const typed = (words: string): void => {
      s.tool({ mode: 'text' });
      s.click(100, 100 + 50 * s.texts().length);
      s.type(words);
    };
    typed('one');
    s.store.getState().setDrawTool({ mode: 'pen' });
    typed('two');
    s.store.getState().setActiveTool('move');
    typed('three');
    s.renderer.leave();
    typed('four');
    s.players.shown = true;
    s.renderer.refreshVisibility();
    s.players.shown = null;
    expect(s.field()).toBeNull();
    expect(s.texts().map((text) => text.text)).toEqual(['one', 'two', 'three', 'four']);
    // Another scene has no place for it.
    typed('five');
    s.store.getState().setMapPath('maps/other.atlasmap');
    expect(s.field()).toBeNull();
    expect(s.texts().map((text) => text.text)).not.toContain('five');
  });

  it('keeps its keys from the map: nothing typed is a hotkey', () => {
    const s = scene();
    s.tool({ mode: 'text' });
    s.click(100, 100);
    const field = s.field()!;
    expect(isTextEntryTarget(field)).toBe(true);
    for (const init of [{ key: ' ' }, { key: 'Delete' }, { key: 'Backspace' }, { key: 'z', metaKey: true }, { key: 'a', ctrlKey: true }, { key: 'ArrowLeft' }, { key: 'b' }]) {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      field.dispatchEvent(event);
      expect(canRunMapHotkeys(event), init.key).toBe(false);
      expect(event.defaultPrevented, init.key).toBe(false);
    }
    expect(s.field()).toBe(field);
  });
});

describe('editing a text on the map', () => {
  it('opens the field on a double click, in the Draw tool\'s Select mode and with the move tool, and writes the words in one step', () => {
    const s = scene([{}]);
    for (const [tool, words] of [['draw', 'Vault!'], ['move', 'Vault!!']] as const) {
      s.tool({ mode: 'select' });
      s.store.getState().setActiveTool(tool);
      doubleClick(s, 300, 300);
      const field = s.field()!;
      expect(field.value).toBe(words.slice(0, -1));
      // All of it is selected: what is typed takes its place.
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
      s.type(words);
      s.fieldKey('Enter');
      expect(s.texts()[0]!.text).toBe(words);
    }
    expect(steps(s)).toBe(2);
    expect(selected(s)).toEqual(s.ids);
  });

  it('takes no more than a text may have, and leaves a longer one from a file as it is until it is edited', () => {
    const long = 'abcde '.repeat(MAX_TEXT_LENGTH / 2);
    const s = scene([{ text: long }]);
    const record = s.texts()[0]!;
    s.tool({ mode: 'select' });
    doubleClick(s, 300, 300);
    const field = s.field()!;
    expect(field.maxLength).toBe(MAX_TEXT_LENGTH);
    expect(field.value).toHaveLength(MAX_TEXT_LENGTH);
    // Closed as it was opened: the record is the file's, with all of its words.
    s.fieldKey('Enter');
    expect(s.texts()[0]).toBe(record);
    expect(steps(s)).toBe(0);
    // Edited, it is written as long as a text may be.
    doubleClick(s, 300, 300);
    s.type(`${'x'.repeat(MAX_TEXT_LENGTH + 50)}`);
    s.fieldKey('Enter');
    expect(s.texts()[0]!.text).toBe('x'.repeat(MAX_TEXT_LENGTH));
  });

  it('opens it from the menu\'s Edit', () => {
    const s = scene([{}]);
    s.tool({ mode: 'select' });
    s.press(300, 300, { button: 2 });
    const edit = (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).find((entry) => entry.type === 'item' && entry.label === 'Edit');
    if (edit?.type === 'item') edit.onClick?.();
    expect(s.field()?.value).toBe('Vault');
  });

  it('puts back what the text said on Escape, and writes nothing where nothing changed', () => {
    const s = scene([{}]);
    s.tool({ mode: 'select' });
    doubleClick(s, 300, 300);
    s.type('Crypt');
    s.fieldKey('Escape');
    expect([s.texts()[0]!.text, steps(s)]).toEqual(['Vault', 0]);
    doubleClick(s, 300, 300);
    s.fieldKey('Enter');
    expect([s.texts()[0]!.text, steps(s)]).toEqual(['Vault', 0]);
  });

  it('deletes a text that is left empty, in one step', () => {
    const s = scene([{}]);
    s.tool({ mode: 'select' });
    doubleClick(s, 300, 300);
    s.type('');
    s.fieldKey('Enter');
    expect([s.texts(), steps(s), selected(s)]).toEqual([[], 1, []]);
    undo(s);
    expect(s.texts()[0]).toMatchObject({ text: 'Vault' });
  });

  it('opens no field on a locked text', () => {
    const s = scene([{ locked: true }]);
    s.tool({ mode: 'select' });
    doubleClick(s, 300, 300);
    expect(s.field()).toBeNull();
    expect(s.texts()[0]).toMatchObject({ text: 'Vault', locked: true });
  });

  it('hides the text\'s own drawing on the canvas while its field shows, and shows it to every other picture as the map has it', () => {
    const s = scene([{}]);
    s.tool({ mode: 'select' });
    const words = (): { visible: boolean } => s.node('text', s.ids[0]!)!.getChildByLabel(TEXT_CONTENT_LABEL)!;
    expect(words().visible).toBe(true);
    doubleClick(s, 300, 300);
    s.type('Crypt');
    expect(words().visible).toBe(false);
    // The store says what it said: nobody else sees a half-typed text.
    expect(s.texts()[0]!.text).toBe('Vault');
    for (const layers of [s.renderer.getPlayerViewLayers(), s.renderer.getPictureLayers()]) {
      expect(layers).toContainEqual({ layer: words(), visible: true });
    }
    s.fieldKey('Enter');
    expect(words().visible).toBe(true);
    expect(s.renderer.getPlayerViewLayers().some(({ layer }) => layer === words())).toBe(false);
  });

  it('grows from the top of its box while it is edited: a line that is added stands under those before it', () => {
    const s = scene([{ align: 'left' }]);
    s.tool({ mode: 'select' });
    const before = s.texts()[0]!;
    doubleClick(s, 300, 300);
    s.type('Vault\nof the old king');
    s.fieldKey('Enter');
    const after = s.texts()[0]!;
    // Its top and its left side stay: the middle goes down half a line and right half of what the longer line added.
    expect(after.y - before.y).toBeCloseTo(LINE / 2);
    expect(after.x - before.x).toBeCloseTo(((15 - 5) * LETTER) / 2);
    expect(steps(s)).toBe(1);
  });

  it('follows the bars as they restyle the text that is edited: each pick is its own step, and the words are written once', () => {
    const s = scene([{ fontFamily: FONT_FAMILIES.medieval }]);
    s.tool({ mode: 'select' });
    doubleClick(s, 300, 300);
    s.type('Crypt');
    pickDrawStyle(s.store, 'font', 'mono');
    expect(s.host.querySelector<HTMLElement>('.atlas-map-text-field')!.style.getPropertyValue('--atlas-text-field-font')).toContain(FONT_FAMILIES.mono);
    expect([s.field()?.value, s.texts()[0]!.text, s.texts()[0]!.fontFamily, steps(s)]).toEqual(['Crypt', 'Vault', FONT_FAMILIES.mono, 1]);
    s.fieldKey('Enter');
    expect([s.texts()[0]!.text, steps(s)]).toEqual(['Crypt', 2]);
  });

  it('shows a text that is bold, slanted and aligned as it is while it is edited, and its new words keep all three', () => {
    const s = scene([{ align: 'right', bold: true, italic: true }]);
    s.tool({ mode: 'select' });
    const before = s.texts()[0]!;
    doubleClick(s, 300, 300);
    const root = s.host.querySelector<HTMLElement>('.atlas-map-text-field')!;
    expect(root.style.getPropertyValue('--atlas-text-field-font')).toBe('italic bold 24px "Arial"');
    expect(root.style.getPropertyValue('--atlas-text-field-align')).toBe('right');
    s.type('Vault of kings');
    s.fieldKey('Enter');
    const after = s.texts()[0]!;
    expect(after).toEqual({ ...before, text: 'Vault of kings', x: after.x });
    // Aligned right, its right side stays where it stood: the middle goes left by half of what was added.
    expect(after.x - before.x).toBeCloseTo((-(14 - 5) * LETTER) / 2);
    // A pick of the bars leaves them too.
    s.store.getState().setSelection([after.id]);
    pickDrawStyle(s.store, 'size', 'xl');
    pickDrawStyle(s.store, 'look', 'outline');
    expect(s.texts()[0]).toMatchObject({ align: 'right', bold: true, italic: true, outline: true, fontSize: textHeight('xl', CELL) });
  });
});

describe('the side handles of a text', () => {
  /** Where the side handle at `side` of the one selected text stands. */
  function sideGrip(s: DrawScene, side: -1 | 1): { x: number; y: number } {
    const ids = new Set(selected(s));
    const handles = handlesOf(annotationList(levelObjects(s.store.getState())).filter((annotation) => ids.has(annotation.id)), s.renderer.layer.measure)!;
    return handleSpots(handles, 1).find(({ ref }) => ref.kind === 'side' && ref.x === side)!.at;
  }

  it('save no line breaks while the text\'s face is still loading: they are worked out once it is there', () => {
    const s = scene([{ text: 'aaa bbb ccc', fontFamily: FONT_FAMILIES.mono, width: 200, breaks: [4] }]);
    // The face is declared and not loaded yet.
    const stop = watchTextFonts({ check: () => false, load: () => new Promise(() => undefined) }, () => undefined);
    s.tool({ mode: 'select' });
    s.store.getState().setSelection(s.ids);
    const right = sideGrip(s, 1);
    s.pull([[right.x, right.y], [right.x - 20, right.y], [right.x - 40, right.y]]);
    const narrowed = s.texts()[0]!;
    expect(narrowed.width).toBeLessThan(200);
    // No breaks at all, where saved ones (none: every word on one line) would be drawn for good.
    expect(narrowed).not.toHaveProperty('breaks');
    stop();
  });

  it('set the width its words wrap at, keep the other side and the top where they are, and save where the lines break, in one step', () => {
    // Three words of 3 letters and the spaces between them: 88 wide, one line 10 high.
    const s = scene([{ text: 'aaa bbb ccc', scale: 2 }]);
    s.tool({ mode: 'select' });
    s.store.getState().setSelection(s.ids);
    const right = sideGrip(s, 1);
    // The right side comes 40 in on the map: 20 in the text's own units, which is 68, where only two words fit.
    s.pull([[right.x, right.y], [right.x - 20, right.y], [right.x - 40, right.y + 3]]);
    const narrowed = s.texts()[0]!;
    expect(narrowed).toMatchObject({ width: 68, breaks: [8], scale: 2, fontSize: 24 });
    // The left side stays: the middle moves half of what the box lost. The top stays: it moves down half the new line.
    expect(narrowed.x).toBeCloseTo(300 - 20);
    expect(narrowed.y).toBeCloseTo(300 + (LINE * 2) / 2);
    expect(steps(s)).toBe(1);
    // Wide again, its words stand in one line, and it lies where it lay.
    const again = sideGrip(s, 1);
    s.pull([[again.x, again.y], [again.x + 20, again.y], [again.x + 40, again.y]]);
    expect(s.texts()[0]).toMatchObject({ width: 88, breaks: [] });
    expect(s.texts()[0]!.x).toBeCloseTo(300);
    expect(s.texts()[0]!.y).toBeCloseTo(300);
    undo(s);
    undo(s);
    expect(s.texts()[0]).not.toHaveProperty('width');
    expect(s.texts()[0]).toMatchObject({ x: 300, y: 300 });
  });

  it('show the words wrapped while the side is dragged, and put everything back on Escape', () => {
    const s = scene([{ text: 'aaa bbb ccc', scale: 2 }]);
    s.tool({ mode: 'select' });
    s.store.getState().setSelection(s.ids);
    const words = (): string => (s.node('text', s.ids[0]!)!.getChildByLabel(TEXT_CONTENT_LABEL) as unknown as { text: string }).text;
    const left = sideGrip(s, -1);
    s.press(left.x, left.y);
    s.pointer('pointermove', left.x + 10, left.y);
    s.pointer('pointermove', left.x + 30, left.y);
    expect(words()).toBe('aaa bbb\nccc');
    expect(s.texts()[0]).not.toHaveProperty('width');
    expect(s.renderer.selecting.handleEscape()).toBe(true);
    expect(words()).toBe('aaa bbb ccc');
    expect([s.texts()[0]!.x, steps(s)]).toEqual([300, 0]);
  });

  it('scale a text with a width by its corners without changing where it wraps', () => {
    const s = scene([{ text: 'aaa bbb ccc', width: 60, breaks: [4, 8] }]);
    s.tool({ mode: 'select' });
    s.store.getState().setSelection(s.ids);
    const handles = handlesOf(annotationList(levelObjects(s.store.getState())), s.renderer.layer.measure)!;
    const corner = handleSpots(handles, 1).find(({ ref }) => ref.kind === 'corner' && ref.x === 1 && ref.y === 1)!.at;
    s.pull([[corner.x, corner.y], [corner.x + 30, corner.y + 15], [corner.x + 60, corner.y + 30]]);
    expect(s.texts()[0]).toMatchObject({ width: 60, breaks: [4, 8] });
    expect(s.texts()[0]!.scale).toBeGreaterThan(1.5);
  });
});
