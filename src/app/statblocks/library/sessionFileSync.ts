/**
 * The file side of a template session (§8.7): what the file holds, saving on
 * request, and following the library: its own writes coming back, renames,
 * someone else's change, the file gone. Resolving a conflict builds on it
 * (`SessionFile`). The draft and its history live in the session core, which
 * this side reaches through a `DraftHost`.
 *
 * Nothing is written until the user saves: a built-in and a template never
 * saved have no file of their own, and are saved as new templates instead.
 */

import type { App } from 'obsidian';
import { serializeTemplate } from '../format/templateFormat';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import { observeDisk, saveProblemText, type SessionConflict } from './templateConflict';
import { templateName } from './templateFiles';
import type { TemplateLibrary } from './TemplateLibrary';
import { writeTemplateText, type PendingWrite, type WriteOutcome } from './templateWriter';
import { t } from '../../i18n';

/** Only a template from a newer Atlas cannot be edited; a built-in is edited and saved as a new template. */
export type ReadOnlyReason = 'newer';

export type SaveResult = { ok: true } | { ok: false; problem: string };

/** What the file side asks of the session core. */
export interface DraftHost {
  draft(): StatblockTemplate;
  inGesture(): boolean;
  /** Puts a template in place as the new start: no undo step, and the history forgotten. */
  reset(template: StatblockTemplate): void;
  /** Something the snapshot shows changed. */
  changed(): void;
}

const readOnlyOf = (entry: LibraryTemplate): ReadOnlyReason | null => (entry.status === 'newer' ? 'newer' : null);

function conflictText(conflict: SessionConflict | null): string {
  return conflict === 'deleted'
    ? t('statblockEditor.fileGone')
    : t('statblockEditor.changedElsewhere');
}

export class SessionFileSync {
  path: string | null;
  name: string;
  readOnly: ReadOnlyReason | null;
  readonly builtIn: boolean;
  /** A template made in the editor and never saved: it has no file yet. */
  readonly unsaved: boolean;
  conflict: SessionConflict | null = null;
  problem: string | null = null;
  writing = false;
  /** The template the file holds; null when it holds text that is not this template, or there is no file yet. */
  protected saved: StatblockTemplate | null;
  /** The text the file held when the session last loaded or wrote it. */
  protected baseText: string;
  /** The text of the other version while in conflict over a change. */
  protected other: string | null = null;
  /**
   * Whether the library has seen what the conflict is about. A write refused
   * on reading the disk can be ahead of it, and until then its "same" is stale.
   */
  private confirmed = false;
  /** File operations of the session's own under way; the library's news waits for them. */
  private ownOperations = 0;
  private observeLater = false;

  constructor(
    protected readonly app: App,
    protected readonly library: TemplateLibrary,
    protected readonly id: TemplateId,
    entry: LibraryTemplate,
    text: string,
    protected readonly host: DraftHost,
    unsaved = false,
  ) {
    this.path = entry.path;
    this.name = entry.name;
    this.readOnly = readOnlyOf(entry);
    this.builtIn = entry.builtIn;
    this.unsaved = unsaved;
    this.saved = unsaved ? null : entry.template;
    this.baseText = text;
  }

  isDirty(): boolean {
    return this.host.draft() !== this.saved;
  }

  /** Writes the draft over its file ("Update"), only while the file holds what the session last loaded or wrote. */
  async save(): Promise<SaveResult> {
    if (this.readOnly) return { ok: false, problem: t('statblockEditor.updateToChange') };
    if (this.builtIn || this.unsaved || this.path === null) return { ok: false, problem: t('statblockEditor.saveAsNew') };
    if (this.conflict) return { ok: false, problem: conflictText(this.conflict) };
    if (this.writing) return { ok: false, problem: t('statblockEditor.beingSaved') };
    const template = this.host.draft();
    if (template === this.saved) return { ok: true };
    const text = serializeTemplate(template);
    if (text === this.baseText) {
      this.markSaved(template);
      this.host.changed();
      return { ok: true };
    }
    const write: PendingWrite = { path: this.path, baseText: this.baseText, text, template };
    this.writing = true;
    this.host.changed();
    const outcome = await writeTemplateText(this.app, this.library, write);
    this.writing = false;
    this.settled(outcome, write);
    return outcome.kind === 'written' ? { ok: true } : { ok: false, problem: this.problem ?? conflictText(this.conflict) };
  }

  /** The library changed: the session's own write coming back, a rename, someone else's change, or the file gone. */
  libraryChanged(): void {
    if (this.builtIn || this.unsaved || this.path === null) return;
    if (this.writing || this.ownOperations > 0) {
      this.observeLater = true;
      return;
    }
    const seen = observeDisk(this.app, this.library, this.id, this.path, this.baseText);
    if (seen.kind === 'gone') {
      this.enterConflict('deleted', null, true);
    } else {
      this.movedTo(seen.path);
      if (seen.kind === 'same' && this.conflict && this.confirmed) this.leaveConflict();
      if (seen.kind === 'changed') {
        // A clean session takes the change in; undoing past it would revert someone else's work.
        if (seen.entry && !this.host.inGesture() && !this.isDirty() && !this.conflict) this.load(seen.text, seen.entry);
        else this.enterConflict('changed', seen.text, true);
      }
    }
    this.host.changed();
  }

  protected markSaved(template: StatblockTemplate): void {
    this.saved = template;
  }

  /** Takes a version of the file in as the session's start. */
  protected load(text: string, entry: LibraryTemplate): void {
    this.baseText = text;
    this.saved = entry.template;
    this.readOnly = readOnlyOf(entry);
    this.problem = null;
    this.leaveConflict();
    this.host.reset(entry.template);
  }

  protected movedTo(path: string): void {
    if (path === this.path) return;
    this.path = path;
    this.name = templateName(path);
  }

  /** Nothing is written over the file until the user chooses a version. */
  protected enterConflict(conflict: SessionConflict, other: string | null, confirmed: boolean): void {
    this.confirmed = confirmed || (this.confirmed && this.conflict === conflict);
    this.conflict = conflict;
    this.other = other;
  }

  protected leaveConflict(): void {
    this.conflict = null;
    this.other = null;
    this.confirmed = false;
  }

  /** Runs a file operation of the session's own; what the library announces meanwhile waits for `afterOwnWork`. */
  protected async ownWork<T>(work: () => Promise<T>): Promise<T> {
    this.ownOperations += 1;
    try {
      return await work();
    } finally {
      this.ownOperations -= 1;
    }
  }

  /** Takes in what the library announced while the session's own work was under way. */
  protected afterOwnWork(): void {
    if (this.writing || this.ownOperations > 0 || !this.observeLater) {
      this.host.changed();
      return;
    }
    this.observeLater = false;
    this.libraryChanged();
  }

  private settled(outcome: WriteOutcome, write: PendingWrite): void {
    if (outcome.kind === 'written') {
      this.baseText = write.text;
      this.problem = null;
      this.markSaved(write.template);
    } else if (outcome.kind === 'changed') {
      this.enterConflict('changed', outcome.text, false);
    } else if (outcome.kind === 'missing') {
      this.enterConflict('deleted', null, false);
    } else {
      this.problem = saveProblemText(outcome.problem);
    }
    this.afterOwnWork();
  }
}
