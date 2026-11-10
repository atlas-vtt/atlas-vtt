import {
  isAlias, isCollection, isMap, isPair, isScalar, isSeq, noteYamlTokens, parseNoteYamlDocument,
  type CST, type Node, type Pair, type Scalar, type YAMLMap, type YAMLSeq,
} from '../../services/noteYaml';
import type { FieldValue } from '../model/templateTypes';
import type { FieldPath } from './patchTypes';

/**
 * A frontmatter's YAML text, parsed with its source tokens, plus what it reads as. Only
 * documents Obsidian reads without complaint and Atlas can address unambiguously are read.
 */
export interface FrontmatterDoc {
  readonly text: string;
  /** The top-level block map; null while the frontmatter holds no key. */
  readonly root: YAMLMap | null;
  readonly model: FrontmatterModel;
  /** Where a new top-level key goes: before a `...` end marker, else at the end. */
  readonly appendAt: number;
}

export type FrontmatterModel = { [key: string]: FieldValue };

export type Collection = YAMLMap | YAMLSeq;

/** One key of a map or one item of a list, with the offsets an edit needs. */
export interface Entry {
  readonly parent: Collection;
  readonly index: number;
  /** The key of a map entry. */
  readonly key: Scalar | null;
  readonly value: Node | null;
  /** Offset of the key, of a block item's `-`, or of a flow item. */
  readonly start: number;
  /** Offset just after the `:` or `-` of a block entry; null inside a flow collection. */
  readonly slot: number | null;
  /** End of the value's text, before a trailing comment. */
  readonly end: number;
}

/**
 * Parses frontmatter YAML; null when it is beyond what Atlas reads as YAML, has errors, duplicate
 * or complex keys, or is no block map.
 */
export function readFrontmatterDoc(text: string): FrontmatterDoc | null {
  const doc = parseNoteYamlDocument(text, { keepSourceTokens: true });
  if (!doc || doc.errors.length > 0) return null;
  const contents = doc.contents;
  if (contents !== null && !(isMap(contents) && contents.srcToken?.type === 'block-map')) return null;
  if (contents !== null && !keysAreSound(contents)) return null;
  let model: unknown;
  try {
    model = doc.toJS();
  } catch {
    return null;
  }
  model ??= {};
  if (!isFieldValue(model) || typeof model !== 'object' || model === null || Array.isArray(model)) return null;
  return { text, root: contents, model, appendAt: documentEndOffset(text) ?? text.length };
}

/** The node at a path; undefined where nothing is (or an alias stands in the way). */
export function nodeAt(doc: FrontmatterDoc, path: FieldPath): Node | undefined {
  let node: Node | null | undefined = doc.root ?? undefined;
  for (const segment of path) {
    if (!node || isAlias(node)) return undefined;
    if (typeof segment === 'number') node = isSeq(node) ? asNode(node.items[segment]) : undefined;
    else node = isMap(node) ? asNode(pairOf(node, segment)?.value) : undefined;
  }
  return node ?? undefined;
}

/** The entry a non-empty path names: its last segment in the collection the rest names. */
export function entryAt(doc: FrontmatterDoc, path: FieldPath): Entry | null {
  if (path.length === 0) return null;
  const parent = path.length === 1 ? doc.root : nodeAt(doc, path.slice(0, -1));
  const segment = path[path.length - 1];
  if (typeof segment === 'number' && isSeq(parent)) return entryOf(parent, segment);
  if (typeof segment === 'string' && isMap(parent)) {
    const index = parent.items.findIndex((pair) => keyName(pair) === segment);
    return index < 0 ? null : entryOf(parent, index);
  }
  return null;
}

/** The entry at an index of a collection, located through its source tokens. */
export function entryOf(parent: Collection, index: number): Entry | null {
  const token = parent.srcToken;
  if (isMap(parent)) {
    const pair = parent.items[index];
    const key = pair?.key;
    if (!pair || !isScalar(key) || !key.range) return null;
    const value = asNode(pair.value) ?? null;
    if (token?.type === 'flow-collection') return flowEntry(parent, index, key, value, key.range[0]);
    const indicator = pair.srcToken?.sep?.find((part) => part.type === 'map-value-ind');
    if (!indicator || pair.srcToken?.start.some((part) => part.type === 'explicit-key-ind')) return null;
    const slot = indicator.offset + 1;
    return { parent, index, key, value, start: key.range[0], slot, end: value?.range?.[1] ?? slot };
  }
  const value = asNode(parent.items[index]);
  if (!value?.range) return null;
  if (token?.type === 'flow-collection') return flowEntry(parent, index, null, value, value.range[0]);
  if (token?.type !== 'block-seq') return null;
  const dashes = token.items.flatMap((item) => item.start.filter((part) => part.type === 'seq-item-ind'));
  const dash = dashes.length === parent.items.length ? dashes[index] : undefined;
  if (!dash) return null;
  return { parent, index, key: null, value, start: dash.offset, slot: dash.offset + 1, end: value.range[1] };
}

/** Whether a node is a block (not flow) collection with at least one entry. */
export function isBlockCollection(node: Node | null | undefined): node is Collection {
  const type = isCollection(node) ? node.srcToken?.type : undefined;
  return (type === 'block-map' || type === 'block-seq') && isCollection(node) && node.items.length > 0;
}

export function isFlowCollection(node: Node | null | undefined): node is Collection {
  return isCollection(node) && node.srcToken?.type === 'flow-collection';
}

export function keyName(pair: Pair): string | null {
  return isScalar(pair.key) ? String(pair.key.value) : null;
}

function flowEntry(parent: Collection, index: number, key: Scalar | null, value: Node | null, start: number): Entry | null {
  const end = value?.range?.[1];
  return end === undefined ? null : { parent, index, key, value, start, slot: null, end };
}

function pairOf(map: YAMLMap, key: string): Pair | undefined {
  return map.items.find((pair) => keyName(pair) === key);
}

function asNode(value: unknown): Node | undefined {
  return isScalar(value) || isCollection(value) || isAlias(value) ? value : undefined;
}

/** Every key is a scalar, no two read as the same string key, and none is `__proto__`. */
function keysAreSound(node: unknown): boolean {
  if (isSeq(node)) return node.items.every(keysAreSound);
  if (!isMap(node)) return true;
  const seen = new Set<string>();
  for (const pair of node.items) {
    const name = isPair(pair) ? keyName(pair) : null;
    if (name === null || name === '__proto__' || seen.has(name)) return false;
    seen.add(name);
    if (!keysAreSound(pair.value)) return false;
  }
  return true;
}

function isFieldValue(value: unknown): value is FieldValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isFieldValue);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(isFieldValue);
}

function documentEndOffset(text: string): number | null {
  for (const token of noteYamlTokens(text)) if (isDocumentEnd(token)) return token.offset;
  return null;
}

function isDocumentEnd(token: CST.Token): token is CST.DocumentEnd {
  return token.type === 'doc-end';
}
