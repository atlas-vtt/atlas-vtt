/**
 * One open template, shared by every view of it in any window (§8.7): the
 * draft with its history (§7.8) and its file. Views hold `TemplateSession`
 * handles; the registry keeps one core per app and template id. Nothing is
 * written until a view saves.
 */

import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import {
  abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction, getHistoryStore, runUntracked, type HistoryState,
} from './sessionHistory';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import { createTemplateDraftStore, type TemplateDraftStore, type TemplateEdit } from './sessionStore';
import { SessionFile, type ConflictChoice } from './sessionFile';
import type { ReadOnlyReason, SaveResult } from './sessionFileSync';
import type { SessionConflict } from './templateConflict';
import { TemplateLibrary } from './TemplateLibrary';
import { t } from '../../i18n';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** The role of a collection a template made from the gallery starts new statblocks for, once it is saved. */
export interface RoleOnSave {
  collectionId: string;
  roleId: string;
}

export interface SessionSnapshot {
  id: TemplateId;
  /** The file's basename; a built-in's own name; the name a template never saved starts with. */
  name: string;
  /** Null for built-ins and templates never saved. */
  path: string | null;
  /** A built-in: edited like any template, saved only as a new one. */
  builtIn: boolean;
  /** Made in the editor and never saved: its first save names it. */
  unsaved: boolean;
  /**
   * For a template without a file (never saved, or a built-in): the text its
   * next save writes into the note beside it, typed in the editor or the
   * statblock's own text when the template was made from one; empty for a
   * saved template, which keeps its text in that note.
   */
  draftBody: string;
  /** The draft or its text differs from what the file holds (always, for a template never saved). */
  dirty: boolean;
  /** The draft. */
  template: StatblockTemplate;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  saveState: SaveState;
  /** "Couldn't save: <reason>.", or why a conflict could not be resolved as asked. */
  saveProblem: string | null;
  conflict: SessionConflict | null;
  canUndo: boolean;
  canRedo: boolean;
}

function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (Object.keys(a) as (keyof SessionSnapshot)[]).every((key) => a[key] === b[key]);
}

export class SessionCore {
  /** Builds the core for a template the library knows; null when it knows none by this id. */
  static create(app: App, id: TemplateId): SessionCore | null {
    const library = TemplateLibrary.forApp(app);
    const entry = library.get(id);
    if (!entry) return null;
    const text = entry.path === null ? '' : library.fileAt(entry.path)?.text;
    return text === undefined ? null : new SessionCore(app, library, entry, text, false);
  }

  /** The core of a template made in the editor that has no file yet, named `name` until its first save. */
  static unsaved(app: App, template: StatblockTemplate, name: string, role: RoleOnSave | null, body: string): SessionCore {
    const entry: LibraryTemplate = { template, name, status: 'ok', builtIn: false, path: null };
    const core = new SessionCore(app, TemplateLibrary.forApp(app), entry, '', true, body);
    core.roleOnSave = role;
    return core;
  }

  readonly id: TemplateId;
  /** For a template never saved: the role its first save gives it. */
  roleOnSave: RoleOnSave | null = null;

