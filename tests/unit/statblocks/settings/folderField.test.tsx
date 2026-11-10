// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TFolder, type App } from 'obsidian';
import { FolderField, folderPathOf, folderSuggestions } from '../../../../src/app/statblocks/settings/FolderField';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

afterEach(cleanup);

const folders = (...paths: string[]): TFolder[] => paths.map((path) => new TFolder(path));

describe('folderSuggestions', () => {
  const vault = folders('/', 'Bestiary', 'Bestiary/Hags', 'Campaign/Beasts', 'Campaign/Notes', '.trash/Beasts', 'Archive/Old bestiary');

  it('offers every folder but the root and dot folders while nothing is typed', () => {
    expect(folderSuggestions(vault, '')).toEqual(['Archive/Old bestiary', 'Bestiary', 'Bestiary/Hags', 'Campaign/Beasts', 'Campaign/Notes']);
  });

  it('ranks folders whose name begins with the text, then whose path does, then any that contain it', () => {
    expect(folderSuggestions(vault, 'be')).toEqual(['Bestiary', 'Campaign/Beasts', 'Bestiary/Hags', 'Archive/Old bestiary']);
    expect(folderSuggestions(vault, 'HAG')).toEqual(['Bestiary/Hags']);
  });

  it('does not offer the folder that is typed exactly', () => {
    expect(folderSuggestions(vault, 'bestiary/hags')).toEqual([]);
  });
});

describe('folderPathOf', () => {
  it('stores a folder without surrounding space or slashes, and nothing for a blank one', () => {
    expect(folderPathOf(' /Bestiary//Hags/ ')).toBe('Bestiary/Hags');
    expect(folderPathOf('   ')).toBe('');
    expect(folderPathOf('/')).toBe('');
  });
});

describe('FolderField', () => {
  let stored = '';

  function Field({ app }: { app: App }): React.JSX.Element {
    const [value, setValue] = useState('');
    stored = value;
    return <FolderField app={app} value={value} onChange={setValue} label="Folder" />;
  }

  function setup(): HTMLElement {
    const { app } = createInMemoryApp({ folders: ['Bestiary', 'Bestiary/Hags', 'Notes'] });
    render(<Field app={app} />);
    return screen.getByRole('combobox', { name: 'Folder' });
  }

  it('suggests matching folders as one types, and picks one with the arrow keys and Enter', () => {
    const field = setup();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'b' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Bestiary', 'Bestiary/Hags']);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Bestiary/Hags' }).id);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(stored).toBe('Bestiary/Hags');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes its list on Escape and takes the key, so the dialog around it stays open', () => {
    const field = setup();
    fireEvent.focus(field);
    expect(screen.getByRole('listbox')).toBeTruthy();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    const again = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { field.dispatchEvent(again); });
    expect(again.defaultPrevented).toBe(false);
  });

  it('keeps a folder that does not exist yet, tidied when the field is left', () => {
    const field = setup();
    fireEvent.change(field, { target: { value: ' /Monsters/Undead/ ' } });
    fireEvent.blur(field);
    expect(stored).toBe('Monsters/Undead');
  });

  it('picks a folder with the pointer', () => {
    const field = setup();
    fireEvent.focus(field);
    fireEvent.click(screen.getByRole('option', { name: 'Notes' }));
    expect(stored).toBe('Notes');
  });
});
