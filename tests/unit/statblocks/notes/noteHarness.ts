/**
 * A vault with a workspace for the note writer and source: leaves that hold Markdown views in
 * editing or Reading mode, deferred leaves, event buses for the workspace, vault and metadata
 * cache, and editors whose transactions report `editor-change` synchronously, as Obsidian's do
 * (spike S2). A Reading view's editor is a hidden buffer that its view never reads.
 */

import { vi } from 'vitest';
import { MarkdownView, TFile, TFolder, WorkspaceLeaf, type EditorPosition, type EditorTransaction } from 'obsidian';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { createInMemoryApp, type InMemoryApp } from '../../../mocks/inMemoryVault';

type Callback = (...args: unknown[]) => unknown;
interface Ref { name: string; callback: Callback }

/** Obsidian's `Events`: `on` returns a ref, `offref` drops it, `trigger` calls in order. */
export class Bus {
  private refs: Ref[] = [];
  on = (name: string, callback: Callback): Ref => {
    const ref = { name, callback };
    this.refs.push(ref);
    return ref;
  };
  offref = (ref: unknown): void => { this.refs = this.refs.filter((candidate) => candidate !== ref); };
  trigger = (name: string, ...args: unknown[]): void => {
    for (const ref of [...this.refs]) if (ref.name === name) ref.callback(...args);
  };
  count(name: string): number {
    return this.refs.filter((ref) => ref.name === name).length;
  }
}

export class FakeEditor {
  private past: string[] = [];
  private future: string[] = [];
  readonly transactions: Array<{ tx: EditorTransaction; origin: string | undefined }> = [];

  constructor(public text: string, private readonly changed: () => void) {}

  getValue(): string { return this.text; }

  offsetToPos(offset: number): EditorPosition {
    const before = this.text.slice(0, offset).split('\n');
    return { line: before.length - 1, ch: before[before.length - 1]!.length };
  }

  posToOffset(pos: EditorPosition): number {
    const lines = this.text.split('\n');
    return lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
  }

  transaction(tx: EditorTransaction, origin?: string): void {
    this.transactions.push({ tx, origin });
    let next = this.text;
    for (const change of [...(tx.changes ?? [])].reverse()) {
      const from = this.posToOffset(change.from);
      const to = change.to ? this.posToOffset(change.to) : from;
      next = next.slice(0, from) + change.text + next.slice(to);
    }
    this.replace(next);
  }

  /** Typing by the user: not saved until the view saves. */
  type(next: string): void { this.replace(next); }

  undo(): void {
    const previous = this.past.pop();
    if (previous === undefined) return;
    this.future.push(this.text);
    this.text = previous;
    this.changed();
  }

  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.text);
    this.text = next;
    this.changed();
  }

  private replace(next: string): void {
    this.past.push(this.text);
    this.future = [];
    this.text = next;
    this.changed();
  }
}

export class TestMarkdownView extends MarkdownView {
  declare file: TFile | null;
  editor: FakeEditor;
  /** What Reading view shows: the note as last loaded or written to disk. */
  data: string;
  save = vi.fn(async (): Promise<void> => { if (this.file && this.getMode() === 'source') this.saveTo(this.file.path, this.editor.getValue()); });

  constructor(leaf: WorkspaceLeaf, path: string, text: string, private readonly saveTo: (path: string, text: string) => void, workspace: Bus) {
    super(leaf);
    this.file = new TFile(path);
    this.data = text;
    this.editor = new FakeEditor(text, () => workspace.trigger('editor-change', this.editor, this));
  }

  getViewData(): string {
    return this.getMode() === 'source' ? this.editor.getValue() : this.data;
  }
}

export interface NoteHarness extends InMemoryApp {
  workspace: Bus;
  vaultEvents: Bus;
  cacheEvents: Bus;
  leaves: WorkspaceLeaf[];
  open(path: string, mode?: 'source' | 'preview', withStatblock?: boolean): TestMarkdownView;
  /** A background tab after a reload: listed as `markdown`, but no `MarkdownView` yet. */
  defer(path: string): WorkspaceLeaf;
  close(view: TestMarkdownView): void;
}

