import { vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../../../src/app/statblocks/library/sessionRegistry';
import { createBlock } from '../../../../src/app/statblocks/model/blockCatalogue';
import { blockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { insertBlock, updateBlock } from '../../../../src/app/statblocks/model/treeOps';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { MARSH_ID, MARSH_PATH, marshText } from './templateTexts';

type Listener = (...data: unknown[]) => unknown;
interface Ref { name: string; cb: Listener }

/** Obsidian's `Events`: `on` returns a ref, `trigger` calls every listener of a name. */
function emitter(): { on: (name: string, cb: Listener) => Ref; offref: (ref: Ref) => void; trigger: (name: string, ...data: unknown[]) => void } {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: (name, cb) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(cb);
      return { name, cb };
    },
    offref: (ref) => { listeners.get(ref.name)?.delete(ref.cb); },
    trigger: (name, ...data) => { for (const cb of [...(listeners.get(name) ?? [])]) cb(...data); },
  };
}

export interface SessionVault {
  app: App;
  /** The workspace's events: `quit`, `window-close`. */
  workspace: ReturnType<typeof emitter>;
  files: Map<string, string>;
  /** What the metadata cache holds per note. */
  frontmatter: Record<string, Record<string, unknown>>;
  /** Someone else writes the file (sync, git, a hand edit): Obsidian reports it as a modify. */
  writeExternally(path: string, text: string): void;
  deleteExternally(path: string): void;
  /** Resolves once the library has read every file it was told about. */
  settled(): Promise<void>;
}

/**
 * A vault whose writes raise Obsidian's events, as the real one does: `process`
 * and `create` report a modify or create, the file manager a rename or delete.
 * Seeded with the Marsh creature template unless `files` says otherwise.
 */
export function sessionVault(files: Record<string, string> = { [MARSH_PATH]: marshText() }): SessionVault {
  const memory = createInMemoryApp({ files });
  const { app } = memory;
  const events = emitter();
  const workspace = emitter();
  Object.assign(app.workspace, { on: workspace.on, offref: workspace.offref });
  const frontmatter: Record<string, Record<string, unknown>> = {};
  const vault = app.vault as Record<string, ReturnType<typeof vi.fn>>;
  const process = vault.process!.getMockImplementation()!;
  const create = vault.create!.getMockImplementation()!;
  const renameFile = (app.fileManager as Record<string, ReturnType<typeof vi.fn>>).renameFile!.getMockImplementation()!;
  const trashFile = (app.fileManager as Record<string, ReturnType<typeof vi.fn>>).trashFile!.getMockImplementation()!;

  Object.assign(app.vault, {
    on: events.on,
    offref: events.offref,
    getMarkdownFiles: vi.fn(() => [...memory.files.keys()].filter((path) => path.endsWith('.md')).map((path) => new TFile(path))),
    process: vi.fn(async (file: TFile, fn: (data: string) => string) => {
      const before = memory.files.get(file.path);
      await process(file, fn);
      const after = memory.files.get(file.path) ?? '';
      if (after !== before) events.trigger('modify', new TFile(file.path));
      return after;
    }),
    create: vi.fn(async (path: string, text: string) => {
      await create(path, text);
      const file = new TFile(path);
      events.trigger('create', file);
      return file;
    }),
  });
  Object.assign(app.fileManager, {
    renameFile: vi.fn(async (file: TFile, path: string) => {
      const oldPath = file.path;
      await renameFile(file, path);
      events.trigger('rename', new TFile(path), oldPath);
    }),
    trashFile: vi.fn(async (file: TFile) => {
      await trashFile(file);
      events.trigger('delete', new TFile(file.path));
    }),
  });
  Object.assign(app.metadataCache, { getFileCache: (file: TFile) => ({ frontmatter: frontmatter[file.path] }) });

  return {
    app,
    workspace,
    files: memory.files,
    frontmatter,
    writeExternally: (path, text) => {
      const existed = memory.files.has(path);
      memory.files.set(path, text);
      events.trigger(existed ? 'modify' : 'create', new TFile(path));
    },
    deleteExternally: (path) => {
      memory.files.delete(path);
      events.trigger('delete', new TFile(path));
    },
    settled: async () => {
      const library = TemplateLibrary.forApp(app);
      await vi.waitFor(() => {
        if (library.isLoading()) throw new Error('The library is still reading.');
      });
      // A read the vault's events started ends within a few turns: the read, the slice pause, the commit.
      for (let turn = 0; turn < 5; turn++) {
        if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
        else await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
    },
  };
}

/** Lets every session of the app go and the library with them. */
export async function closeSessionVault(vault: SessionVault): Promise<void> {
  await releaseTemplateSessions(vault.app);
  TemplateLibrary.release(vault.app);
}

/** Opens a session once the library has read the vault, and notes it for release after the test. */
export async function openSession(vault: SessionVault, opened: TemplateSession[], id = MARSH_ID): Promise<TemplateSession> {
  await vault.settled();
  const session = TemplateSession.open(vault.app, id);
  if (!session) throw new Error(`No session for ${id}`);
  opened.push(session);
  return session;
}

/** A divider inserted at the top, as the canvas does it. */
export const insertDivider = (template: StatblockTemplate): StatblockTemplate => {
  const block = createBlock('divider', blockIdSource([], () => 0.5));
  return { ...template, layout: insertBlock(template.layout, block, { parentId: null, index: 0 }).layout };
};

/** The Marsh creature's Actions heading set to `text`, as typing a label does it. */
export const heading = (text: string) => (template: StatblockTemplate): StatblockTemplate =>
  ({ ...template, layout: updateBlock(template.layout, 'e7y2b6gh', 'entries', { heading: text }).layout });

export const described = (description: string) => (template: StatblockTemplate): StatblockTemplate => ({ ...template, description });
