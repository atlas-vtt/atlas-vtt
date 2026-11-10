/**
 * What a session does to its file on request (§8.7): resolving a conflict
 * (keep mine, use the other version, save mine as a copy, recreate a deleted
 * file) and dropping the unsaved changes.
 */

import { readTemplateFile, templateName } from './templateFiles';
import { copyTemplateBody } from './templateBodyNotes';
import { copyName, folderOf } from './templatePaths';
import { newTemplateFile, writeNewTemplateFile } from './templateWriter';
import { SessionFileSync } from './sessionFileSync';

export type ConflictChoice = 'keep-mine' | 'use-other' | 'save-copy' | 'recreate';

export class SessionFile extends SessionFileSync {
  async resolveConflict(choice: ConflictChoice): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return;
    if (choice === 'save-copy') {
      await this.saveCopy();
      this.useOther();
    } else if (choice === 'use-other') {
      this.useOther();
    } else if (conflict === 'deleted') {
      await this.recreate();
    } else if (choice === 'keep-mine') {
      await this.keepMine();
    }
    this.afterOwnWork();
  }

  /**
   * Back to what the file holds: the draft and its history are dropped. A
   * template never saved has nothing to go back to; its draft stops counting
   * as unsaved (it was just saved as a template of its own).
   */
  discard(): void {
    if (this.unsaved) this.saved = this.host.draft();
    else if (this.conflict) this.useOther();
    else if (this.saved) this.host.reset(this.saved);
    this.host.changed();
  }

  private useOther(): void {
    const entry = this.other === null || this.path === null ? null : readTemplateFile(this.path, this.other).entry;
    if (this.conflict === 'deleted') {
      // Nothing to take: back to the version last saved, and the file stays gone.
      if (this.saved) this.host.reset(this.saved);
    } else if (this.other !== null && entry?.template.id === this.id) {
      this.load(this.other, entry);
    } else {
      this.problem = 'The other version can\'t be read as this template.';
    }
  }

  /**
   * Keeps the draft and takes the other version as what the file holds, so the
   * next save writes the draft over it; Obsidian's file recovery keeps that one.
   */
  private async keepMine(): Promise<void> {
    const file = this.path === null ? null : this.app.vault.getFileByPath(this.path);
    if (!file || this.path === null) {
      this.enterConflict('deleted', null, false);
      return;
    }
    const path = this.path;
    this.baseText = await this.ownWork(() => this.app.vault.read(file));
    this.saved = readTemplateFile(path, this.baseText).entry?.template ?? null;
    this.leaveConflict();
  }

  /** Writes the draft to a file again, where the deleted one was or beside it when that place is taken. */
  private async recreate(): Promise<void> {
    const template = this.host.draft();
    const folder = this.path === null ? '' : folderOf(this.path);
    const written = await this.ownWork(() => writeNewTemplateFile(this.app, this.library, folder, this.name, template));
    this.path = written.path;
    this.name = templateName(written.path);
    this.baseText = written.text;
    this.problem = null;
    this.markSaved(template);
    this.leaveConflict();
  }

  /** The draft as a template of its own beside the file, with a copy of the file's note. */
  private async saveCopy(): Promise<void> {
    const folder = this.path === null ? undefined : folderOf(this.path);
    const made = await this.ownWork(() => newTemplateFile(this.app, this.library, copyName(this.name), this.host.draft(), folder));
    await copyTemplateBody(this.app, this.path, made.path);
  }
}
