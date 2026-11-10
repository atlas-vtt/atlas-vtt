import {
  Document, Scalar, isCollection, isMap, isPair, isScalar, isSeq, parseNoteYamlDocument, visit, type Node, type ToStringOptions,
} from '../../services/noteYaml';
import type { FieldValue } from '../model/templateTypes';

/**
 * YAML text for new values only. The note's own text is never stringified again: the patcher
 * splices what these functions return into it (`yamlSplice.ts`).
 */

/** How the note indents block collections, so new ones look like the old. */
export interface RenderStyle {
  /** Spaces per level. */
  indent: number;
  /** Whether a list under a key is indented (`key:\n  - a`) or flush with it (`key:\n- a`). */
  indentSeq: boolean;
}

export const DEFAULT_RENDER_STYLE: RenderStyle = { indent: 2, indentSeq: true };

/** The look of the node a value replaces. */
export interface ValueHint {
  /** Write a collection in flow style (`[18, 8, 15]`). */
  flow?: boolean;
  /** Keep the quoting or block style of the string replaced where it can hold the new one. */
  scalarType?: Scalar.Type;
}

/** A key as it is written: the old key's own text, or a new key to quote as needed. */
export type KeyText = { source: string } | { key: string };

const PLACEHOLDER_KEY = 'k';

/** `key: value` as block lines at column 0, joined later with the note's line break. */
export function renderPairLines(key: KeyText, value: FieldValue, style: RenderStyle, hint: ValueHint = {}): string[] {
  const keyName = 'source' in key ? PLACEHOLDER_KEY : key.key;
  const keyText = 'source' in key ? key.source : renderKey(keyName);
  if (value === null && keyText !== null) return [`${keyText}:`];
  const lines = render(new Document(new Map([[keyName, value]])), style, hint, pairValue);
  if (!('source' in key)) return lines;
  const [first = '', ...rest] = lines;
  return [key.source + first.slice(PLACEHOLDER_KEY.length), ...rest];
}

/** `- value` as block lines at column 0. */
export function renderItemLines(value: FieldValue, style: RenderStyle, hint: ValueHint = {}): string[] {
  if (value === null) return ['-'];
  return render(new Document([value]), style, hint, firstItem);
}

/** The value as it fits after `key: ` or `- ` on one line ('' for null), or null if it needs lines of its own. */
export function renderInline(value: FieldValue, style: RenderStyle, hint: ValueHint = {}): string | null {
  if (value === null) return '';
  const lines = renderPairLines({ source: PLACEHOLDER_KEY }, value, style, hint);
  const prefix = `${PLACEHOLDER_KEY}: `;
  return lines.length === 1 && lines[0]?.startsWith(prefix) ? lines[0].slice(prefix.length) : null;
}

/** The value as an element of a flow collection (`x`, `"a, b"`, `[1, 2]`), or null if it takes more than a line. */
export function renderFlowElement(value: FieldValue): string | null {
  const lines = render(new Document([value]), DEFAULT_RENDER_STYLE, { flow: true }, (doc) => doc.contents);
  const [text] = lines;
  return lines.length === 1 && text !== undefined ? text.slice(1, -1) : null;
}

/** A key as written before its `:`, or null where it would need the explicit `? ` form. */
export function renderKey(key: string): string | null {
  const lines = render(new Document(new Map([[key, 0]])), DEFAULT_RENDER_STYLE, {}, () => null);
  const first = lines[0];
  return lines.length === 1 && first?.endsWith(': 0') ? first.slice(0, -': 0'.length) : null;
}

function render(
  doc: Document,
  style: RenderStyle,
  hint: ValueHint,
  target: (doc: Document) => Node | null | undefined,
): string[] {
  const node = target(doc);
  if (node && hint.flow && isCollection(node)) node.flow = true;
  if (isScalar(node) && typeof node.value === 'string' && hint.scalarType) {
    const kept = keptScalarType(hint.scalarType, node.value);
    if (kept) node.type = kept;
  }
  quoteYaml11Lookalikes(doc);
  flowTableRows(doc);
  const options: ToStringOptions = {
    lineWidth: 0,
    minContentWidth: 0,
    flowCollectionPadding: false,
    indent: Math.max(1, style.indent),
    indentSeq: style.indentSeq,
  };
  return doc.toString(options).replace(/\n$/, '').split('\n');
}

function pairValue(doc: Document): Node | undefined {
  const value: unknown = isMap(doc.contents) ? doc.contents.items[0]?.value : undefined;
  return isScalar(value) || isCollection(value) ? value : undefined;
}

function firstItem(doc: Document): Node | undefined {
  const item: unknown = isSeq(doc.contents) ? doc.contents.items[0] : undefined;
  return isScalar(item) || isCollection(item) ? item : undefined;
}

/** Single quotes cannot hold a line break on one line; a plain style is yaml's own choice. */
function keptScalarType(type: Scalar.Type, value: string): Scalar.Type | null {
  if (type === Scalar.PLAIN) return null;
  if (type === Scalar.QUOTE_SINGLE && /[\n\r]/.test(value)) return null;
  return type;
}

/**
 * A Table's rows each on one line (`- [Rope, 1]`), and the names of a
 * statblock's own columns (`columns: [Item, Qty]`), as `tableValues` writes
 * them: a list of plain values inside a list, or beside a table's `rows`.
 */
function flowTableRows(doc: Document): void {
  visit(doc, {
    Seq(_key, node, path) {
      if (!node.items.every((item) => isScalar(item))) return;
      const parent = path[path.length - 1];
      const owner = path[path.length - 2];
      const inList = isSeq(parent);
      const tableColumns = isPair(parent) && isScalar(parent.key) && parent.key.value === 'columns' && isMap(owner) && owner.has('rows');
      if (inList || tableColumns) node.flow = true;
    },
  });
}

/**
 * Strings yaml would leave plain, but that YAML 1.1 readers take for something else (`yes`,
 * `on`, `2024-01-01`, `1:30`, `1_000`), are double-quoted, so every reader keeps them strings.
 */
function quoteYaml11Lookalikes(doc: Document): void {
  visit(doc, {
    Scalar(_key, node) {
      if (node.type !== undefined || typeof node.value !== 'string' || /[\n\r]/.test(node.value)) return;
      if (readsAsOtherIn11(node.value)) node.type = Scalar.QUOTE_DOUBLE;
    },
  });
}

/** A string the check cannot read (beyond Atlas' YAML limits, or no YAML) is quoted too. */
function readsAsOtherIn11(value: string): boolean {
  // As `parse` reads it with the log silent: what the document holds, whatever errors it has.
  const doc = parseNoteYamlDocument(value, { version: '1.1', logLevel: 'silent' });
  if (!doc) return true;
  try {
    return doc.toJS() !== value;
  } catch {
    return true;
  }
}
