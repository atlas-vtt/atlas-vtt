import { vi } from 'vitest';
import { getFrontMatterInfo, stringifyYaml, TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { parse } from 'yaml';
import { createInMemoryApp, type InMemoryApp } from './inMemoryVault';

export interface QuestVault extends InMemoryApp {
  app: App;
  /** Writes a note as an editor or a sync tool would, and lets the metadata cache tell of it. */
  write(path: string, content: string): void;
  /** Moves a note or a folder, as Obsidian does, telling the vault's listeners. */
  move(from: string, to: string): Promise<void>;
  /** Deletes a note, telling the vault's and the metadata cache's listeners. */
  remove(path: string): void;
  /** Lets the metadata cache say every note was read. */
  resolve(): void;
}

/** A note's frontmatter read as Obsidian's metadata cache reads it; undefined without one. */
function frontmatterOf(content: string): Record<string, unknown> | undefined {
  const info = getFrontMatterInfo(content);
  if (!info.exists) return undefined;
  const parsed: unknown = parse(info.frontmatter);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

const isWithin = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

/** Gives a file handle the path it moved to, as Obsidian changes its handles in place. */
function moveHandle(file: TFile, path: string): void {
  const name = path.slice(path.lastIndexOf('/') + 1);
  file.path = path;
  file.name = name;
  file.basename = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
}

/**
 * An in-memory vault whose metadata cache reads frontmatter as YAML and tells its listeners of
 * every change, and whose `processFrontMatter` writes YAML as Obsidian's does. A note keeps one
 * handle that follows it when it or its folder moves, as in Obsidian. `created` gives notes their
 * creation time (the vault's `ctime`), oldest first by default in path order.
 */
export function questVault(files: Record<string, string>, created: Record<string, number> = {}): QuestVault {
  const vault = createInMemoryApp({ files });
  const { app } = vault;
  const handlers = new Set<{ name: string; callback: (...args: unknown[]) => void }>();
  const emitCache = (name: string, ...args: unknown[]): void => {
    for (const handler of [...handlers]) if (handler.name === name) handler.callback(...args);
  };
  let clock = 1000;
  const ctimes = new Map<string, number>(Object.entries(created));
  for (const path of Object.keys(files)) if (!ctimes.has(path)) ctimes.set(path, clock++);
  /** Every write moves a note's modification time on, as a disk's would. */
  const mtimes = new Map<string, number>();
  const handles = new Map<string, TFile>();
  const handleOf = (path: string): TFile => {
    let file = handles.get(path);
    if (file === undefined) {
      file = new TFile(path);
      handles.set(path, file);
    }
    file.stat = { ...file.stat, ctime: ctimes.get(path) ?? 0, mtime: mtimes.get(path) ?? 0 };
    return file;
  };
  const dated = <T extends TAbstractFile | null>(file: T): T => (file instanceof TFile ? (handleOf(file.path) as T) : file);

  const getMarkdownFiles = app.vault.getMarkdownFiles as () => TFile[];
  const getAbstractFileByPath = app.vault.getAbstractFileByPath as (path: string) => TAbstractFile | null;
  const getFileByPath = app.vault.getFileByPath as (path: string) => TFile | null;
  app.vault.getMarkdownFiles = vi.fn(() => getMarkdownFiles().map(dated));
  app.vault.getAbstractFileByPath = vi.fn((path: string) => dated(getAbstractFileByPath(path)));
  app.vault.getFileByPath = vi.fn((path: string) => dated(getFileByPath(path)));
  const create = app.vault.create as (path: string, content: string) => Promise<TFile>;
  app.vault.create = vi.fn(async (path: string, content: string) => {
    ctimes.set(path, clock++);
    const file = dated(await create(path, content));
    emitCache('changed', file);
    return file;
  });

  /** Moves a note or folder as Obsidian does: the handles follow, then the vault tells of it. */
  const baseRename = app.fileManager.renameFile as (file: TAbstractFile, to: string) => Promise<void>;
  const rename = async (file: TAbstractFile, to: string): Promise<void> => {
    const from = file.path;
    await baseRename(file, to);
    for (const [path, handle] of [...handles]) {
      if (!isWithin(path, from)) continue;
      const now = to + path.slice(from.length);
      for (const times of [ctimes, mtimes]) if (times.has(path)) times.set(now, times.get(path) ?? 0);
      handles.delete(path);
      handles.set(now, handle);
      moveHandle(handle, now);
    }
    const moved = file instanceof TFile ? handleOf(to) : new TFolder(to);
    vault.emit('rename', moved, from);
  };
  app.fileManager.renameFile = vi.fn(rename);
  app.vault.rename = vi.fn(rename);

  app.metadataCache.on = vi.fn((name: string, callback: (...args: unknown[]) => void) => {
    const ref = { name, callback };
    handlers.add(ref);
    return ref;
  });
  app.metadataCache.offref = vi.fn((ref: { name: string; callback: (...args: unknown[]) => void }) => { handlers.delete(ref); });
  app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const content = vault.files.get(file.path);
    if (content === undefined) return null;
    const frontmatter = frontmatterOf(content);
    return frontmatter === undefined ? {} : { frontmatter };
  });

  const write = (path: string, content: string): void => {
    if (!ctimes.has(path)) ctimes.set(path, clock);
    mtimes.set(path, clock++);
    vault.files.set(path, content);
    emitCache('changed', handleOf(path));
  };

  app.fileManager.processFrontMatter = vi.fn(async (file: TFile, change: (frontmatter: Record<string, unknown>) => void) => {
    const content = vault.files.get(file.path) ?? '';
    const info = getFrontMatterInfo(content);
    const frontmatter = frontmatterOf(content) ?? {};
    change(frontmatter);
    const body = content.slice(info.contentStart);
    write(file.path, `---\n${stringifyYaml(frontmatter)}---\n${body}`);
  });

  return {
    ...vault,
    app,
    write,
    move: async (from, to) => {
      const file = getAbstractFileByPath(from);
      if (file !== null) await rename(dated(file), to);
    },
    remove: (path) => {
      const file = handleOf(path);
      vault.files.delete(path);
      handles.delete(path);
      vault.emit('delete', file);
      emitCache('deleted', file);
    },
    resolve: () => emitCache('resolved'),
  };
}
