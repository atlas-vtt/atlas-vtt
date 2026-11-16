/**
 * A view's hold on an open template (§8.7). Every view of one template, in
 * any window, shares one draft, one history and one save state: `open`
 * counts holders per app and id, and the last `release` drops the draft.
 *
 * Edits are pure functions of the template (`model/treeOps`, `fieldOps`),
 * applied to the draft as it is when they run. One `apply` is one undo step;
 * a gesture (a drag, a label being typed, a slider) is one step however many
 * edits it makes, and an abandoned gesture puts back what it changed and
 * leaves none. Nothing is written until `save`, which writes over the file
 * only while it still holds what the session last loaded or wrote.
 */

import type { App } from 'obsidian';
import { newTemplateId } from '../model/templateIds';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import type { RoleOnSave, SessionCore, SessionSnapshot } from './sessionCore';
import type { ConflictChoice } from './sessionFile';
import type { SaveResult } from './sessionFileSync';
import { acquireSessionCore, acquireUnsavedCore, holdersOf, isSessionOpen, releaseSessionCore } from './sessionRegistry';
import { TemplateLibrary } from './TemplateLibrary';
import { t } from '../../i18n';

export type { RoleOnSave, SaveState, SessionSnapshot } from './sessionCore';
export type { ConflictChoice } from './sessionFile';
export type { SaveResult } from './sessionFileSync';

export class TemplateSession {
  /** A new hold on the template's session; null when no template by this id is known or open. */
  static open(app: App, id: TemplateId): TemplateSession | null {
    const core = acquireSessionCore(app, id);
    return core ? new TemplateSession(app, core) : null;
  }

  /**
   * A template made in the editor that has no file yet (the gallery's picks):
   * under an id of its own, named `name` until its first save names it, which
   * writes `body` into the note beside it.
   */
  static openUnsaved(app: App, template: StatblockTemplate, name: string, role: RoleOnSave | null = null, body = ''): TemplateSession {
    const library = TemplateLibrary.forApp(app);
    let id = newTemplateId(name);
    while (library.get(id) || isSessionOpen(app, id)) id = newTemplateId(name);
    return new TemplateSession(app, acquireUnsavedCore(app, { ...template, id }, name, role, body));
  }

  private released = false;
  /** The gestures this handle began and has not ended yet. */
  private gestures = 0;

  private constructor(private readonly app: App, private readonly core: SessionCore) {}

  /**
   * Lets go of the session; after the last holder its unsaved draft is dropped. Safe to call twice.
   * A gesture still open (a slider held while its tab closes) ends here and keeps what it changed: the core is shared,
   * and a gesture left open would hold every other view's undo and redo.
   */
  release(): void {
    if (this.released) return;
    for (; this.gestures > 0; this.gestures -= 1) this.core.endGesture();
    this.released = true;
    releaseSessionCore(this.app, this.core);
  }

  /** Whether this handle is the only one: letting go of it drops the draft. */
  get alone(): boolean {
    return !this.released && holdersOf(this.app, this.core) === 1;
  }

  /** For a template never saved: the role its first save gives it. */
  get roleOnSave(): RoleOnSave | null {
    return this.core.roleOnSave;
  }

  /** For `useSyncExternalStore`: a new object only when something it holds changed. */
  readonly getSnapshot = (): SessionSnapshot => this.core.getSnapshot();

  readonly subscribe = (listener: () => void): (() => void) => (this.released ? () => undefined : this.core.subscribe(listener));

  /** Applies a pure edit to the draft. Nothing happens while read-only, or when the edit returns its input. */
  apply(edit: (template: StatblockTemplate) => StatblockTemplate): void {
    if (!this.released) this.core.apply(edit);
  }

  beginGesture(): void {
    if (!this.released && this.core.beginGesture()) this.gestures += 1;
  }

  /** Ends the innermost gesture this handle began; never one another view of the template holds. */
  endGesture(): void {
    if (this.released || this.gestures === 0) return;
    this.gestures -= 1;
    this.core.endGesture();
  }

  abandonGesture(): void {
    if (this.released || this.gestures === 0) return;
    this.gestures -= 1;
    this.core.abandonGesture();
  }

  undo(): void {
    if (!this.released) this.core.undo();
  }

  redo(): void {
    if (!this.released) this.core.redo();
  }

  /** Writes the draft over the template's file ("Update"); a built-in or a template never saved is saved as a new one instead. */
  save(): Promise<SaveResult> {
    return this.released ? Promise.resolve({ ok: false, problem: t('statblockEditor.templateClosed') }) : this.core.save();
  }

  /** The text a template without a file (never saved, or a built-in) gives its note once saved; ignored for a saved template. */
  setDraftBody(text: string): void {
    if (!this.released) this.core.setDraftBody(text);
  }

  /** Drops the unsaved changes and their history, in every view of the template. */
  discard(): void {
    if (!this.released) this.core.discard();
  }

  /** What to do about a version written elsewhere, or a file deleted, while the session had unsaved edits. */
  resolveConflict(choice: ConflictChoice): Promise<void> {
    return this.released ? Promise.resolve() : this.core.resolveConflict(choice);
  }
}
