import { IMAGE_MIME_TYPES, isHash } from './asset.ts';
import { isRecord } from './shape.ts';

/**
 * The Statblocks screen's messages: the statblocks of the map the GM has in front, each statblock as Atlas
 * drew it (a tree of plain elements from an allow-list, which the device builds as elements, never as
 * HTML), and portraits by hash.
 */

/** Element names a drawn statblock may hold; any other element is left out with everything in it. */
export const DRAWN_ELEMENTS = [
  'div', 'span', 'p', 'section', 'header', 'footer', 'article', 'aside', 'blockquote', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'sub', 'sup', 'code', 'pre',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'br', 'hr', 'img',
] as const;
export type DrawnElementName = (typeof DRAWN_ELEMENTS)[number];

/** Elements that hold nothing: their children are never read. */
const EMPTY_ELEMENTS: ReadonlySet<string> = new Set(['br', 'hr', 'img']);
const ELEMENTS: ReadonlySet<string> = new Set(DRAWN_ELEMENTS);
const isElementName = (value: string): value is DrawnElementName => ELEMENTS.has(value);

/** What one drawn statblock may hold at most: elements and texts, their nesting, and the characters of all its texts. */
export const MAX_DRAWN_NODES = 5000;
export const MAX_DRAWN_DEPTH = 40;
export const MAX_DRAWN_TEXT = 100_000;
export const MAX_DRAWN_CLASSES = 16;
export const DRAWN_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
/** As long as a formula the dice tool reads. */
export const MAX_DRAWN_DICE = 64;
const MAX_SPAN = 64;

const WORD = /^[a-z][a-z-]{0,31}$/;
const NUMBER = /^\d{1,4}(\.\d{1,6})?$/;
/**
 * The data attributes a drawn element may carry (`data-<name>`), each with the values it may hold: the hooks
 * Atlas's statblock stylesheet selects on. Any other, and a value that does not match, is left out.
 */
export const DRAWN_DATA: Readonly<Record<string, RegExp>> = {
  block: WORD,
  'block-id': /^[A-Za-z0-9_-]{1,64}$/,
  type: WORD,
  look: WORD,
  level: /^[1-6]$/,
  layout: /^[a-z0-9][a-z0-9-]{0,63}$/,
  cls: /^[A-Za-z0-9_-]{1,64}( [A-Za-z0-9_-]{1,64}){0,7}$/,
  align: WORD,
  scrollable: /^(true|false)$/,
  squeezed: /^true$/,
};
/**
 * The inline style properties a drawn element may carry, each with the values it may hold: numbers, lengths,
 * percentages, a keyword or a colour by its hex digits, never a URL or a function. Any other is left out.
 */
export const DRAWN_STYLES: Readonly<Record<string, RegExp>> = {
  '--atlas-token-ring-color': /^#[0-9a-fA-F]{3,8}$/,
  '--atlas-sb-column-width': /^\d{1,3}(\.\d{1,4})?em$/,
  '--atlas-sb-max-columns': NUMBER,
  '--atlas-sb-metric-numbers': NUMBER,
  '--atlas-sb-score-columns': NUMBER,
  '--atlas-sb-gauge-share': NUMBER,
  'text-align': /^(left|right|center|start|end|justify)$/,
  width: /^\d{1,3}(\.\d{1,6})?%$/,
  'max-height': /^\d{1,5}(\.\d{1,4})?px$/,
};

/** The statblocks a list holds at most, and the longest name read. */
export const MAX_STATBLOCK_ENTRIES = 500;
const MAX_NAME = 200;
/** A statblock's id on the screen: Atlas's own, never a vault path. */
const STATBLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Why a statblock cannot be shown, as Atlas names it; the page says each in a sentence of its own. */
const REASON_PATTERN = /^[a-z][a-z-]{0,31}$/;
/** The largest portrait sent, in bytes. */
export const MAX_PORTRAIT_BYTES = 256 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A text, or an element: its name, classes, children, and the few attributes it may carry. */
export type DrawnNode = string | DrawnElement;

