import { EditorView } from '@codemirror/view';
import { TFile, type App, type CachedMetadata } from 'obsidian';
import { pinNoteLink } from '../tools/pinNoteLink';
import { headingNamed } from './headingLinks';

/** Heading lines of the editor, in source mode and live preview. */
const EDITOR_HEADING_SELECTOR = '.cm-line.HyperMD-header';
/** Headings of reading view and rendered markdown. */
const RENDERED_HEADING_SELECTOR = '[data-heading]';

/** The heading a pin's link names in its note: its text, its line, and which of the headings of that text it is. */
export interface LinkedHeading {
  readonly text: string;
  readonly line: number;
  readonly occurrence: number;
  readonly count: number;
}

/** What `link` (a pin's heading part, see `headingNamed`) names in `file`; null when the note lacks it. */
export function linkedHeading(app: App, file: TFile, link: string): LinkedHeading | null {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return null;
  const found = headingNamed(cache, link);
  if (!found) return null;
  const same = (cache.headings ?? []).filter((heading) => heading.heading === found.heading);
  return { text: found.heading, line: found.position.start.line, occurrence: same.indexOf(found), count: same.length };
}

/**
 * Opens a pin's note in a tab of the workspace. Obsidian finds the heading of the
 * link itself, save where the link counts past the first of a path, which it does
 * not read: that one opens at its line.
 */
export async function openPinNote(app: App, notePath: string, newLeaf: boolean): Promise<void> {
  const { linkpath, heading } = pinNoteLink(notePath);
  const file = app.vault.getAbstractFileByPath(linkpath);
  const counted = heading?.endsWith('#') && file instanceof TFile ? linkedHeading(app, file, heading) : null;
  if (counted) await app.workspace.openLinkText(linkpath, '', newLeaf, { eState: { line: counted.line } });
  else await app.workspace.openLinkText(notePath, '', newLeaf);
}

/** A heading's section as offsets into its note: from the end of the heading's line to the next heading of its level or higher (null: the note's end). */
export interface HeadingSection {
  readonly heading: string;
  readonly start: number;
  readonly end: number | null;
}

/** The section `heading` opens in a note, as Obsidian resolves a link to it; null when the note lacks it. */
export function headingSection(cache: CachedMetadata, heading: string): HeadingSection | null {
  const found = headingNamed(cache, heading);
  if (found === undefined) return null;
  const headings = cache.headings ?? [];
  const next = headings.slice(headings.indexOf(found) + 1).find((cached) => cached.level <= found.level);
  return { heading: found.heading, start: found.position.end.offset, end: next?.position.start.offset ?? null };
}

/**
 * The editor's heading line on `line` (0-based, as the metadata cache counts).
 * Found by its place in the document, since the drawn text differs from the
 * heading's source once live preview renders links and formatting. Null while
 * the editor has not drawn it: it only draws the lines near the screen.
 */
export function findEditorHeading(container: HTMLElement, line: number): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>(EDITOR_HEADING_SELECTOR))
    .find((element) => editorLineOf(element) === line) ?? null;
}

/**
 * The drawn heading a link names. `data-heading` holds the heading's source text,
 * exactly as the metadata cache stores it, and a note may repeat it: the view knows
 * which line an element is on (`lineOf`), else with all of them drawn their order
 * tells. A view that draws only the lines near the screen has been scrolled to the
 * heading, so the last resort is the one nearest the top. Null while it is not drawn.
 */
export function findRenderedHeading(
  container: HTMLElement,
  heading: LinkedHeading,
  lineOf?: (element: HTMLElement) => number | null,
): HTMLElement | null {
  const drawn = Array.from(container.querySelectorAll<HTMLElement>(RENDERED_HEADING_SELECTOR))
    .filter((element) => element.dataset.heading === heading.text);
  const onItsLine = lineOf && drawn.find((element) => lineOf(element) === heading.line);
  if (onItsLine) return onItsLine;
  if (drawn.length === heading.count) return drawn[heading.occurrence] ?? null;

  const top = container.getBoundingClientRect().top;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;
  for (const element of drawn) {
    const distance = Math.abs(element.getBoundingClientRect().top - top);
    if (distance < nearestDistance) {
      nearest = element;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function editorLineOf(element: HTMLElement): number | null {
  const editor = EditorView.findFromDOM(element);
  if (!editor) return null;
  return editor.state.doc.lineAt(editor.posAtDOM(element)).number - 1;
}
