// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { App, Scope, TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMarkEdit, toggleMark, type InlineMark } from '../../../../src/app/statblocks/editor/markdown-typing/markdownMarks';
import { toggleMarkIn } from '../../../../src/app/statblocks/editor/markdown-typing/markIn';
import { linkQueryBefore, wikilink } from '../../../../src/app/statblocks/editor/markdown-typing/linkQuery';
import { watchMarkdownTyping } from '../../../../src/app/statblocks/editor/markdown-typing/markdownTyping';
import { LinkSuggest } from '../../../../src/app/statblocks/editor/markdown-typing/LinkSuggest';
import { PLAIN_TEXT } from '../../../../src/app/statblocks/editor/markdown-typing/textFields';
import { PanelScope } from '../../../../src/app/statblocks/editor/note-panel/panelScope';
import { caretIn, selectText } from '../../../../src/app/statblocks/editor/statblock-pane/plainEditable';

afterEach(cleanup);

/** `|` marks the selection's ends (one `|` for a caret); the text after toggling, marked the same way. */
function toggled(marked: string, mark: InlineMark): string {
  const start = marked.indexOf('|');
  const second = marked.indexOf('|', start + 1);
  const end = second < 0 ? start : second - 1;
  const text = marked.replace(/\|/g, '');
  const edit = toggleMark({ text, start, end }, mark);
  const after = applyMarkEdit(text, edit);
  return edit.start === edit.end
    ? `${after.slice(0, edit.start)}|${after.slice(edit.start)}`
    : `${after.slice(0, edit.start)}|${after.slice(edit.start, edit.end)}|${after.slice(edit.end)}`;
}

describe('formatting keys on a text field', () => {
  it('wraps the selection, and an empty one gets an empty pair around the caret', () => {
    expect(toggled('Keen |smell|', '**')).toBe('Keen **|smell|**');
    expect(toggled('Keen |smell|', '*')).toBe('Keen *|smell|*');
    expect(toggled('Keen |', '**')).toBe('Keen **|**');
    // Spaces at the selection's ends stay outside the mark.
    expect(toggled('Keen| smell |now', '**')).toBe('Keen **|smell|** now');
  });

  it('takes the mark off where it stands around the selection or inside it', () => {
    expect(toggled('Keen **|smell|**', '**')).toBe('Keen |smell|');
    expect(toggled('Keen |**smell**|', '**')).toBe('Keen |smell|');
    expect(toggled('Keen **|**', '**')).toBe('Keen |');
    expect(toggled('*|smell|*', '*')).toBe('|smell|');
  });

  it('tells bold from italic', () => {
    expect(toggled('**|smell|**', '*')).toBe('***|smell|***');
    expect(toggled('***|smell|***', '*')).toBe('**|smell|**');
    expect(toggled('***|smell|***', '**')).toBe('*|smell|*');
    expect(toggled('*|smell|*', '**')).toBe('***|smell|***');
  });

  it('formats a React input through its change event, and leaves plain and read-only fields alone', () => {
    const changes: string[] = [];
    function Field(): React.JSX.Element {
      const [value, setValue] = useState('Keen smell');
      return <input aria-label="Senses" value={value} onChange={(event) => { changes.push(event.target.value); setValue(event.target.value); }} />;
    }
    const { getByLabelText } = render(<><Field /><input aria-label="HP" readOnly value="7" /><input aria-label="AC" {...PLAIN_TEXT} defaultValue="14" /></>);
    const input = getByLabelText('Senses') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(5, 10);
    act(() => { expect(toggleMarkIn(input, '**')).toBe(true); });
    expect(input.value).toBe('Keen **smell**');
    expect(changes).toEqual(['Keen **smell**']);
    expect([input.selectionStart, input.selectionEnd]).toEqual([7, 12]);
    act(() => { toggleMarkIn(input, '**'); });
    expect(input.value).toBe('Keen smell');

    expect(toggleMarkIn(getByLabelText('HP'), '**')).toBe(false);
    expect(toggleMarkIn(getByLabelText('AC'), '**')).toBe(false);
    expect(toggleMarkIn(document.body, '**')).toBe(false);
  });

  it("formats an ability's editable text, which hears it as typing", () => {
    const span = document.body.createSpan({ attr: { contenteditable: 'plaintext-only' } });
    span.textContent = 'It bites hard.';
    const typed = vi.fn();
    span.addEventListener('input', typed);
    span.focus();
    selectText(span, 3, 8);
    expect(toggleMarkIn(span, '*')).toBe(true);
    expect(span.textContent).toBe('It *bites* hard.');
    expect(caretIn(span)).toEqual([4, 9]);
    expect(typed).toHaveBeenCalledOnce();
    span.remove();
  });

  it("is the panel's key: Mod+B in its field formats it and never reaches the note beside it", () => {
    const app = new App();
    const host = document.body.createDiv();
    const input = host.createEl('input', { type: 'text' });
    input.value = 'smell';
    const keys = new PanelScope(app, { host: () => host, noteHistory: () => true, say: () => undefined, noteName: () => 'Goblin' });
    const stop = keys.watch(host);
    input.focus();
    input.setSelectionRange(0, 5);
    const scope = app.keymap.scopes.at(-1) as Scope & { keys: Array<{ modifiers: string[]; key: string; func: () => unknown }> };
    const bold = scope.keys.find((key) => key.key === 'b' && key.modifiers.join() === 'Mod')!;
    expect(bold.func()).toBe(false);
    expect(input.value).toBe('**smell**');
    // Focus on no text field: the key goes nowhere (undefined stops Obsidian's lookup without preventing the key).
    const button = host.createEl('button');
    button.focus();
    expect(bold.func()).toBeUndefined();
    stop();
    host.remove();
  });
});

