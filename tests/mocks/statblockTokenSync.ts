import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { TFile } from 'obsidian';
import type { Character } from '../../src/app/types';
import type { LinkChangeEvent } from '../../src/app/services/TokenStatblockLinkService';
import type { TokenAsset } from '../../src/app/services/AssetService';
import { createInMemoryApp } from './inMemoryVault';

export function character(overrides: Partial<Character> = {}): Character {
  return { id: 'hero', kind: 'character', x: 10, y: 20, size: 1, imagePath: 'hero.png', layer: 0,
    isHidden: false, rotation: 0, statblockPath: 'Hero.md', name: 'Custom', ...overrides };
}

export function tokenAsset(overrides: Partial<TokenAsset> = {}): TokenAsset {
  return { id: 'asset', name: 'Hero', type: 'token', imagePath: 'new.png', collection: 'Default', tags: [], createdAt: 0, modifiedAt: 0, ...overrides };
}

export function statblockFixture(): ReturnType<typeof makeFixture> {
  return makeFixture();
}

function makeFixture() {
  const { app, files } = createInMemoryApp({ files: { 'Hero.md': '---\nname: Hero\nhp: 20\n---\n' } });
  const file = app.vault.getAbstractFileByPath('Hero.md');
  if (!(file instanceof TFile)) throw new Error('Missing fixture note');
  const events = new EventEmitter();
  const links = Object.assign(events, {
    readStatblockImage: vi.fn((): string | null => null),
    findAssetByAnyPath: vi.fn(async (): Promise<TokenAsset | null> => null),
    getStatblockLinkedToToken: vi.fn(async (): Promise<string | null> => null),
    linkTokenToStatblock: vi.fn(async (): Promise<boolean> => true),
    // What the statblock resolver reads from the note: its fields, as the note's frontmatter holds them.
    readStatblockRecord: vi.fn(async (): Promise<{ fields: Readonly<Record<string, unknown>> } | null> => ({
      fields: { name: 'Hero', hp: 20, stress: 6, difficulty: 15 },
    })),
  });
  const ref = app.metadataCache.on('changed', () => {});
  let changed: (file: TFile) => Promise<void> = async () => {};
  vi.spyOn(app.metadataCache, 'on').mockImplementation((_name, callback) => {
    changed = callback;
    return ref;
  });
  vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue({ frontmatter: { hp: 20, name: 'Hero', difficulty: 15 } });
  return {
    app, files, links, ref,
    change: (): Promise<void> => changed(file),
    link: (event: LinkChangeEvent): void => { events.emit('link-changed', event); },
  };
}
