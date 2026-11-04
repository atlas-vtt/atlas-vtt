import { vi } from 'vitest';
import { App, TFile, TFolder, type TAbstractFile } from 'obsidian';

export interface InMemoryVaultSeed {
  /** Vault-relative path → text content. */
  files?: Record<string, string>;
  folders?: string[];
}

export interface InMemoryApp {
  app: App;
  files: Map<string, string>;
  folders: Set<string>;
  /** What `app.saveLocalStorage` stored: per device, never synced. */
  localStorage: Map<string, unknown>;
  /** Calls the vault event handlers registered for `name`, as Obsidian does when a file changes. */
  emit(name: string, ...args: unknown[]): void;
}

const ALREADY_EXISTS = 'File already exists.';

/** Minimal `key: value` frontmatter, enough for the statblock fields the services read. */
export function parseFrontmatter(content: string): Record<string, unknown> | undefined {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return undefined;
  const frontmatter: Record<string, unknown> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) frontmatter[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^"|"$/g, '');
  }
  return frontmatter;
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** Obsidian does not index dot-folders, so they are only reachable through the adapter. */
const isHiddenPath = (path: string): boolean => path.split('/').some((segment) => segment.startsWith('.'));

/**
 * An Obsidian `App` backed by an in-memory file map. Covers the vault, adapter,
 * file manager and metadata cache calls the services under test make; every
 * method is a spy so tests can assert on it.
 */
