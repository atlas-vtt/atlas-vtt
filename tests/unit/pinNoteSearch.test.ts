// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { createPinNoteSearch } from '../../src/app/tools/pinNoteSearch';
import { noteNameProblem, type PinCreateEntry, type PinLinkTarget } from '../../src/app/tools/pinCreateEntries';

let container: HTMLElement;

interface SetupOptions {
  headings?: Record<string, string[]>;
  paths?: string[];
  mapPath?: string | null;
  createEntries?: PinCreateEntry[];
  /** Folders the vault finds by path, such as a collection's encounters folder. */
  folders?: Record<string, TFolder>;
}

function setup({ headings = {}, paths = ['Tavern.md', 'Temple.md', 'Town.atlasmap'], mapPath = null, createEntries, folders = {} }: SetupOptions = {}): { onPick: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const files = paths.map((path) => new TFile(path));
  const app = {
    vault: { getAllLoadedFiles: () => files, getAbstractFileByPath: (path: string) => folders[path] ?? null },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        headings: (headings[file.path] ?? headings[file.basename] ?? []).map((heading) => ({ heading, level: 2 })),
      }),
    },
  } as unknown as App;
  const onPick = vi.fn();
  const onCancel = vi.fn();
  container = document.body.createDiv();
  createPinNoteSearch(container, { app, mapPath, onPick, onCancel, ...(createEntries && { createEntries }) });
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
    expect(names).toEqual(['Keep', 'Tavern']);
  });

  it('lists the map\'s folders of encounters among the notes by name, with how many each holds', () => {
    const folder = (path: string, children: Array<TFile | TFolder>): TFolder => Object.assign(new TFolder(path), { children });
    const root = 'atlas-vtt/collections/Realm/encounters';
    const forest = folder(`${root}/Forest`, [new TFile(`${root}/Forest/wolves.json`), new TFile(`${root}/Forest/bandits.json`)]);
    const { onPick } = setup({ mapPath: 'atlas-vtt/collections/Realm/scenes/Town.atlasmap', paths: ['Zoo.md', 'Forest notes.md', 'Bandit camp.md'], folders: { [root]: folder(root, [forest]) } });
    const names = [...container.querySelectorAll('.pin-result-name')].map((element) => element.textContent);
    expect(names).toEqual(['All encounters', 'Bandit camp', 'Forest', 'Forest notes', 'Zoo']);
    type('forest');
    expect(activeName()).toBe('Forest');
    expect(container.querySelector('.pin-result-item.is-active .pin-result-badge')?.textContent).toBe('2 encounters');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith(`${root}/Forest`);
  });
});

describe('pin note search create entries', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => container.remove());

  const noteEntry = (create: (name: string) => Promise<PinLinkTarget | null>): PinCreateEntry => ({
    id: 'note',
    label: (name) => `Create note “${name}”`,
    icon: 'file-plus',
    problem: noteNameProblem,
    create,
  });
  const names = (): Array<string | null> => [...container.querySelectorAll('.pin-result-name')].map((element) => element.textContent);
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('offers them only for a typed name no file carries', () => {
    setup({ createEntries: [noteEntry(async () => null)] });
    expect(names()).not.toContain('Create note “”');
    type('  ');
    expect(container.querySelector('.pin-create-item')).toBeNull();
    type('TAVERN');
    expect(container.querySelector('.pin-create-item')).toBeNull();
    type('town');
    expect(container.querySelector('.pin-create-item')).toBeNull();
    type('Tav');
    expect(names()).toEqual(['Create note “Tav”', 'Tavern']);
  });

  it('lists them first and active, in the order given, and moves past them with the keys', async () => {
    const dungeon = vi.fn(async () => ({ path: 'Dungeons/Crypt.atlasmap', sceneLevel: 'floor-a' }));
    const { onPick } = setup({
      createEntries: [noteEntry(async () => null), { id: 'dungeon', label: (name) => `Generate “${name}”`, icon: 'castle', create: dungeon }],
    });
    type('Te');
    expect(names()).toEqual(['Create note “Te”', 'Generate “Te”', 'Temple']);
    expect(activeName()).toBe('Create note “Te”');
    press('ArrowDown');
    press('Enter');
    // It works in the dropdown's place, so it is handed the dropdown
    expect(dungeon).toHaveBeenCalledWith('Te', container);
    await settle();
    // A scene made for the pin names the floor it opens on
    expect(onPick).toHaveBeenCalledWith('Dungeons/Crypt.atlasmap', 'floor-a');
  });

  it('picks the path created on Enter, once, with the name as typed', async () => {
    let finish: (target: PinLinkTarget) => void = () => undefined;
    const create = vi.fn(() => new Promise<PinLinkTarget | null>((resolve) => { finish = resolve; }));
    const { onPick } = setup({ createEntries: [noteEntry(create)] });
    type(' Cellar ');
    press('Enter');
    press('Enter');
    press('ArrowDown');
    press('Enter');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('Cellar', container);
    expect(onPick).not.toHaveBeenCalled();
    finish({ path: 'Notes/Cellar.md' });
    await settle();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('Notes/Cellar.md', undefined);
  });

  it('picks nothing when the create is cancelled, and lets the search go on', async () => {
    const { onPick } = setup({ createEntries: [noteEntry(async () => null)] });
    type('Cellar');
    press('Enter');
    await settle();
    expect(onPick).not.toHaveBeenCalled();
    type('Tavern');
    press('Enter');
    expect(onPick).toHaveBeenCalledWith('Tavern.md');
  });

  it('disables the entry for an unusable name, says why, and leaves it out of the keys', () => {
    const create = vi.fn(async () => 'x.md');
    const { onPick } = setup({ createEntries: [noteEntry(create)] });
    type('A: B');
    const item = container.querySelector('.pin-create-item')!;
    expect(item.classList.contains('is-disabled')).toBe(true);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.querySelector('.pin-result-reason')?.textContent).toContain('cannot contain');
    expect(container.querySelector('.pin-empty-state')).toBeNull();
    expect(activeName()).toBeUndefined();
    press('Enter');
    (item as HTMLElement).click();
    expect(create).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    type('.hidden');
    expect(container.querySelector('.pin-result-reason')?.textContent).toContain('dot');
  });
});
