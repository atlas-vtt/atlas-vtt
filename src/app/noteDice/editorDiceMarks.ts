/**
 * Which text of a note being edited rolls: the rolls Reading view links (`noteDiceLinks.ts`), found
 * in the editor's own text. Only the ranges asked for are read (the lines on screen), so the work
 * stays the same however long the note is. Pure: a state in, decorations out.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { rollPieces } from '../tools/textRolls';
import { codeRoll } from './noteDiceLinks';

/**
 * The class of a roll in the editor. Not `.atlas-dice-link`: the surfaces that link dice roll those
 * on any click, and in the editor a plain click must still place the cursor.
 */
export const EDITOR_DICE_CLASS = 'atlas-editor-dice';

/**
 * Tokens of Obsidian's Markdown whose text holds no rolls, as Reading view leaves them alone: code
 * blocks, frontmatter, links, maths, comments, tags, HTML, footnote and block references and the
 * markup characters themselves.
 */
const NO_ROLLS = /codeblock|frontmatter|link|url|math|comment|hashtag|html|tag|footref|blockid|formatting/;
const INLINE_CODE = /inline-code/;

interface Span {
  from: number;
  to: number;
}

function diceMark(formula: string): Decoration {
  return Decoration.mark({ class: EDITOR_DICE_CLASS, attributes: { 'data-formula': formula } });
}

/** Neighbouring tokens of one piece of inline code joined into one span. */
function joined(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.to === span.from) last.to = span.to;
    else out.push({ ...span });
  }
  return out;
}

/** The parts of `from`..`to` that no span of `held` (sorted by start) covers. */
function freeParts(from: number, to: number, held: readonly Span[]): Span[] {
  const parts: Span[] = [];
  let at = from;
  for (const span of held) {
    if (span.to <= at) continue;
    if (span.from >= to) break;
    if (span.from > at) parts.push({ from: at, to: span.from });
    at = Math.max(at, span.to);
  }
  if (at < to) parts.push({ from: at, to });
  return parts;
}

/** The rolls written in one stretch of running text, as marks at their place in the document. */
function textMarks(state: EditorState, part: Span, marks: Range<Decoration>[]): void {
  let at = part.from;
  for (const piece of rollPieces(state.sliceDoc(part.from, part.to))) {
    if (piece.formula !== null) marks.push(diceMark(piece.formula).range(at, at + piece.text.length));
    at += piece.text.length;
  }
}

/** Marks every roll in `visible` (the editor's visible ranges) that Reading view would link. */
export function editorDiceMarks(state: EditorState, visible: readonly Span[]): DecorationSet {
  const tree = syntaxTree(state);
  const marks: Range<Decoration>[] = [];
  for (const { from, to } of visible) {
    const held: Span[] = [];
    const code: Span[] = [];
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.type.name;
        if (INLINE_CODE.test(name) && !name.includes('formatting')) code.push({ from: node.from, to: node.to });
        else if (NO_ROLLS.test(name)) held.push({ from: node.from, to: node.to });
      },
    });

    // Inline code rolls only when it holds a whole formula (`2d6+3`, `dice: 1d20+5`), as in Reading view.
    for (const span of joined(code)) {
      held.push(span);
      const formula = codeRoll(state.sliceDoc(span.from, span.to));
      if (formula !== null) marks.push(diceMark(formula).range(span.from, span.to));
    }
    held.sort((a, b) => a.from - b.from);

    // Line by line, so a roll never runs from one line into the next.
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      for (const part of freeParts(Math.max(line.from, from), Math.min(line.to, to), held)) textMarks(state, part, marks);
      pos = line.to + 1;
    }
  }
  return Decoration.set(marks, true);
}