export interface DrawnElement {
  readonly e: DrawnElementName;
  readonly c?: readonly string[];
  readonly k?: readonly DrawnNode[];
  /** A roll the element stands for, as its formula. */
  readonly dice?: string;
  /** An `img`'s picture: a portrait by its hash. An `img` without one is left out. */
  readonly src?: string;
  readonly colspan?: number;
  readonly rowspan?: number;
  /** Its data attributes (`DRAWN_DATA`), by name without `data-`. */
  readonly d?: Readonly<Record<string, string>>;
  /** Its inline style (`DRAWN_STYLES`), by property. */
  readonly s?: Readonly<Record<string, string>>;
}

/** A statblock of the map in front, as the list shows it. */
export interface StatblockEntry {
  readonly id: string;
  readonly name: string;
  /** The hash of its portrait, which the device asks for (`portrait-ask`); null without one. */
  readonly portrait: string | null;
  /** How many of the map's tokens it stands for. */
  readonly count: number;
  /** One of its tokens has the turn. */
  readonly turn: boolean;
  /** It fights in the running fight; the entries of a fight come first, in turn order. */
  readonly fight: boolean;
  /** It is a player character's. */
  readonly player: boolean;
}

export type StatblocksMessage =
  /** The statblocks of the map in front, in the DM screen's order with every one listed; `map` is false while no map is in front. */
  | { readonly t: 'statblocks'; readonly map: boolean; readonly entries: readonly StatblockEntry[] }
  /** A statblock as drawn; `cut` when it held more than a drawn statblock may, and the rest was left out. */
  | { readonly t: 'statblock'; readonly id: string; readonly nodes: readonly DrawnNode[]; readonly cut: boolean }
  /** A statblock that cannot be shown, and why. */
  | { readonly t: 'statblock-gone'; readonly id: string; readonly reason: string }
  | { readonly t: 'portrait'; readonly hash: string; readonly mime: string; readonly data: string };

export type StatblocksAsk =
  /** The statblock the device shows now, which Atlas sends again while it changes; null for none. */
  | { readonly t: 'statblock-view'; readonly id: string | null }
  | { readonly t: 'portrait-ask'; readonly hash: string };

const isStatblockId = (value: unknown): value is string => typeof value === 'string' && STATBLOCK_ID_PATTERN.test(value);
const isSpan = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SPAN;

interface Budget {
  nodes: number;
  text: number;
}

/** The entries of `value` that `allowed` names, each where its value matches; null for none. */
function listed(value: unknown, allowed: Readonly<Record<string, RegExp>>): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const kept = Object.entries(value).flatMap(([name, text]): [string, string][] =>
    (Object.hasOwn(allowed, name) && typeof text === 'string' && allowed[name]!.test(text) ? [[name, text]] : []));
  return kept.length > 0 ? Object.fromEntries(kept) : null;
}

/** What a drawn element keeps of its attributes: only those its element may carry, each where it is well formed. */
function attributes(name: string, value: Record<string, unknown>): Omit<DrawnElement, 'e' | 'c' | 'k'> | null {
  const data = listed(value.d, DRAWN_DATA);
  const style = listed(value.s, DRAWN_STYLES);
  const hooks = { ...(data && { d: data }), ...(style && { s: style }) };
  if (name === 'img') return isHash(value.src) ? { src: value.src, ...hooks } : null;
  const dice = typeof value.dice === 'string' && value.dice.length > 0 && value.dice.length <= MAX_DRAWN_DICE ? { dice: value.dice } : {};
  if (name !== 'td' && name !== 'th') return { ...dice, ...hooks };
  return { ...dice, ...(isSpan(value.colspan) && { colspan: value.colspan }), ...(isSpan(value.rowspan) && { rowspan: value.rowspan }), ...hooks };
}

/** Children read into `out`; false where one is malformed or the statblock holds more than it may. */
function readNodes(value: unknown, depth: number, budget: Budget, out: DrawnNode[]): boolean {
  if (!Array.isArray(value) || depth > MAX_DRAWN_DEPTH) return false;
  for (const node of value) {
    budget.nodes += 1;
    if (budget.nodes > MAX_DRAWN_NODES) return false;
    if (typeof node === 'string') {
      budget.text += node.length;
      if (budget.text > MAX_DRAWN_TEXT) return false;
      out.push(node);
      continue;
    }
    if (!isRecord(node) || typeof node.e !== 'string') return false;
    if (!isElementName(node.e)) continue;
    const element = readElement(node, node.e, depth, budget);
    if (element === undefined) return false;
    if (element !== null) out.push(element);
  }
  return true;
}

