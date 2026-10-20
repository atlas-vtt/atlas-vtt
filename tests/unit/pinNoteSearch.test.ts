import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { createPinNoteSearch } from '../../src/app/tools/pinNoteSearch';

// Plain Atlas: add-ons that extend the search bring their own tests
vi.mock('../../src/app/addons/addonRegistry', () => ({ installedAddons: () => [] }));

let container: HTMLElement;

interface SetupOptions {
  headings?: Record<string, string[]>;
  paths?: string[];
  mapPath?: string | null;
}

function setup({ headings = {}, paths = ['Tavern.md', 'Temple.md', 'Town.atlasmap'], mapPath = null }: SetupOptions = {}): { onPick: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const files = paths.map((path) => new TFile(path));
  const app = {
    vault: { getAllLoadedFiles: () => files },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        headings: (headings[file.path] ?? headings[file.basename] ?? []).map((heading) => ({ heading, level: 2 })),
      }),
    },
  } as unknown as App;
  const onPick = vi.fn();
  const onCancel = vi.fn();
  container = document.body.createDiv();
  createPinNoteSearch(container, { app, mapPath, onPick, onCancel });
  return { onPick, onCancel };
}

const input = (): HTMLInputElement => container.querySelector<HTMLInputElement>('.pin-search-input')!;
const activeName = (): string | null | undefined =>
  container.querySelector('.pin-result-item.is-active .pin-result-name')?.textContent;
const folders = (): Array<string | null> =>
  [...container.querySelectorAll('.pin-result-item .pin-header-file')].map((element) => element.textContent);
const press = (key: string): void => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};
const type = (value: string): void => {
  input().value = value;
  input().dispatchEvent(new Event('input'));
};

describe('pin note search', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => container.remove());

  it('activates the first result before anything is typed', () => {
    const { onPick } = setup();
    expect(activeName()).toBe('Tavern');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md');
  });

  it('moves the active result with the arrow keys, wrapping at both ends', () => {
    const { onPick } = setup();
    press('ArrowDown');
    expect(activeName()).toBe('Temple');
    press('ArrowUp');
    press('ArrowUp');
    expect(activeName()).toBe('Town');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Town.atlasmap');
  });

  it('activates the first match again after every change to the search', () => {
    setup();
    press('ArrowDown');
    type('t');
    expect(activeName()).toBe('Tavern');
    type('tem');
    expect(activeName()).toBe('Temple');
  });

  it('opens the headings of a note that has them and activates the whole note first', () => {
    const { onPick } = setup({ headings: { Tavern: ['Cellar', 'Rooms'] } });
    press('Enter');
    expect(input().value).toBe('Tavern#');
    expect(activeName()).toBe('Entire note');
    press('ArrowDown');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md#Cellar');
  });

  it('activates the first matching heading', () => {
    const { onPick } = setup({ headings: { Tavern: ['Cellar', 'Rooms'] } });
    type('Tavern#ro');
    expect(activeName()).toBe('Rooms');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md#Rooms');
  });

  it('follows the pointer, so Enter picks the hovered result', () => {
    const { onPick } = setup();
    container.querySelectorAll<HTMLElement>('.pin-result-item')[2]!.dispatchEvent(new MouseEvent('mousemove'));
    expect(activeName()).toBe('Town');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Town.atlasmap');
  });

  it('cancels on Escape and does nothing on Enter without results', () => {
    const { onPick, onCancel } = setup();
    type('dragon');
    press('Enter');
    expect(onPick).not.toHaveBeenCalled();
    press('Escape');
    expect(onCancel).toHaveBeenCalled();
  });

  it('lists the headings of the note picked, not of another note with the same name', () => {
    const { onPick } = setup({
      paths: ['Places/Alula.md', 'Statblocks/Alula.md'],
      headings: { 'Places/Alula.md': ['Market'], 'Statblocks/Alula.md': ['Actions'] },
    });
    expect(folders()).toEqual(['Places', 'Statblocks']);
    press('ArrowDown');
    press('Enter');
    expect(input().value).toBe('Alula#');
    press('ArrowDown');
    expect(activeName()).toBe('Actions');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Statblocks/Alula.md#Actions');
  });

  it('lets a typed name shared by several notes pick the note first', () => {
    const { onPick } = setup({
      paths: ['Places/Alula.md', 'Statblocks/Alula.md'],
      headings: { 'Places/Alula.md': ['Market'], 'Statblocks/Alula.md': ['Actions'] },
    });
    type('alula#');
    expect(folders()).toEqual(['Places', 'Statblocks']);
    press('ArrowDown');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Statblocks/Alula.md#Actions');
  });

  it('keeps the heading typed after a shared name once the note is picked', () => {
    const { onPick } = setup({
      paths: ['Places/Alula.md', 'Statblocks/Alula.md'],
      headings: { 'Places/Alula.md': ['Market', 'Harbour'], 'Statblocks/Alula.md': ['Actions'] },
    });
    type('alula#Mar');
    press('Enter');
    expect(input().value).toBe('Alula#Mar');
    expect(activeName()).toBe('Market');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Places/Alula.md#Market');
  });

  it('offers the whole of a picked note without headings instead of pinning it while a heading is typed', () => {
    const { onPick } = setup({ paths: ['Places/Alula.md', 'Statblocks/Alula.md'], headings: { 'Statblocks/Alula.md': ['Actions'] } });
    type('alula#act');
    press('Enter');
    expect(onPick).not.toHaveBeenCalled();
    expect(activeName()).toBe('Pin to entire note');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Places/Alula.md');
  });

  it('never takes a scene for the note of the same name when listing headings', () => {
    const { onPick } = setup({ paths: ['Town.atlasmap', 'Notes/Town.md'], headings: { 'Notes/Town.md': ['Gates'] } });
    type('Town#ga');
    expect(activeName()).toBe('Gates');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Notes/Town.md#Gates');
  });

  it('offers only scenes of the collection the map belongs to', () => {
    setup({
      mapPath: 'atlas-vtt/collections/Realm/scenes/Town.atlasmap',
      paths: ['Tavern.md', 'atlas-vtt/collections/Realm/scenes/Keep.atlasmap', 'atlas-vtt/collections/Other/scenes/Crypt.atlasmap'],
    });
    const names = [...container.querySelectorAll('.pin-result-name')].map((element) => element.textContent);
    expect(names).toEqual(['Tavern', 'Keep']);
  });
});
