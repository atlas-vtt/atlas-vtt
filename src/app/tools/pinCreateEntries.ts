import type { App } from 'obsidian';
import { t } from '../i18n';
import { INVALID_NAME_CHARACTERS, collectionIdOfPath } from '../services/assetPaths';
import type { StoreApi } from 'zustand';
import { generateDungeonFor } from '../packages/components/dungeon-generator/openDungeonGenerator';
import type { ViewAtlasState } from '../storeFactory';
import { freeNotePath } from '../utils/notePaths';

/**
 * A way to make what a name typed into the note pin search names, offered
 * above the results while no file carries that name.
 */
export interface PinCreateEntry {
  id: string;
  /** The entry's text for the typed name. */
  label: (name: string) => string;
  /** A Lucide icon id. */
  icon: string;
  /** It works over the map: the dropdown is hidden until it is done. */
  away?: boolean;
  /** Why `name` cannot be used, shown under a disabled entry; null where it can. */
  problem?: (name: string) => string | null;
  /** Makes it and returns what the pin links, or null when the GM cancelled; `from` is the dropdown, which an `away` entry works in place of. */
  create: (name: string, from: HTMLElement) => Promise<PinLinkTarget | null>;
}

/** What a new pin links: a vault path, and for a scene of several floors the floor it opens on. */
export interface PinLinkTarget {
  path: string;
  sceneLevel?: string;
}

/** Why `name` cannot name a note, or null when it can. */
export function noteNameProblem(name: string): string | null {
  if (INVALID_NAME_CHARACTERS.test(name)) return t('pin.search.invalidName');
  if (name.startsWith('.')) return t('pin.search.dotName');
  return null;
}

/**
 * Creates an empty note of the typed name in Obsidian's folder for new notes
 * (as seen from the map), numbered when the name is taken there.
 */
export function noteCreateEntry(app: App, mapPath: string | null): PinCreateEntry {
  return {
    id: 'note',
    label: (name) => t('pin.search.createNote', { name }),
    icon: 'file-plus',
    problem: noteNameProblem,
    create: async (name) => {
      const folder = app.fileManager.getNewFileParent(mapPath ?? '');
      const file = await app.vault.create(freeNotePath(app, folder, name), '');
      return { path: file.path };
    },
  };
}

/**
 * Generates a dungeon of the typed name as a scene of the map's own collection (a pin links only
 * scenes of its collection), in the generator that takes the dropdown's place, and links the pin to it. Offered only
 * on a map in a collection.
 */
export function dungeonCreateEntry(store: StoreApi<ViewAtlasState>, mapPath: string | null): PinCreateEntry | null {
  const collectionId = collectionIdOfPath(mapPath);
  if (!collectionId) return null;
  return {
    id: 'dungeon',
    label: (name) => t('pin.search.generateDungeon', { name }),
    icon: 'castle',
    away: true,
    create: async (name, from) => {
      const { left, top, width, height } = from.getBoundingClientRect();
      const scene = await generateDungeonFor(store, { name, collectionId, anchor: { left, top, width, height } });
      return scene ? { path: scene.scenePath, ...(scene.entryLevel && { sceneLevel: scene.entryLevel }) } : null;
    },
  };
}