/** An element; null for one left out (an `img` without a portrait), undefined for a malformed one. */
function readElement(value: Record<string, unknown>, name: DrawnElementName, depth: number, budget: Budget): DrawnElement | null | undefined {
  const kept = attributes(name, value);
  if (kept === null) return null;
  const classes = Array.isArray(value.c) ? value.c.filter((entry): entry is string => typeof entry === 'string' && DRAWN_CLASS_PATTERN.test(entry)).slice(0, MAX_DRAWN_CLASSES) : [];
  const children: DrawnNode[] = [];
  if (!EMPTY_ELEMENTS.has(name) && value.k !== undefined && !readNodes(value.k, depth + 1, budget, children)) return undefined;
  return { e: name, ...(classes.length > 0 && { c: classes }), ...(children.length > 0 && { k: children }), ...kept };
}

/** A drawn statblock's top-level nodes, or null where it is malformed or holds more than `MAX_DRAWN_NODES`, `MAX_DRAWN_DEPTH` or `MAX_DRAWN_TEXT`. */
export function parseDrawnNodes(value: unknown): DrawnNode[] | null {
  const nodes: DrawnNode[] = [];
  return readNodes(value, 1, { nodes: 0, text: 0 }, nodes) ? nodes : null;
}

function parseEntry(value: unknown): StatblockEntry | null {
  if (!isRecord(value) || !isStatblockId(value.id) || typeof value.name !== 'string' || value.name.length > MAX_NAME) return null;
  const { portrait, count, turn, fight, player } = value;
  if (!(portrait === null || isHash(portrait)) || typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 100_000) return null;
  if (typeof turn !== 'boolean' || typeof fight !== 'boolean' || typeof player !== 'boolean') return null;
  return { id: value.id, name: value.name, portrait, count, turn, fight, player };
}

/** A Statblocks message from Atlas, or null for anything malformed. */
export function parseStatblocksMessage(value: Record<string, unknown>): StatblocksMessage | null {
  switch (value.t) {
    case 'statblocks': {
      if (typeof value.map !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > MAX_STATBLOCK_ENTRIES) return null;
      const entries = value.entries.map(parseEntry);
      if (!entries.every((entry): entry is StatblockEntry => entry !== null) || new Set(entries.map((entry) => entry.id)).size !== entries.length) return null;
      return { t: 'statblocks', map: value.map, entries };
    }
    case 'statblock': {
      const nodes = parseDrawnNodes(value.nodes);
      return isStatblockId(value.id) && nodes !== null && typeof value.cut === 'boolean' ? { t: 'statblock', id: value.id, nodes, cut: value.cut } : null;
    }
    case 'statblock-gone':
      return isStatblockId(value.id) && typeof value.reason === 'string' && REASON_PATTERN.test(value.reason) ? { t: 'statblock-gone', id: value.id, reason: value.reason } : null;
    case 'portrait': {
      const { hash, mime, data } = value;
      if (!isHash(hash) || typeof mime !== 'string' || !IMAGE_MIME_TYPES.includes(mime)) return null;
      if (typeof data !== 'string' || data.length === 0 || data.length > 4 * Math.ceil(MAX_PORTRAIT_BYTES / 3) || data.length % 4 !== 0 || !BASE64.test(data)) return null;
      return { t: 'portrait', hash, mime, data };
    }
    default:
      return null;
  }
}

/** A device's ask of the Statblocks screen, or null for anything malformed. */
export function parseStatblocksAsk(value: Record<string, unknown>): StatblocksAsk | null {
  if (value.t === 'statblock-view') return value.id === null || isStatblockId(value.id) ? { t: 'statblock-view', id: value.id } : null;
  if (value.t === 'portrait-ask') return isHash(value.hash) ? { t: 'portrait-ask', hash: value.hash } : null;
  return null;
}