describe('[[ in a text field', () => {
  function vault(): App {
    const app = new App();
    const files = ['Gear/Longsword.md', 'Gear/Longbow.md', 'Bestiary/Goblin.md', 'Maps/Cave.png'].map((path) => new TFile(path));
    files.forEach((file, index) => { file.stat.mtime = index; });
    const caches: Record<string, unknown> = {
      'Gear/Longsword.md': { frontmatter: { aliases: ['Blade of the Marsh'] }, headings: [{ heading: 'Great weapons', level: 2 }, { heading: 'Damage', level: 2 }] },
    };
    app.vault = { getFiles: () => files, getFileByPath: (path: string) => files.find((file) => file.path === path) ?? null };
    app.metadataCache = {
      getFileCache: (file: TFile) => caches[file.path] ?? null,
      fileToLinktext: (file: TFile) => (file.extension === 'md' ? file.basename : file.name),
      getFirstLinkpathDest: (path: string) => files.find((file) => file.basename === path) ?? null,
    };
    return app;
  }

  type Keyed = Scope & { keys: Array<{ key: string; modifiers: string[]; func: (event: KeyboardEvent) => unknown }> };

  function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.setSelectionRange(text.length, text.length);
    act(() => { input.dispatchEvent(new InputEvent('input', { bubbles: true })); });
  }

  /** Presses `name` in the topmost key scope, as Obsidian's keymap does; what its handler returned. */
  function key(app: App, name: string): unknown {
    const scope = app.keymap.scopes.at(-1) as Keyed | undefined;
    const handler = scope?.keys.find((each) => each.key === name && each.modifiers.length === 0);
    let result: unknown;
    act(() => { result = handler?.func(new KeyboardEvent('keydown', { key: name })); });
    return result;
  }

  /** The rows the suggest's list shows. */
  function titles(suggest: LinkSuggest): string[] {
    const list = (suggest as unknown as { suggestEl: HTMLElement }).suggestEl;
    return [...list.querySelectorAll('.suggestion-title')].map((title) => title.textContent ?? '');
  }

  it('reads the link being typed before the caret', () => {
    expect(linkQueryBefore('Wears [[Long')).toEqual({ start: 6, path: 'Long', heading: null });
    expect(linkQueryBefore('[[Longsword#Gre')).toEqual({ start: 0, path: 'Longsword', heading: 'Gre' });
    expect(linkQueryBefore('[[Longsword]] and')).toBeNull();
    expect(linkQueryBefore('[[Longsword|bla')).toBeNull();
    expect(linkQueryBefore('no link')).toBeNull();
    expect(wikilink({ linktext: 'Longsword', heading: 'Great: weapons', alias: 'blade' })).toBe('[[Longsword#Great weapons|blade]]');
  });

  it("offers the vault's notes as the link is typed, and Enter puts the link in its place", () => {
    const app = vault();
    const host = document.body.createDiv();
    const input = host.createEl('input', { type: 'text' });
    const stop = watchMarkdownTyping(app, host, () => 'Bestiary/Goblin.md');
    input.focus();
    type(input, 'Wears [[Long');
    const suggest = app.keymap.scopes.at(-1);
    expect(suggest).toBeDefined();
    expect(key(app, 'Enter')).toBe(false);
    expect(input.value).toBe('Wears [[Longsword]]');
    expect([input.selectionStart, input.selectionEnd]).toEqual([19, 19]);
    // The list closed: nothing of it is on the keymap.
    expect(app.keymap.scopes.at(-1)).not.toBe(suggest);
    stop();
    host.remove();
  });

  it('filters by name and alias, offers headings after #, and Tab takes the highlighted one', () => {
    const app = vault();
    const input = document.body.createEl('input', { type: 'text' });
    const suggest = new LinkSuggest(app, input, () => 'Bestiary/Goblin.md');
    input.focus();
    type(input, '[[');
    // Nothing typed yet: the most recently changed first.
    expect(titles(suggest)).toEqual(['Cave.png', 'Goblin', 'Longbow', 'Longsword']);
    type(input, '[[Longs');
    expect(titles(suggest)).toEqual(['Longsword']);
    type(input, '[[Longsword#');
    expect(titles(suggest)).toEqual(['Great weapons', 'Damage']);
    type(input, '[[marsh');
    expect(titles(suggest)).toEqual(['Blade of the Marsh']);
    expect(key(app, 'Tab')).toBe(false);
    expect(input.value).toBe('[[Longsword|Blade of the Marsh]]');

    type(input, '[[Longsword#dam');
    key(app, 'Enter');
    expect(input.value).toBe('[[Longsword#Damage]]');

    type(input, '[[cave');
    key(app, 'Enter');
    expect(input.value).toBe('[[Cave.png]]');
    input.remove();
  });

  it('closes only its list on Escape, keeping the text and the field', () => {
    const app = vault();
    const host = document.body.createDiv();
    const input = host.createEl('input', { type: 'text' });
    const stop = watchMarkdownTyping(app, host, () => 'Bestiary/Goblin.md');
    input.focus();
    const before = app.keymap.scopes.length;
    type(input, '[[Long');
    expect(app.keymap.scopes.length).toBe(before + 1);
    // false: Obsidian prevents the key and stops it, so the editor around the field never sees it.
    expect(key(app, 'Escape')).toBe(false);
    expect(app.keymap.scopes.length).toBe(before);
    expect(input.value).toBe('[[Long');
    expect(document.activeElement).toBe(input);
    stop();
    host.remove();
  });

  it('offers nothing in a choice with its own list or a number field', () => {
    const app = vault();
    const host = document.body.createDiv();
    const choice = host.createEl('input', { type: 'text', attr: { role: 'combobox' } });
    const number = host.createEl('input', { type: 'text', attr: { inputmode: 'decimal' } });
    const stop = watchMarkdownTyping(app, host, () => 'Bestiary/Goblin.md');
    for (const input of [choice, number]) {
      input.focus();
      type(input, '[[Long');
      expect(app.keymap.scopes).toEqual([]);
    }
    stop();
    host.remove();
  });
});
