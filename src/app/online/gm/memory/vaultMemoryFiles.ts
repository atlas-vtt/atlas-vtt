import { TFile, type App } from 'obsidian';
import { currentMapPath, mapMemoryFiles } from '../../../campaigns/exploredFolders';
import { ensureFolder } from '../../../plugin/vaultFolders';
import { trashVaultItem } from '../../../utils/trashVaultItem';
import { CANVAS_MEMORY_IMAGES } from './canvasMemoryImages.ts';
import { KeptMemories, type MemoryFiles } from './KeptMemories.ts';
import type { MemoryPng } from './memoryPorts.ts';

/** The bytes as a buffer of their own, which Obsidian writes whole. */
const ownBuffer = (png: MemoryPng): ArrayBuffer => (png.byteOffset === 0 && png.byteLength === png.buffer.byteLength ? png.buffer : png.slice().buffer);

/** The memory file at `path`; null where there is none or it cannot be read. */
export async function readMemoryFile(app: App, path: string): Promise<MemoryPng | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  try {
    return new Uint8Array(await app.vault.readBinary(file));
  } catch {
    return null;
  }
}

/** Writes the memory file at `path`, making its folder where it has none. */
export async function writeMemoryFile(app: App, path: string, png: MemoryPng): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return app.vault.modifyBinary(file, ownBuffer(png));
  await ensureFolder(app, path.slice(0, path.lastIndexOf('/')));
  await app.vault.createBinary(path, ownBuffer(png));
}

/** Trashes the memory file at `path`, where there is one. */
export async function removeMemoryFile(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) await trashVaultItem(app, file);
}

/** Players' memory files in every campaign's folder (`mapMemoryFiles`). */
function vaultMemoryFiles(app: App): MemoryFiles {
  return {
    list: (mapPath, level) => Promise.resolve(mapMemoryFiles(app, currentMapPath(app, mapPath), level).map((file) => file.path)),
    read: (path) => readMemoryFile(app, path),
    write: (path, png) => writeMemoryFile(app, path, png),
    remove: (path) => removeMemoryFile(app, path),
  };
}

const kept = new WeakMap<App, KeptMemories>();

/** What the GM's edits by hand do to every player's memory in this vault, and the memories running tables hold of it. */
export function keptMemoriesOf(app: App): KeptMemories {
  let memories = kept.get(app);
  if (memories === undefined) {
    memories = new KeptMemories(vaultMemoryFiles(app), CANVAS_MEMORY_IMAGES);
    kept.set(app, memories);
  }
  return memories;
}
