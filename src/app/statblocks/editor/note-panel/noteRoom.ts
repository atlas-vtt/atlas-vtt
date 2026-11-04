/**
 * The room a Markdown view gives its note: how wide its content is and, with
 * Obsidian's readable line width on, how much of that the note's text takes.
 * Read from the view's own elements, so a theme that sets another line width
 * or other margins is followed.
 */

import type { MarkdownView } from 'obsidian';
import type { NoteRoom } from './panelPrefs';

/** Obsidian's own values, should a theme leave the variables unset. */
const FALLBACK_LINE_WIDTH = 700;
const FALLBACK_MARGIN = 32;
/** The class Obsidian sets on the editor and the reader while readable line width is on. */
const READABLE_CLASS = 'is-readable-line-width';
/** The editor, the reader (shown or hidden by mode) and the reader's text, which carries the class in Reading view. */
const WATCHED = ['.markdown-source-view', '.markdown-reading-view', '.markdown-preview-view'] as const;

/** The first length of a CSS value in pixels (`700px`, `32px 16px`), or `fallback`. */
function pixels(value: string, fallback: number): number {
  const match = /(-?\d+(?:\.\d+)?)px/.exec(value);
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** The element showing the note now: the editor, or the reader in Reading view. */
function shownNote(view: MarkdownView): HTMLElement | null {
  const mode = typeof view.getMode === 'function' ? view.getMode() : 'source';
  return view.contentEl.querySelector<HTMLElement>(mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view');
}

/** What the note's text takes with readable line width on: the line and a margin on either side; null while off. */
export function readableLineOf(note: HTMLElement | null): number | null {
  // Plain DOM: the element may live in a window without Obsidian's helpers (a popout under test).
  const win = note?.ownerDocument.defaultView;
  if (!note || !win || !note.classList.contains(READABLE_CLASS)) return null;
  const style = win.getComputedStyle(note);
  const line = pixels(style.getPropertyValue('--file-line-width'), FALLBACK_LINE_WIDTH);
  const margin = pixels(style.getPropertyValue('--file-margins'), FALLBACK_MARGIN);
  return Math.round(line + 2 * margin);
}

export function measureNoteRoom(view: MarkdownView): NoteRoom {
  return { available: view.contentEl.clientWidth, readableLine: readableLineOf(shownNote(view)) };
}

/**
 * Calls `onChange` when readable line width is switched or the view changes
 * mode: Obsidian sets classes on the editor and the reader, which changes no
 * size a resize observer would see. Only these elements are observed,
 * never the editor's content, whose classes change on every keystroke.
 */
export function watchNoteRoom(view: MarkdownView, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  for (const selector of WATCHED) {
    const note = view.contentEl.querySelector(selector);
    if (note) observer.observe(note, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  return () => observer.disconnect();
}
