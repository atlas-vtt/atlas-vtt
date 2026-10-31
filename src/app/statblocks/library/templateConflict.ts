/**
 * What a session makes of the library's view of its file (§8.7): its own
 * write coming back, a rename, someone else's change, or the file gone. A
 * clean session takes another's change in; a session with unsaved edits
 * asks which version to keep before it saves.
 */

import type { App } from 'obsidian';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { TemplateId } from '../model/templateTypes';
import type { TemplateLibrary } from './TemplateLibrary';
import { t } from '../../i18n';

export type SessionConflict = 'changed' | 'deleted';

export type DiskObservation =
  /** The file holds what the session last loaded or wrote; `path` is where it is now. */
  | { kind: 'same'; path: string }
  /** The file holds something else: `entry` when that reads as this template, null when it cannot be read as one. */
  | { kind: 'changed'; path: string; text: string; entry: LibraryTemplate | null }
  /** The vault has the file, but the library has not read it yet (just renamed or created). */
  | { kind: 'unread'; path: string }
  /** No file holds the template any more: deleted, or overwritten with another template. */
  | { kind: 'gone' };

function observeAt(library: TemplateLibrary, id: TemplateId, path: string, baseText: string): DiskObservation | null {
  const file = library.fileAt(path);
  if (!file) return null;
  if (file.text === baseText) return { kind: 'same', path };
  const holds = file.entry?.template.id;
  if (holds !== undefined && holds !== id) return { kind: 'gone' };
  return { kind: 'changed', path, text: file.text, entry: file.entry };
}

/**
 * Where the session's file is and what it holds. The session keeps to its own
 * file while that is there, a duplicate of it included; it follows the
 * template's file to another path only where the vault has the file there.
 */
export function observeDisk(app: App, library: TemplateLibrary, id: TemplateId, path: string, baseText: string): DiskObservation {
  const own = observeAt(library, id, path, baseText);
  if (own) return own;
  const moved = library.get(id)?.path;
  if (moved && moved !== path && app.vault.getFileByPath(moved)) {
    const there = observeAt(library, id, moved, baseText);
    if (there) return there;
  }
  return app.vault.getFileByPath(path) ? { kind: 'unread', path } : { kind: 'gone' };
}

/** What a save that failed says. */
export function saveProblemText(problem: string): string {
  return t('statblockEditor.saveFailedWhyDot', { problem: problem.replace(/[.\s]+$/, '') });
}
