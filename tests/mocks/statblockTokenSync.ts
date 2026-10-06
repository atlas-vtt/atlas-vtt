import { EventEmitter } from 'events';
import { vi } from 'vitest';
import { TFile } from 'obsidian';
import type { Character } from '../../src/app/types';
import type { LinkChangeEvent } from '../../src/app/services/TokenStatblockLinkService';
import { createInMemoryApp } from './inMemoryVault';

export function character(overrides: Partial<Character> = {}): Character {
  return { id: 'hero', kind: 'character', x: 10, y: 20, size: 1, imagePath: 'hero.png', layer: 0,
    isHidden: false, rotation: 0, statblockPath: 'Hero.md', name: 'Custom', ...overrides };
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
    getTokenLinkedToStatblock: vi.fn(async (): Promise<string | null> => null),
    getStatblockLinkedToToken: vi.fn(async (): Promise<string | null> => null),
    arePathsEquivalent: vi.fn((left: string, right: string): boolean => left === right),
    linkTokenToStatblock: vi.fn(async (): Promise<boolean> => true),
    unlinkToken: vi.fn(async (): Promise<boolean> => true),
    readStatblockRecord: vi.fn(async (): Promise<Readonly<Record<string, unknown>> | null> => ({ hp: 20, stress: 6 })),
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
