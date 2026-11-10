/**
 * The ```statblock fences of a note's text, where they lie (§6.4): what moving
 * a code-block statblock into the note's properties reads and removes. Pure.
 *
 * Fences are read line by line as Markdown reads them: a fence of another
 * language holds no statblock (an example in a ````markdown block), and a
 * fence closes with a line of the same character at least as long.
 */

import { parseNoteYaml } from '../../services/noteYaml';
import { isPlainRecord } from '../values/fieldValueOf';

export interface StatblockFence {
  /** Offset of the opening line's first character. */
  from: number;
  /** Offset just past the closing line's line ending (the text's end for a fence left open). */
  to: number;
  /** The params its YAML holds; null where they cannot be read. */
  params: Record<string, unknown> | null;
}

const OPENING = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const STATBLOCK_INFO = /^[ \t]*statblock[ \t]*$/;

interface Line {
  text: string;
  from: number;
  /** Past its line ending. */
  to: number;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  const ending = /\r\n|\r|\n/g;
  let from = 0;
  for (let match = ending.exec(text); match; match = ending.exec(text)) {
    lines.push({ text: text.slice(from, match.index), from, to: match.index + match[0].length });
    from = match.index + match[0].length;
  }
  if (from < text.length) lines.push({ text: text.slice(from), from, to: text.length });
  return lines;
}

function closes(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= fence.length && trimmed === fence[0]!.repeat(trimmed.length);
}

/** The params of a fence's YAML: a map, nothing for an empty fence, null for YAML that cannot be read. */
export function fenceParams(yaml: string): Record<string, unknown> | null {
  if (yaml.trim() === '') return {};
  try {
    const params: unknown = parseNoteYaml(yaml);
    return isPlainRecord(params) ? params : null;
  } catch {
    return null;
  }
}

/** Every ```statblock fence of the text, in order. */
export function findStatblockFences(text: string): StatblockFence[] {
  const lines = linesOf(text);
  const fences: StatblockFence[] = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = OPENING.exec(lines[index]!.text);
    if (!opening) continue;
    const marker = opening[1]!;
    // A backtick fence's info string holds no backtick; such a line opens nothing.
    if (marker.startsWith('`') && opening[2]!.includes('`')) continue;
    let end = index + 1;
    while (end < lines.length && !closes(lines[end]!.text, marker)) end++;
    if (STATBLOCK_INFO.test(opening[2]!)) {
      const body = lines.slice(index + 1, end).map((line) => line.text).join('\n');
      const last = lines[Math.min(end, lines.length - 1)]!;
      fences.push({ from: lines[index]!.from, to: last.to, params: fenceParams(body) });
    }
    index = end;
  }
  return fences;
}
