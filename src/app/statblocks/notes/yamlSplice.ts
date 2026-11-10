import { isCollection, isMap, isScalar, isSeq, type Node } from '../../services/noteYaml';
import type { FieldKey, FieldValue } from '../model/templateTypes';
import type { FieldPath } from './patchTypes';
import {
  entryAt, entryOf, isBlockCollection, isFlowCollection, nodeAt, type Entry, type FrontmatterDoc,
} from './yamlDocument';
import {
  DEFAULT_RENDER_STYLE, renderFlowElement, renderInline, renderItemLines, renderKey, renderPairLines,
  type RenderStyle, type ValueHint,
} from './yamlValueText';

/**
 * Edits of frontmatter YAML by source range: each returns the one range it rewrites and the text
 * that goes there, so every other byte stays as it was. Null means the edit cannot be made in
 * place; the patcher then tries a coarser one.
 */

export interface TextEdit {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

export interface SpliceContext {
  readonly doc: FrontmatterDoc;
  readonly eol: '\n' | '\r\n';
  readonly style: RenderStyle;
}

export function spliceText(text: string, edit: TextEdit): string {
  return text.slice(0, edit.from) + edit.text + text.slice(edit.to);
}

/** Writes a value in place of an entry's value; `keepStyle` keeps the old node's flow, quoting and indentation. */
export function replaceValue(ctx: SpliceContext, path: FieldPath, value: FieldValue, keepStyle = true): TextEdit | null {
  const entry = entryAt(ctx.doc, path);
  if (!entry) return null;
  const text = ctx.doc.text;
  if (entry.slot === null) {
    const element = renderFlowElement(value);
    const start = entry.value?.range?.[0];
    return element === null || start === undefined ? null : { from: start, to: entry.end, text: element };
  }
  const hint = keepStyle ? hintFor(entry.value) : {};
  const style = keepStyle ? styleOf(ctx, entry) : ctx.style;
  const inline = renderInline(value, style, hint);
  if (inline !== null) {
    const closesLine = endsLine(text, entry.slot, entry.end);
    const tail = closesLine ? ctx.eol : text.charAt(entry.end) === '#' ? ' ' : '';
    return { from: entry.slot, to: entry.end, text: (inline === '' ? '' : ` ${inline}`) + tail };
  }
  const key = entry.key?.range ? text.slice(entry.key.range[0], entry.key.range[1]) : null;
  if (key?.includes('\n')) return null;
  const lines = key === null ? renderItemLines(value, style, hint) : renderPairLines({ source: key }, value, style, hint);
  const to = lineEnd(text, entry.end);
  const tail = endsLine(text, entry.start, to) ? ctx.eol : '';
  return { from: entry.start, to, text: indentLines(ctx, lines, columnOf(text, entry.start), true) + tail };
}

/** Removes exactly an entry's lines; a nested collection it empties becomes `[]` or `{}`. */
export function removeEntry(ctx: SpliceContext, path: FieldPath): TextEdit | null {
  const entry = entryAt(ctx.doc, path);
  if (!entry || entry.slot === null) return null;
  const text = ctx.doc.text;
  const { parent, index } = entry;
  if (parent.items.length === 1 && path.length > 1) {
    return replaceValue(ctx, path.slice(0, -1), isSeq(parent) ? [] : {});
  }
  if (onlySpacesBefore(text, entry.start)) {
    return { from: lineStart(text, entry.start), to: lineEnd(text, entry.end), text: '' };
  }
  // The first entry of a compact `- name: Bite` item shares its line with the `-`.
  const next = index === 0 ? entryOf(parent, 1) : null;
  return next ? { from: entry.start, to: next.start, text: '' } : null;
}

/** Adds `key: value` after the last entry of a block map; the empty path is the top level. */
export function appendPair(ctx: SpliceContext, mapPath: FieldPath, key: FieldKey, value: FieldValue): TextEdit | null {
  const text = ctx.doc.text;
  let at: number;
  let column = 0;
  if (mapPath.length === 0) {
    const first = ctx.doc.root ? entryOf(ctx.doc.root, 0) : null;
    if (first) column = columnOf(text, first.start);
    at = ctx.doc.appendAt;
  } else {
    const map = nodeAt(ctx.doc, mapPath);
    if (!isMap(map) || !isBlockCollection(map)) return null;
    const first = entryOf(map, 0);
    const last = entryOf(map, map.items.length - 1);
    if (!first || !last) return null;
    column = columnOf(text, first.start);
    at = lineEnd(text, last.end);
  }
  const lines = renderPairLines({ key }, value, ctx.style);
  return { from: at, to: at, text: leadingBreak(ctx, at) + indentLines(ctx, lines, column, false) + ctx.eol };
}

/** Inserts an item into a block list so that it ends up at `index`. */
export function insertItem(ctx: SpliceContext, listPath: FieldPath, index: number, item: FieldValue): TextEdit | null {
  const text = ctx.doc.text;
  const list = nodeAt(ctx.doc, listPath);
  if (!isSeq(list) || !isBlockCollection(list) || index < 0 || index > list.items.length) return null;
  const first = entryOf(list, 0);
  const neighbour = entryOf(list, Math.min(index, list.items.length - 1));
  if (!first || !neighbour) return null;
  let at: number;
  if (index < list.items.length) {
    if (!onlySpacesBefore(text, neighbour.start)) return null;
    at = lineStart(text, neighbour.start);
  } else {
    at = lineEnd(text, neighbour.end);
  }
  const lines = renderItemLines(item, ctx.style);
  return { from: at, to: at, text: leadingBreak(ctx, at) + indentLines(ctx, lines, columnOf(text, first.start), false) + ctx.eol };
}

/** Writes another name in place of a top-level key; its value stays as it is. */
export function renameTopLevelKey(ctx: SpliceContext, from: FieldKey, to: FieldKey): TextEdit | null {
  const entry = entryAt(ctx.doc, [from]);
  const range = entry?.key?.range;
  const keyText = renderKey(to);
  if (!range || entry.slot === null || keyText === null) return null;
  return { from: range[0], to: range[1], text: keyText };
}

/** The indentation the note uses, read from its first block list and block map. */
export function detectRenderStyle(doc: FrontmatterDoc): RenderStyle {
  let seq: number | undefined;
  let map: number | undefined;
  const root = doc.root;
  for (let index = 0; root && index < root.items.length; index++) {
    const entry = entryOf(root, index);
    const offset = entry ? nestedOffset(doc.text, entry) : undefined;
    if (offset === undefined) continue;
    if (isSeq(entry?.value)) seq ??= offset;
    else map ??= offset;
  }
  const indent = (seq !== undefined && seq > 0 ? seq : map) ?? DEFAULT_RENDER_STYLE.indent;
  return { indent: indent > 0 ? indent : DEFAULT_RENDER_STYLE.indent, indentSeq: seq === undefined || seq > 0 };
}

function hintFor(node: Node | null): ValueHint {
  if (isCollection(node)) return node.items.length > 0 && isFlowCollection(node) ? { flow: true } : {};
  if (isScalar(node) && typeof node.value === 'string' && node.type) return { scalarType: node.type };
  return {};
}

/** A key's block list or map keeps its own indentation when it is written again. */
function styleOf(ctx: SpliceContext, entry: Entry): RenderStyle {
  const offset = entry.key ? nestedOffset(ctx.doc.text, entry) : undefined;
  if (offset === undefined) return ctx.style;
  if (isSeq(entry.value)) return offset > 0 ? { indent: offset, indentSeq: true } : { ...ctx.style, indentSeq: false };
  return offset > 0 ? { ...ctx.style, indent: offset } : ctx.style;
}

/** How far a block collection under a key starts right of the key. */
function nestedOffset(text: string, entry: Entry): number | undefined {
  if (!isBlockCollection(entry.value)) return undefined;
  const first = entryOf(entry.value, 0);
  return first ? columnOf(text, first.start) - columnOf(text, entry.start) : undefined;
}

function indentLines(ctx: SpliceContext, lines: readonly string[], column: number, firstInPlace: boolean): string {
  const pad = ' '.repeat(column);
  return lines.map((line, index) => (line === '' || (index === 0 && firstInPlace) ? line : pad + line)).join(ctx.eol);
}

function leadingBreak(ctx: SpliceContext, at: number): string {
  return at > 0 && ctx.doc.text.charAt(at - 1) !== '\n' ? ctx.eol : '';
}

function endsLine(text: string, from: number, to: number): boolean {
  return to > from && text.charAt(to - 1) === '\n';
}

function lineStart(text: string, at: number): number {
  return at === 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1;
}

/** `at` if a line starts there, else the start of the next line (or the end of the text). */
function lineEnd(text: string, at: number): number {
  if (at === 0 || text.charAt(at - 1) === '\n') return at;
  const next = text.indexOf('\n', at);
  return next === -1 ? text.length : next + 1;
}

function columnOf(text: string, at: number): number {
  return at - lineStart(text, at);
}

function onlySpacesBefore(text: string, at: number): boolean {
  return /^[ \t]*$/.test(text.slice(lineStart(text, at), at));
}