  private readonly store: TemplateDraftStore;
  private readonly file: SessionFile;
  /** Where each open gesture started, innermost last. */
  private readonly gestureStarts: StatblockTemplate[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly detachers: Array<() => void> = [];
  private snapshot: SessionSnapshot;
  private disposed = false;
  /** The text a template without a file gives its note once saved (`startBody` until typed in). */
  private draftBody: string;

  private constructor(
    app: App, library: TemplateLibrary, entry: LibraryTemplate, text: string, unsaved: boolean, private readonly startBody = '',
  ) {
    this.id = entry.template.id;
    this.draftBody = startBody;
    this.store = createTemplateDraftStore(entry.template);
    this.file = new SessionFile(app, library, this.id, entry, text, this, unsaved);
    this.snapshot = this.build();
    this.detachers.push(
      this.store.subscribe((state, previous) => { if (state.template !== previous.template) this.changed(); }),
      this.history().subscribe(() => this.changed()),
      library.subscribe(() => { if (!this.disposed) this.file.libraryChanged(); }),
    );
  }

  // DraftHost
  draft(): StatblockTemplate {
    return this.store.getState().template;
  }

  inGesture(): boolean {
    return this.gestureStarts.length > 0;
  }

  reset(template: StatblockTemplate): void {
    // Clearing the history also closes any transaction an open gesture held.
    this.gestureStarts.length = 0;
    runUntracked(this.store, () => this.store.setState({ template }));
    this.history().getState().clear();
  }

  changed(): void {
    const next = this.build();
    if (sameSnapshot(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  apply(edit: TemplateEdit): void {
    if (this.disposed || this.file.readOnly) return;
    this.store.getState().edit(edit);
  }

  /** False when no gesture began: the session is read-only or gone. */
  beginGesture(): boolean {
    if (this.disposed || this.file.readOnly) return false;
    this.gestureStarts.push(this.draft());
    beginHistoryTransaction(this.store);
    return true;
  }

  endGesture(): void {
    if (this.gestureStarts.pop() === undefined) return;
    endHistoryTransaction(this.store);
    this.changed();
  }

  /** Puts back what the innermost gesture changed and leaves no step for it. */
  abandonGesture(): void {
    const start = this.gestureStarts.pop();
    if (start === undefined) return;
    // Still inside the transaction: putting the start back records nothing.
    this.store.setState({ template: start });
    abandonHistoryTransaction(this.store);
    this.changed();
  }

  undo(): void {
    if (!this.disposed && !this.file.readOnly && !this.inGesture()) this.history().getState().undo();
  }

  redo(): void {
    if (!this.disposed && !this.file.readOnly && !this.inGesture()) this.history().getState().redo();
  }

  /** Writes the draft over the template's file ("Update"). */
  save(): Promise<SaveResult> {
    return this.disposed ? Promise.resolve({ ok: false, problem: t('statblockEditor.templateClosed') }) : this.file.save();
  }

  /**
   * Sets the text a template without a file gives its note once saved. Not an
   * undo step of the template: the text has its own undo where it is typed.
   */
  setDraftBody(text: string): void {
    if (this.disposed || this.file.readOnly || this.file.path !== null || text === this.draftBody) return;
    this.draftBody = text;
    this.changed();
  }

  /** Drops the unsaved changes and their history: the draft is what the file holds again. */
  discard(): void {
    if (this.disposed) return;
    this.draftBody = this.startBody;
    this.file.discard();
  }

  resolveConflict(choice: ConflictChoice): Promise<void> {
    return this.file.resolveConflict(choice);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.listeners.clear();
  }

  private history(): StoreApi<HistoryState<unknown>> {
    const history = getHistoryStore(this.store);
    if (!history) throw new Error('A template draft store has no history.');
    return history;
  }

  private build(): SessionSnapshot {
    const { pastStates, futureStates } = this.history().getState();
    const { readOnly, conflict, problem } = this.file;
    const editable = readOnly === null;
    return {
      id: this.id,
      name: this.file.name,
      path: this.file.path,
      builtIn: this.file.builtIn,
      unsaved: this.file.unsaved,
      draftBody: this.file.path === null ? this.draftBody : '',
      dirty: editable && this.isDirty(),
      template: this.draft(),
      readOnly: !editable,
      readOnlyReason: readOnly,
      saveState: this.saveState(),
      saveProblem: problem,
      conflict,
      canUndo: editable && pastStates.length > 0,
      canRedo: editable && futureStates.length > 0,
    };
  }

  /** The draft differs from the file, or a template without a file has text its save would write. */
  private isDirty(): boolean {
    return this.file.isDirty() || (this.file.path === null && this.draftBody !== this.startBody);
  }

  private saveState(): SaveState {
    if (this.file.conflict) return 'conflict';
    if (this.file.writing) return 'saving';
    const dirty = !this.file.readOnly && this.isDirty();
    if (dirty && this.file.problem) return 'error';
    return dirty ? 'dirty' : 'saved';
  }
}
