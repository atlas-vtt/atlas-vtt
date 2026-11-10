/**
 * The one writer of statblock note values (§8.1 invariant 6, §8.4, §8.5).
 *
 * Every write picks its backend per note when it is flushed, whatever started it:
 * - **editor**: a loaded `MarkdownView` in an editing mode holds the note, in any window. The
 *   patches apply to its buffer and only the changed range goes in as one transaction (`writeToEditor`),
 *   at once: one undo step in the note, unsaved typing kept, other leaves following, Obsidian
 *   saving. Reading view and deferred leaves never count (spike S2).
 * - **vault**: otherwise `vault.process`, atomic against Obsidian's other writes. Disk writes of a
 *   note coalesce for `COALESCE_MS`; a flush writes them at once.
 * A note whose properties Atlas cannot read is never written: its patches come back as conflicts
 * with the problem. A patch whose base the note no longer holds is a conflict; the rest still apply.
 *
 * One per app, released when the plugin unloads (which starts the last flush).
 */

import type { App, MarkdownView, TAbstractFile, TFile } from 'obsidian';
import { applyWrites, type NoteRewrite, type PatchBuilder, type WriteRequest, type WriteResult } from './applyWrites';
import { writeToEditor } from './editorWrite';
import { editingViewOf, loadedMarkdownViews } from './openEditors';
import { OwnEchoes } from './ownEchoes';
import type { NotePatch } from './patchTypes';
import { WriteQueue } from './writeQueue';

export interface WriteOutcome {
  applied: readonly NotePatch[];
  conflicts: readonly NotePatch[];
  backend: 'editor' | 'vault' | 'none';
  problem: string | null;
}

/** How long disk writes of one note wait for more to join them. */
export const COALESCE_MS = 300;

interface PendingWrite {
  request: WriteRequest;
  resolve: (outcome: WriteOutcome) => void;
}

const NOTHING: WriteOutcome = { applied: [], conflicts: [], backend: 'none', problem: null };

export class NoteFieldWriter {
  private static readonly instances = new WeakMap<App, NoteFieldWriter>();

  static forApp(app: App): NoteFieldWriter {
    let writer = NoteFieldWriter.instances.get(app);
    if (!writer) {
      writer = new NoteFieldWriter(app);
      NoteFieldWriter.instances.set(app, writer);
    }
    return writer;
  }

  /** Stops following the vault and writes what is pending; Obsidian does not await an unload, so neither does this. */
  static release(app: App): void {
    const writer = NoteFieldWriter.instances.get(app);
    NoteFieldWriter.instances.delete(app);
    writer?.destroy();
  }

  private readonly queue = new WriteQueue<PendingWrite>((path, items) => this.runWrites(path, items));
  private readonly echoes = new OwnEchoes();
  /** Editors written to since their last save, saved by a flush. */
  private readonly touched = new Set<MarkdownView>();
  /** Commits of inputs that may hold typed text, run by every `flushAll`. */
  private readonly pending = new Set<() => Promise<void>>();
  private readonly detachers: Array<() => void> = [];

  private constructor(private readonly app: App) {
    const { vault } = app;
    const renamed = vault.on('rename', (file, oldPath) => this.renamed(file, oldPath));
    const deleted = vault.on('delete', (file) => { for (const path of this.queue.pathsWithin(file.path)) void this.queue.flush(path); });
    this.detachers.push(() => vault.offref(renamed), () => vault.offref(deleted));
  }

  /**
   * Applies patches to a note. Into an open editor they go before this returns; to disk within
   * `COALESCE_MS`, or at the next flush. Resolves with what was applied and what conflicted.
   */
  write(path: string, patches: readonly NotePatch[]): Promise<WriteOutcome> {
    return patches.length === 0 ? Promise.resolve(NOTHING) : this.enqueue(path, { patches }, false);
  }

  /**
   * Builds patches from the note's frontmatter as the write finds it and writes them at once: for
   * changes made outside editing (an image moved, a token linked), whose bases are whatever the
   * note holds then. The builder gets the patcher's own reading, so the bases always match it.
   */
  patchNow(path: string, build: PatchBuilder): Promise<WriteOutcome> {
    return this.enqueue(path, { build }, true);
  }

  /**
   * Rewrites the whole note at once, against its text as the write finds it (in an open editor:
   * one undo step). For a change beyond the properties, such as a statblock code block moved into
   * them; the rewrite says what it could not do instead of throwing.
   */
  rewriteNow(path: string, rewrite: NoteRewrite): Promise<WriteOutcome> {
    return this.enqueue(path, { rewrite }, true);
  }

  /** Writes the note's pending changes and saves the editors written to; all notes without a path. */
  async flush(path?: string): Promise<void> {
    if (path === undefined) return this.flushAll();
    await this.queue.flush(path);
    await this.saveTouched(path);
  }

  /**
   * Every pending change to disk or into its editor, and every editor written to saved (on close,
   * quit, window close). The registered commits run first: each queues its write as it starts.
   */
  async flushAll(): Promise<void> {
    const commits = this.runPending();
    await this.queue.flushAll();
    await commits;
    await this.saveTouched();
  }

