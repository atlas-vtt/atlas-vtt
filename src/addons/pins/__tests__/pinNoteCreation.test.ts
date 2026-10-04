import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { createPinNoteSearch } from 'src/app/tools/pinNoteSearch';

let container: HTMLElement;

/** The Obsidian mock's TFile takes its path. */
const fileAt = (path: string): TFile => new (TFile as unknown as new (path: string) => TFile)(path);

interface SetupOptions {
  headings?: Record<string, string[]>;
  paths?: string[];
  mapPath?: string | null;
}

function setup({ headings = {}, paths = ['Tavern.md', 'Temple.md', 'Town.atlasmap'], mapPath = null }: SetupOptions = {}): { onPick: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } {
  const files = paths.map(fileAt);
  const create = vi.fn((path: string) => Promise.resolve(fileAt(path)));
  const createFolder = vi.fn(() => Promise.resolve());
  const app = {
    vault: { getAllLoadedFiles: () => files, create, createFolder, getAbstractFileByPath: () => null },
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
  return { onPick, onCancel, create };
}

const input = (): HTMLInputElement => container.querySelector<HTMLInputElement>('.pin-search-input')!;
const activeName = (): string | null | undefined =>
  container.querySelector('.pin-result-item.is-active .pin-result-name')?.textContent;
const press = (key: string): void => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};
const type = (value: string): void => {
  input().value = value;
  input().dispatchEvent(new Event('input'));
};

describe('pins add-on: creating pin notes', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => container.remove());
  it('offers to create a note for a new name and links the pin to it', async () => {
    const { onPick, create } = setup();
    type('Goblin Cave');
    expect(activeName()).toBe('Create note "Goblin Cave"');
    press('Enter');
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('atlas-vtt/collections/Default/notes/Goblin Cave.md'));
    expect(create).toHaveBeenCalledWith('atlas-vtt/collections/Default/notes/Goblin Cave.md', '');
  });

  it('lists matching notes before the create entry and hides it for an existing name', () => {
    setup();
    type('Tav');
    expect(activeName()).toBe('Tavern');
    expect(container.querySelector('.pin-create-item')).not.toBeNull();
    type('tavern');
    expect(container.querySelector('.pin-create-item')).toBeNull();
  });
});

describe('pin notes folder setting', () => {
  it('defaults to the Default collection notes folder and cleans a typed path', async () => {
    const { readPinSettings } = await import('../pinSettings');
    expect(readPinSettings(undefined).notesFolder).toBe('atlas-vtt/collections/Default/notes');
    expect(readPinSettings({ notesFolder: ' World/Notes/ ' }).notesFolder).toBe('World/Notes');
    expect(readPinSettings({ notesFolder: '' }).notesFolder).toBe('atlas-vtt/collections/Default/notes');
  });
});
