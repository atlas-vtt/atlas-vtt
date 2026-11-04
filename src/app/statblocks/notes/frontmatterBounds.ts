/**
 * Where a note's frontmatter lies, read the way Obsidian reads it. Pure.
 *
 * Obsidian (checked in 1.13.7) has two readers, which agree on ordinary notes:
 * - `getFrontMatterInfo` (the editor, Properties, plugins): the text starts with `---` and a
 *   line break, and the block ends at the first later line that is exactly `---`, followed by
 *   a line break or the end of the text. Neither `...` nor `--- ` nor `----` ends it.
 * - the metadata cache (every note's `frontmatter`, so Dataview, Bases and Fantasy Statblocks):
 *   it turns `\r\n` and a lone `\r` into `\n`, drops a byte order mark, and ends the block at
 *   the first later line that merely starts with `---`.
 *
 * `frontmatterBounds` is the first reader, after an optional byte order mark (`Vault.read` drops
 * one, `Vault.process` hands it on). `cacheFrontmatter` is the second. Atlas writes only into
 * notes both read alike (`readersAgree`).
 */

export interface FrontmatterBounds {
  exists: boolean;
  /** Start of the YAML text, just after the opening `---` line. */
  from: number;
  /** End of the YAML text: where the closing `---` begins. */
  to: number;
  /** Where the note's content (its body) begins, after the closing line. */
  contentStart: number;
  /** Where the content ends: the length of the text. */
  contentEnd: number;
  /** The line break of the opening line, else of the first line of the text. */
  lineEnding: '\n' | '\r\n';
  /** Whether the text starts with a byte order mark, which stays where it is. */
  bom: boolean;
}

const BYTE_ORDER_MARK = '﻿';

export function frontmatterBounds(text: string): FrontmatterBounds {
  const bom = text.startsWith(BYTE_ORDER_MARK);
  const start = bom ? 1 : 0;
  const opening = /---(\r?\n)/y;
  opening.lastIndex = start;
  const opened = opening.exec(text);
  if (!opened) return absentBounds(text, start, bom);

  const from = start + opened[0].length;
  const closing = /---(\r?\n|$)/g;
  closing.lastIndex = from;
  let closed = closing.exec(text);
  while (closed && text.charAt(closed.index - 1) !== '\n') closed = closing.exec(text);
  if (!closed) return absentBounds(text, start, bom);

  return {
    exists: true,
    from,
    to: closed.index,
    contentStart: closed.index + closed[0].length,
    contentEnd: text.length,
    lineEnding: opened[1] === '\r\n' ? '\r\n' : '\n',
    bom,
  };
}

/** The YAML text the metadata cache parses, or null where it sees no frontmatter. */
export function cacheFrontmatter(text: string): string | null {
  let source = text.replace(/\r\n|\r/g, '\n');
  if (source.startsWith(BYTE_ORDER_MARK)) source = source.slice(1);
  if (!source.startsWith('---\n')) return null;
  let index = source.indexOf('---', 3);
  while (index !== -1 && source.charAt(index - 1) !== '\n') index = source.indexOf('---', index + 3);
  return index === -1 ? null : source.slice(4, index - 1);
}

/**
 * Whether both of Obsidian's readers find the same frontmatter. They differ on a closing line
 * with more after its `---` (`--- `, `----`) and on lone `\r` line breaks.
 */
export function readersAgree(text: string, bounds: FrontmatterBounds = frontmatterBounds(text)): boolean {
  const cached = cacheFrontmatter(text);
  if (!bounds.exists) return cached === null;
  const yaml = text.slice(bounds.from, bounds.to);
  if (/\r(?!\n)/.test(yaml)) return false;
  return cached === yaml.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function absentBounds(text: string, start: number, bom: boolean): FrontmatterBounds {
  const firstBreak = text.indexOf('\n');
  return {
    exists: false,
    from: start,
    to: start,
    contentStart: start,
    contentEnd: text.length,
    lineEnding: firstBreak > 0 && text.charAt(firstBreak - 1) === '\r' ? '\r\n' : '\n',
    bom,
  };
}