  /**
   * Registers the commit of an input text is typed in (§8.5). Quitting, closing a window or
   * unloading neither blurs it nor closes its pane, so `flushAll` runs the commit and the typed
   * text reaches the note. Returns the unregistration.
   */
  registerPending(commit: () => Promise<void>): () => void {
    this.pending.add(commit);
    return () => { this.pending.delete(commit); };
  }

  /** Whether a frontmatter (or note text) is one Atlas wrote into the note a moment ago: its echo, not someone's edit. */
  isOwnEcho(path: string, frontmatterText: string): boolean {
    return this.echoes.isOwn(path, frontmatterText);
  }

  /** Undoes the last step in the editor that holds the note; false when no editor holds it. */
  undo(path: string): boolean {
    const view = editingViewOf(this.app, path);
    view?.editor.undo();
    return view !== null;
  }

  redo(path: string): boolean {
    const view = editingViewOf(this.app, path);
    view?.editor.redo();
    return view !== null;
  }

  private runPending(): Promise<void> {
    const commits = [...this.pending].map(async (commit) => {
      try {
        await commit();
      } catch (error) {
        console.error('[Atlas] Committing a statblock value failed:', error);
      }
    });
    return Promise.all(commits).then(() => undefined);
  }

  private enqueue(path: string, request: WriteRequest, now: boolean): Promise<WriteOutcome> {
    return new Promise((resolve) => {
      this.queue.add(path, { request, resolve });
      // An open editor takes the write before this returns, or right after a disk write of the note in flight.
      if (now || editingViewOf(this.app, path)) void this.queue.flush(path);
      else this.queue.schedule(path, COALESCE_MS);
    });
  }

  /** The backend is chosen here, when the writes run, not when they were made. A write never throws: a failure is its outcome. */
  private runWrites(path: string, items: PendingWrite[]): Promise<void> | void {
    const requests = items.map((item) => item.request);
    const settle = (results: readonly WriteResult[], backend: WriteOutcome['backend']): void => {
      items.forEach((item, index) => item.resolve({ ...(results[index] ?? failed(requests[index])), backend }));
    };
    const fail = (error: unknown, backend: WriteOutcome['backend']): void => settle(requests.map((request) => failed(request, error)), backend);
    try {
      const view = editingViewOf(this.app, path);
      if (view) return settle(this.writeEditor(view, path, requests), 'editor');
      const file = this.app.vault.getFileByPath(path);
      if (!file) return fail('The note no longer exists.', 'none');
      return this.writeVault(file, requests).then((results) => settle(results, 'vault'), (error: unknown) => fail(error, 'vault'));
    } catch (error) {
      return fail(error, 'none');
    }
  }

  private writeEditor(view: MarkdownView, path: string, requests: readonly WriteRequest[]): WriteResult[] {
    // In an editing mode the editor's text is the view's data; the transaction's offsets are the editor's.
    const before = view.editor.getValue();
    const { text, results } = applyWrites(before, requests);
    if (text !== before) {
      // Remembered first: the editor reports the change before `transaction` returns.
      this.echoes.remember(path, text);
      writeToEditor(view.editor, before, text);
      this.touched.add(view);
    }
    return results;
  }

  private async writeVault(file: TFile, requests: readonly WriteRequest[]): Promise<WriteResult[]> {
    // Patches that change nothing (all conflicts, values already set) must not touch the file or its mtime.
    const disk = await this.app.vault.read(file);
    const preview = applyWrites(disk, requests);
    if (preview.text === disk) return preview.results;
    const written: { results: WriteResult[] } = { results: preview.results };
    await this.app.vault.process(file, (data) => {
      const { text, results } = applyWrites(data, requests);
      written.results = results;
      if (text !== data) this.echoes.remember(file.path, text);
      return text;
    });
    return written.results;
  }

  private async saveTouched(path?: string): Promise<void> {
    const open = new Set(loadedMarkdownViews(this.app));
    const saves: Array<Promise<void>> = [];
    for (const view of [...this.touched]) {
      if (path !== undefined && view.file?.path !== path) continue;
      this.touched.delete(view);
      // A closed view saved its note when it closed.
      if (open.has(view)) saves.push(view.save().catch((error: unknown) => { console.error('[Atlas] Saving a statblock note failed:', error); }));
    }
    await Promise.all(saves);
  }

  private renamed(file: TAbstractFile, oldPath: string): void {
    this.echoes.move(oldPath, file.path);
    for (const path of this.queue.pathsWithin(oldPath)) {
      const moved = file.path + path.slice(oldPath.length);
      this.queue.move(path, moved);
      this.echoes.move(path, moved);
      void this.queue.flush(moved);
    }
  }

  private destroy(): void {
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.flushAll().catch((error: unknown) => { console.error('[Atlas] Writing statblock edits failed:', error); });
    this.queue.clear();
  }
}

/** A request that wrote nothing: its patches as conflicts, with why. */
function failed(request: WriteRequest | undefined, reason?: unknown): WriteResult {
  const problem = typeof reason === 'string' ? reason : reason instanceof Error ? `Couldn't save the note: ${reason.message}` : null;
  return { applied: [], conflicts: request && 'patches' in request ? request.patches : [], problem };
}