export function noteHarness(files: Record<string, string>): NoteHarness {
  const vault = createInMemoryApp({ files });
  const { app } = vault;
  const workspace = new Bus();
  const vaultEvents = new Bus();
  const cacheEvents = new Bus();
  const leaves: WorkspaceLeaf[] = [];

  const diskChanged = (path: string): void => {
    const text = vault.files.get(path) ?? '';
    const file = new TFile(path);
    vaultEvents.trigger('modify', file);
    cacheEvents.trigger('changed', file, text, { frontmatter: frontmatterOfText(text) ?? undefined });
    for (const leaf of leaves) {
      const view: unknown = leaf.view;
      if (view instanceof TestMarkdownView && view.file?.path === path) view.data = text;
    }
  };
  const saveTo = (path: string, text: string): void => {
    vault.files.set(path, text);
    diskChanged(path);
  };

  const process = app.vault.process as (file: TFile, fn: (data: string) => string) => Promise<void>;
  app.vault.process = vi.fn(async (file: TFile, fn: (data: string) => string) => {
    await process(file, fn);
    diskChanged(file.path);
  });
  const create = app.vault.create as (path: string, text: string) => Promise<void>;
  app.vault.create = vi.fn(async (path: string, text: string) => {
    await create(path, text);
    return new TFile(path);
  });
  app.vault.on = vaultEvents.on;
  app.vault.offref = vaultEvents.offref;
  app.vault.getRoot = (): TFolder => new TFolder('/');
  app.metadataCache.on = cacheEvents.on;
  app.metadataCache.offref = cacheEvents.offref;
  // Like Obsidian's cache: the same object until the note's text changes.
  const cached = new Map<string, { text: string; cache: { frontmatter?: Record<string, unknown> } }>();
  app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const text = vault.files.get(file.path);
    if (text === undefined) return null;
    const hit = cached.get(file.path);
    if (hit?.text === text) return hit.cache;
    const frontmatter = frontmatterOfText(text);
    const cache = frontmatter ? { frontmatter: { ...frontmatter } } : {};
    cached.set(file.path, { text, cache });
    return cache;
  });
  app.fileManager.getNewFileParent = vi.fn(() => app.vault.getRoot());
  Object.assign(app.workspace, {
    on: workspace.on,
    offref: workspace.offref,
    trigger: workspace.trigger,
    // Like Obsidian's: a truthy return value stops the iteration.
    iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => unknown): void => {
      for (const leaf of leaves) if (callback(leaf)) return;
    },
  });

  const newLeaf = (): WorkspaceLeaf => {
    const leaf = new WorkspaceLeaf();
    Object.assign(leaf, { containerEl: document.createElement('div') });
    leaves.push(leaf);
    return leaf;
  };

  return {
    ...vault,
    workspace,
    vaultEvents,
    cacheEvents,
    leaves,
    open(path, mode = 'source', withStatblock = false) {
      const leaf = newLeaf();
      const view = new TestMarkdownView(leaf, path, vault.files.get(path) ?? '', saveTo, workspace);
      view.setMode(mode);
      leaf.view = view;
      if (withStatblock) view.containerEl.classList.add('atlas-sb-note');
      workspace.trigger('layout-change');
      return view;
    },
    defer(path) {
      const leaf = newLeaf();
      leaf.view = { getViewType: () => 'markdown', getState: () => ({ file: path }) };
      workspace.trigger('layout-change');
      return leaf;
    },
    close(view) {
      leaves.splice(leaves.indexOf(view.leaf), 1);
      workspace.trigger('layout-change');
    },
  };
}

export const NOTE = 'Bestiary/Marsh Warden.md';
export const NOTE_TEXT = '---\nname: Marsh Warden\nhp: 14\nac: 12\nimage: art/warden.webp\n---\nA warden of the marsh.\n';
