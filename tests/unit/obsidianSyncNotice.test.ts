import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { holdsOwnLibrary, syncLeavesOutLibraryFiles } from '../../src/app/plugin/obsidianSyncNotice';
import type { Asset, CollectionMetadata } from '../../src/app/services/AssetService';

/** Obsidian 1.15's filter for the file types that matter here: images pass, the rest only with "all other types" on. */
const syncWith = (otherTypes: boolean, overrides: Record<string, unknown> = {}): App => ({
  internalPlugins: {
    getEnabledPluginById: () => ({
      dataLoaded: true,
      vaultId: 'remote-vault',
      filter: { allowSyncFile: () => otherTypes },
      ...overrides,
    }),
  },
} as unknown as App);

describe('syncLeavesOutLibraryFiles', () => {
  it('is true only when Sync is set up, its settings are read and its filter refuses the files', () => {
    expect(syncLeavesOutLibraryFiles(syncWith(false))).toBe(true);
    expect(syncLeavesOutLibraryFiles(syncWith(true))).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { dataLoaded: false }))).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { vaultId: null }))).toBe(false);
  });

  it('asks about the file types, not a folder the GM may have excluded', () => {
    const asked: string[] = [];
    const filter = { allowSyncFile: (path: string): boolean => { asked.push(path); return true; } };
    syncLeavesOutLibraryFiles(syncWith(true, { filter }));
    expect(asked.some((path) => path.endsWith('.atlasmap'))).toBe(true);
    expect(asked.some((path) => path.endsWith('.json'))).toBe(true);
    expect(asked.every((path) => !path.startsWith('atlas-vtt/'))).toBe(true);
  });

  it('reads anything it does not know as no and never throws', () => {
    const answers: Array<Partial<App>> = [
      {},
      { internalPlugins: {} },
      { internalPlugins: { getEnabledPluginById: () => null } },
      { internalPlugins: { getEnabledPluginById: () => { throw new Error('changed'); } } },
    ];
    for (const app of answers) expect(syncLeavesOutLibraryFiles(app as App)).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { filter: undefined }))).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { filter: { allowSyncFile: 'renamed' } }))).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { filter: { allowSyncFile: () => undefined } }))).toBe(false);
    expect(syncLeavesOutLibraryFiles(syncWith(false, { filter: { allowSyncFile: () => { throw new Error('changed'); } } }))).toBe(false);
  });
});

describe('holdsOwnLibrary', () => {
  const collection = { id: 'Default' } as CollectionMetadata;
  const starter = { id: 'token-starter-wizard' } as Asset;

  it('leaves out what every vault starts with', () => {
    expect(holdsOwnLibrary([starter], [collection])).toBe(false);
  });

  it('counts a scene, and a collection folder that arrived without its scenes', () => {
    expect(holdsOwnLibrary([starter, { id: 'scene-1' } as Asset], [collection])).toBe(true);
    expect(holdsOwnLibrary([starter], [collection, { id: 'Curse of the Crypt' } as CollectionMetadata])).toBe(true);
  });
});
