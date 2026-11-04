import { vi } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import type { App, TFile } from 'obsidian';
import type { FantasyStatblocksCreature } from '../../src/app/services/FantasyStatblocksService';
import { createInMemoryApp } from './inMemoryVault';

type Listener = (...data: unknown[]) => unknown;

/** Obsidian's `Events`: `on` returns a ref, `trigger` calls every listener of a name. */
function emitter(): { on: (name: string, cb: Listener) => { name: string; cb: Listener }; offref: (ref: { name: string; cb: Listener }) => void; trigger: (name: string, ...data: unknown[]) => void; count: () => number } {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: (name, cb) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(cb);
      return { name, cb };
    },
    offref: (ref) => { listeners.get(ref.name)?.delete(ref.cb); },
    trigger: (name, ...data) => { for (const cb of listeners.get(name) ?? []) cb(...data); },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

export interface CreatureVault {
  app: App;
  files: Map<string, string>;
  frontmatter: Record<string, Record<string, unknown>>;
  bestiary: FantasyStatblocksCreature[];
  workspace: ReturnType<typeof emitter>;
  metadata: ReturnType<typeof emitter>;
  vault: ReturnType<typeof emitter>;
  getBestiaryCreatures: ReturnType<typeof vi.fn>;
}

/**
 * A vault with statblock notes in frontmatter, in a fence and without one, events that tests
 * trigger, and a Fantasy Statblocks bestiary they fill. Remove `window.FantasyStatblocks` afterwards.
 */
export function creatureVault(): CreatureVault {
  const { app, files } = createInMemoryApp({
    files: {
      'Bestiary/Goblin.md': '---\nstatblock: true\n---',
      'Bestiary/Orc.md': '```statblock\nname: Orc\ncr: 1/2\n```',
      'Notes/Plain.md': 'just a note',
    },
  });
  const frontmatter: Record<string, Record<string, unknown>> = {
    'Bestiary/Goblin.md': { statblock: true, name: 'Goblin', cr: '1/4', layout: 'Basic 5e Layout' },
  };
  const bestiary: FantasyStatblocksCreature[] = [];
  const getBestiaryCreatures = vi.fn(() => bestiary);
  const workspace = emitter();
  const metadata = emitter();
  const vault = emitter();
  Object.assign(app.workspace, { on: workspace.on, offref: workspace.offref });
  Object.assign(app.metadataCache, {
    on: metadata.on,
    offref: metadata.offref,
    getFileCache: (file: TFile) => ({ frontmatter: frontmatter[file.path] }),
  });
  Object.assign(app.vault, { on: vault.on, offref: vault.offref });
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures,
      hasCreature: () => false,
      getCreatureFromBestiary: () => null,
    },
  });
  return { app, files, frontmatter, bestiary, workspace, metadata, vault, getBestiaryCreatures };
}

/** Adds a note whose metadata cache holds `frontmatter`, with that frontmatter written into its text. */
export function addNote(vault: CreatureVault, path: string, frontmatter: Record<string, unknown>, body = ''): void {
  vault.frontmatter[path] = frontmatter;
  vault.files.set(path, `---\n${stringifyYaml(frontmatter)}---\n${body}`);
}

const WRITE_METHODS = {
  vault: ['create', 'createBinary', 'createFolder', 'modify', 'modifyBinary', 'process', 'append', 'rename', 'copy', 'delete', 'trash'],
  adapter: ['write', 'writeBinary', 'append', 'process', 'mkdir', 'remove', 'rename', 'copy', 'rmdir', 'trashSystem', 'trashLocal'],
  fileManager: ['renameFile', 'trashFile', 'processFrontMatter'],
} as const;

/**
 * Makes every write of the vault, its adapter and the file manager throw, so a test proves that
 * viewing only reads. Returns the replaced methods; none of them should have been called.
 */
export function forbidWrites(app: App): ReturnType<typeof vi.fn>[] {
  const refusals: ReturnType<typeof vi.fn>[] = [];
  const targets = { vault: app.vault, adapter: app.vault.adapter, fileManager: app.fileManager } as Record<keyof typeof WRITE_METHODS, Record<string, unknown>>;
  for (const [target, methods] of Object.entries(WRITE_METHODS) as [keyof typeof WRITE_METHODS, readonly string[]][]) {
    for (const method of methods) {
      const refusal = vi.fn(() => { throw new Error(`${target}.${method} writes, but viewing must not write.`); });
      refusals.push(refusal);
      targets[target][method] = refusal;
    }
  }
  return refusals;
}