export function createInMemoryApp(seed: InMemoryVaultSeed = {}): InMemoryApp {
  const files = new Map<string, string>(Object.entries(seed.files ?? {}));
  const folders = new Set<string>(['atlas-vtt', ...(seed.folders ?? [])]);

  const addParentFolders = (path: string): void => {
    for (let parent = parentOf(path); parent; parent = parentOf(parent)) {
      folders.add(parent);
    }
  };
  const assertFree = (path: string): void => {
    if (files.has(path) || folders.has(path)) throw new Error(ALREADY_EXISTS);
  };
  /** A modification time per file that every write moves on, as a disk's would. */
  const mtimes = new Map<string, number>();
  let clock = 0;
  const touch = (path: string): void => { mtimes.set(path, ++clock); };
  const setFile = (path: string, content: string): void => {
    files.set(path, content);
    touch(path);
  };
  const writeFile = (path: string, content: string): void => {
    addParentFolders(path);
    setFile(path, content);
  };
  /** A file handle with the stat Obsidian keeps: size and modification time. */
  const fileAt = (path: string): TFile => {
    const file = new TFile(path);
    file.stat = { ctime: 0, mtime: mtimes.get(path) ?? 0, size: (files.get(path) ?? '').length };
    return file;
  };
  const moveFile = async (file: TAbstractFile, newPath: string): Promise<void> => move(file.path, newPath);

  for (const path of files.keys()) {
    addParentFolders(path);
    touch(path);
  }
  /** A folder handle whose `children` list what lies directly inside it, as Obsidian's does. */
  const folderAt = (path: string): TFolder => {
    const folder = new TFolder(path);
    const inside = (candidate: string): boolean => parentOf(candidate) === path;
    folder.children = [
      ...[...folders].filter(inside).map(folderAt),
      ...[...files.keys()].filter(inside).map(fileAt),
    ];
    return folder;
  };
  /** Deletes a file, or a folder with everything inside it. */
  const removeWithin = (target: string): void => {
    const within = (path: string): boolean => path === target || path.startsWith(`${target}/`);
    for (const path of [...files.keys()].filter(within)) files.delete(path);
    for (const path of [...folders].filter(within)) folders.delete(path);
  };
  /** Moves a file, or a folder with everything inside it. */
  const move = (from: string, to: string): void => {
    assertFree(to);
    const moved = (path: string): string => to + path.slice(from.length);
    const within = (path: string): boolean => path === from || path.startsWith(`${from}/`);
    for (const path of [...files.keys()].filter(within)) {
      addParentFolders(moved(path));
      files.set(moved(path), files.get(path) ?? '');
      mtimes.set(moved(path), mtimes.get(path) ?? ++clock);
      files.delete(path);
    }
    for (const path of [...folders].filter(within)) {
      folders.delete(path);
      folders.add(moved(path));
    }
    addParentFolders(to);
  };

  const app = new App();
  const localStorage = new Map<string, unknown>();
  Object.assign(app, {
    loadLocalStorage: vi.fn((key: string) => localStorage.get(key) ?? null),
    // As Obsidian does: any falsy value (`false`, `0`, `''`, null) clears the key instead of storing it
    saveLocalStorage: vi.fn((key: string, value: unknown) => {
      if (!value) localStorage.delete(key);
      else localStorage.set(key, value);
    }),
  });
  const handlers = new Set<{ name: string; callback: (...args: unknown[]) => void }>();

  app.vault = {
    adapter: {
      exists: vi.fn(async (path: string) => files.has(path) || folders.has(path)),
      mkdir: vi.fn(async (path: string) => {
        assertFree(path);
        addParentFolders(path);
        folders.add(path);
      }),
      write: vi.fn(async (path: string, content: string) => writeFile(path, content)),
      read: vi.fn(async (path: string) => files.get(path) ?? ''),
      writeBinary: vi.fn(async (path: string, content: ArrayBuffer) => writeFile(path, new TextDecoder().decode(content))),
      readBinary: vi.fn(async (path: string) => new TextEncoder().encode(files.get(path) ?? '').buffer),
      remove: vi.fn(async (path: string) => { files.delete(path); }),
      list: vi.fn(async (path: string) => ({
        files: [...files.keys()].filter((candidate) => parentOf(candidate) === path),
        folders: [...folders].filter((candidate) => parentOf(candidate) === path),
      })),
      rename: vi.fn(async (from: string, to: string) => move(from, to)),
      copy: vi.fn(async (from: string, to: string) => writeFile(to, files.get(from) ?? '')),
      // As Obsidian's desktop adapter: `fs.rm`, which refuses any folder unless recursive.
      rmdir: vi.fn(async (path: string, recursive: boolean) => {
        if (!recursive) throw new Error(`EISDIR: rm refuses a folder without recursive: ${path}`);
        removeWithin(path);
      }),
      trashSystem: vi.fn(async (path: string) => { removeWithin(path); return true; }),
      trashLocal: vi.fn(async (path: string) => removeWithin(path)),
      getResourcePath: vi.fn((path: string) => `app://local/${path}`),
      stat: vi.fn(async (path: string) => {
        if (files.has(path)) return { type: 'file', size: (files.get(path) ?? '').length, ctime: 0, mtime: 0 };
        return folders.has(path) ? { type: 'folder', size: 0, ctime: 0, mtime: 0 } : null;
      }),
    },
    on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
      const ref = { name, callback };
      handlers.add(ref);
      return ref;
    }),
    offref: vi.fn((ref: { name: string; callback: (...args: unknown[]) => void }) => { handlers.delete(ref); }),
    getFiles: vi.fn(() => Array.from(files.keys()).filter((path) => !isHiddenPath(path)).map(fileAt)),
    getMarkdownFiles: vi.fn(() => Array.from(files.keys()).filter((path) => path.endsWith('.md') && !isHiddenPath(path)).map(fileAt)),
    getAbstractFileByPath: vi.fn((path: string): TAbstractFile | null => {
      if (isHiddenPath(path)) return null;
      if (files.has(path)) return fileAt(path);
      if (folders.has(path)) return folderAt(path);
      return null;
    }),
    getFileByPath: vi.fn((path: string): TFile | null => (files.has(path) && !isHiddenPath(path) ? fileAt(path) : null)),
    getFolderByPath: vi.fn((path: string): TFolder | null => (folders.has(path) && !isHiddenPath(path) ? folderAt(path) : null)),
    getAllFolders: vi.fn((includeRoot = false): TFolder[] => [
      ...(includeRoot ? [new TFolder('/')] : []),
      ...[...folders].filter((path) => !isHiddenPath(path)).map(folderAt),
    ]),
    rename: vi.fn(moveFile),
    createFolder: vi.fn(async (path: string) => {
      assertFree(path);
      folders.add(path);
    }),
    create: vi.fn(async (path: string, content: string) => {
      assertFree(path);
      writeFile(path, content);
      return fileAt(path);
    }),
    process: vi.fn(async (file: TFile, fn: (data: string) => string) => {
      const content = fn(files.get(file.path) ?? '');
      setFile(file.path, content);
      return content;
    }),
    read: vi.fn(async (file: TFile) => files.get(file.path) ?? ''),
    cachedRead: vi.fn(async (file: TFile) => files.get(file.path) ?? ''),
    getResourcePath: vi.fn((file: TFile) => `app://vault/${file.path}`),
    readBinary: vi.fn(async (file: TFile) => new TextEncoder().encode(files.get(file.path) ?? '').buffer),
    createBinary: vi.fn(async (path: string, content: ArrayBuffer) => {
      assertFree(path);
      writeFile(path, new TextDecoder().decode(content));
      return fileAt(path);
    }),
    modifyBinary: vi.fn(async (file: TFile, content: ArrayBuffer) => {
      setFile(file.path, new TextDecoder().decode(content));
    }),
  };

  app.fileManager = {
    renameFile: vi.fn(moveFile),
    trashFile: vi.fn(async (file: TAbstractFile) => removeWithin(file.path)),
    processFrontMatter: vi.fn(async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void) => {
      const content = files.get(file.path) ?? '';
      const frontmatter = parseFrontmatter(content) ?? {};
      fn(frontmatter);
      const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${String(value)}`).join('\n');
      setFile(file.path, `---\n${yaml}\n---\n${body}`);
    }),
  };

  app.workspace = {
    layoutReady: true,
    onLayoutReady: vi.fn((callback: () => void) => callback()),
    getLeavesOfType: vi.fn(() => []),
    iterateAllLeaves: vi.fn(),
    on: vi.fn(() => ({})),
    offref: vi.fn(),
    trigger: vi.fn(),
  };

  const linkDestination = (linkpath: string): string | undefined =>
    [...files.keys()].find((candidate) => candidate === linkpath || candidate.endsWith(`/${linkpath}`));

  app.metadataCache = {
    on: vi.fn(() => ({})),
    offref: vi.fn(),
    getFileCache: vi.fn(() => null),
    getFirstLinkpathDest: vi.fn((linkpath: string): TFile | null => {
      const path = linkDestination(linkpath);
      return path ? new TFile(path) : null;
    }),
    /** The wikilinks of every note, resolved as Obsidian does: by name or by the end of the path. */
    get resolvedLinks(): Record<string, Record<string, number>> {
      const links: Record<string, Record<string, number>> = {};
      for (const [path, text] of files) {
        if (!path.endsWith('.md')) continue;
        for (const [, link = ''] of text.matchAll(/\[\[([^\]|#]+)/g)) {
          const target = linkDestination(link) ?? linkDestination(`${link}.md`);
          if (!target) continue;
          const targets = (links[path] ??= {});
          targets[target] = (targets[target] ?? 0) + 1;
        }
      }
      return links;
    },
  };

  const emit = (name: string, ...args: unknown[]): void => {
    for (const handler of [...handlers]) if (handler.name === name) handler.callback(...args);
  };
  return { app, files, folders, localStorage, emit };
}

type VaultWrite = (path: string, content: unknown) => Promise<unknown>;

/**
 * Lets `before` see every call to a write method of the in-memory vault (`create`,
 * `createBinary`, the adapter's `write`) before it runs; `before` may throw to fail the write.
 * Returns a function that lets the writes through untouched again.
 */
export function interceptWrites(target: object, method: string, before: (path: string, content: unknown) => void): () => void {
  const mock = vi.spyOn(target as Record<string, VaultWrite>, method);
  const original = mock.getMockImplementation()!;
  mock.mockImplementation(async (path, content) => {
    before(path, content);
    return original(path, content);
  });
  return () => { mock.mockImplementation(original); };
}
