import type { TextFileView } from 'obsidian';

/**
 * Whether a note's view holds text its file does not: a change not saved yet, or a save still
 * being written. Obsidian's own rule for the views it saves before it quits, by its two flags;
 * the editor's text is also compared with the text last loaded or saved, should the flags be gone.
 */
export function holdsUnsavedText(view: TextFileView): boolean {
  return view.dirty === true || view.saving === true || view.getViewData() !== view.data;
}
