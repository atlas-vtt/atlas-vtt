import {
  DRAWN_CLASSES, DRAWN_DATA, DRAWN_ELEMENTS, DRAWN_STYLES, MAX_DRAWN_CLASSES, MAX_DRAWN_DEPTH, MAX_DRAWN_DICE, MAX_DRAWN_NODES,
  MAX_DRAWN_TEXT, MAX_GM_SCREEN_MESSAGE, type DrawnElement, type DrawnElementName, type DrawnNode,
} from '../../protocol/index.ts';

/**
 * A drawn statblock as a device is sent it: the elements, classes and texts Atlas drew, from allow-lists alone.
 * This is the boundary between what a note or a layout's script put into the page and what leaves Atlas: element
 * names (`DRAWN_ELEMENTS`), classes (`DRAWN_CLASSES`), data attributes (`DRAWN_DATA`) and inline style properties
 * (`DRAWN_STYLES`) are read one by one, each value checked; nothing else of an element is read. Links become
 * their text, controls become plain elements that show their state, a picture is kept only as the hash of a
 * vault image (`PortraitOf`), and scripts, styles, embedded content and form fields are left out with all
 * they hold.
 */
export interface DrawnTree {
  readonly nodes: readonly DrawnNode[];
  /** More was drawn than one statblock may carry; the rest was left out. */
  readonly cut: boolean;
}

/** The hash of the portrait an `<img>` shows, which the device asks for by it; null to leave the picture out. */
export type PortraitOf = (image: HTMLImageElement) => string | null;

/** What a message of a statblock may take besides its nodes: its type, id and flag. */
const ENVELOPE_BYTES = 256;
/** The UTF-8 bytes of JSON the nodes of one statblock may take, inside one message (`MAX_GM_SCREEN_MESSAGE`). */
export const MAX_DRAWN_BYTES = MAX_GM_SCREEN_MESSAGE - ENVELOPE_BYTES;

/** Elements left out with everything they hold: code, styles, embedded and media content, and form fields. */
const DROPPED: ReadonlySet<string> = new Set([
  'script', 'style', 'link', 'meta', 'base', 'title', 'head', 'template', 'noscript', 'slot', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'param', 'portal', 'audio', 'video', 'source', 'track', 'picture', 'canvas', 'map', 'area',
  'form', 'select', 'textarea', 'option', 'optgroup', 'datalist', 'output', 'progress', 'meter', 'math',
]);
const KEPT: ReadonlySet<string> = new Set(DRAWN_ELEMENTS);
const DICE_LINK = 'atlas-dice-link';
/** What a checkbox becomes: a pip Atlas's stylesheet draws as the checkbox, marked while it is checked. */
const PIP = 'atlas-sb-pip';
const CHECKED = 'is-checked';

/** What becomes of an element by its name: kept as a drawn element, drawn as a span with no children, left out, or its children alone kept. */
type Treatment = { readonly as: DrawnElementName; readonly empty?: boolean } | 'drop' | 'unwrap';

function treatmentOf(element: Element): Treatment {
  const name = element.localName;
  if (KEPT.has(name)) return { as: name as DrawnElementName };
  if (DROPPED.has(name)) return 'drop';
  switch (name) {
    // A control shows and does nothing: its look and its text stay.
    case 'button': return { as: 'span' };
    case 'input': return element.getAttribute('type') === 'checkbox' ? { as: 'span', empty: true } : 'drop';
    // An icon is named by its classes; its drawing is left out.
    case 'svg': return { as: 'span', empty: true };
    case 'del': case 'strike': return { as: 's' };
    case 'ins': return { as: 'u' };
    // Links become their text; anything else unknown (a custom element, `details`) keeps what it holds.
    default: return element.namespaceURI === 'http://www.w3.org/1999/xhtml' ? 'unwrap' : 'drop';
  }
}

/** An element that is not shown: hidden, or hidden by its own style. */
function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  const style = element.getAttribute('style');
  return style !== null && /(^|;)\s*display\s*:\s*none\b/i.test(style);
}

function classesOf(element: Element): string[] {
  const kept = [...element.classList].filter((name) => DRAWN_CLASSES.has(name));
  if (element.localName === 'input') {
    kept.push(PIP);
    if ((element as HTMLInputElement).checked) kept.push(CHECKED);
  }
  return [...new Set(kept)].slice(0, MAX_DRAWN_CLASSES);
}

/** The entries of `allowed` that `read` finds on the element, each where its value matches. */
function hooksOf(allowed: Readonly<Record<string, RegExp>>, read: (name: string) => string | null): Record<string, string> | null {
  const kept = Object.entries(allowed).flatMap(([name, pattern]): [string, string][] => {
    const value = read(name)?.trim();
    return value !== undefined && pattern.test(value) ? [[name, value]] : [];
  });
  return kept.length > 0 ? Object.fromEntries(kept) : null;
}

const styleOf = (element: Element): CSSStyleDeclaration | null => ('style' in element ? (element as HTMLElement).style : null);

const span = (value: number): number | null => (Number.isInteger(value) && value > 1 && value <= 64 ? value : null);

/** The attributes the element keeps, apart from its children; null where it is left out (a picture that is no portrait). */
function attributesOf(element: Element, as: DrawnElementName, portraitOf: PortraitOf): Omit<DrawnElement, 'k'> | null {
  const classes = classesOf(element);
  const data = hooksOf(DRAWN_DATA, (name) => element.getAttribute(`data-${name}`));
  const style = styleOf(element);
  const styles = style === null ? null : hooksOf(DRAWN_STYLES, (name) => style.getPropertyValue(name));
  const kept: { -readonly [K in keyof DrawnElement]: DrawnElement[K] } = { e: as };
  if (classes.length > 0) kept.c = classes;
  if (as === 'img') {
    const portrait = portraitOf(element as HTMLImageElement);
    if (portrait === null) return null;
    kept.src = portrait;
  }
  const formula = element.classList.contains(DICE_LINK) ? element.getAttribute('data-formula') : null;
  if (formula && formula.length <= MAX_DRAWN_DICE) kept.dice = formula;
  if (element.localName === 'td' || element.localName === 'th') {
    const cell = element as HTMLTableCellElement;
    const colspan = span(cell.colSpan);
    const rowspan = span(cell.rowSpan);
    if (colspan !== null) kept.colspan = colspan;
    if (rowspan !== null) kept.rowspan = rowspan;
  }
  if (data) kept.d = data;
  if (styles) kept.s = styles;
  return kept;
}

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** Walks what was drawn once, within the limits of one statblock, and stops at the first it would pass. */
class TreeWriter {
  private nodes = 0;
  private text = 0;
  private bytes = 0;
  cut = false;

  constructor(private readonly portraitOf: PortraitOf) {}

  /** The drawn nodes of `parent`'s children, which lie at `depth` (the top at 1). */
  children(parent: Node, depth: number): DrawnNode[] {
    const out: DrawnNode[] = [];
    for (const child of parent.childNodes) {
      if (this.cut) break;
      if (child.nodeType === child.TEXT_NODE) this.addText(out, child.nodeValue ?? '');
      else if (child.nodeType === child.ELEMENT_NODE) this.addElement(out, child as Element, depth);
    }
    return out;
  }

  private addElement(out: DrawnNode[], element: Element, depth: number): void {
    if (isHidden(element)) return;
    const treatment = treatmentOf(element);
    if (treatment === 'drop') return;
    if (treatment === 'unwrap') {
      for (const node of this.children(element, depth)) {
        if (typeof node === 'string') this.join(out, node);
        else out.push(node);
      }
      return;
    }
    const attributes = attributesOf(element, treatment.as, this.portraitOf);
    if (attributes === null || !this.take(utf8Length(JSON.stringify(attributes)) + ',"k":[]'.length + 1)) return;
    if (treatment.empty || treatment.as === 'br' || treatment.as === 'hr' || treatment.as === 'img' || !element.hasChildNodes()) {
      out.push(attributes);
      return;
    }
    // Deeper than a statblock may go: the element stays, what it holds is left out.
    if (depth >= MAX_DRAWN_DEPTH) {
      this.cut = true;
      out.push(attributes);
      return;
    }
    const children = this.children(element, depth + 1);
    out.push(children.length > 0 ? { ...attributes, k: children } : attributes);
  }

  private addText(out: DrawnNode[], text: string): void {
    if (text === '') return;
    const room = MAX_DRAWN_TEXT - this.text;
    const kept = text.length > room ? text.slice(0, room) : text;
    if (kept.length < text.length) this.cut = true;
    if (kept === '') return;
    const last = out.at(-1);
    // Text next to text is one text, as unwrapped links leave it.
    if (typeof last === 'string') {
      if (!this.takeText(kept, 0)) return;
      out[out.length - 1] = last + kept;
      return;
    }
    if (this.takeText(kept, 1)) out.push(kept);
  }

  /** Joins a text an unwrapped element held onto what precedes it; it was counted when it was read. */
  private join(out: DrawnNode[], text: string): void {
    const last = out.at(-1);
    if (typeof last === 'string') {
      out[out.length - 1] = last + text;
      this.nodes -= 1;
    } else out.push(text);
  }

  private takeText(text: string, nodes: number): boolean {
    if (!this.take(utf8Length(JSON.stringify(text)) + 1, nodes)) return false;
    this.text += text.length;
    return true;
  }

  /** Counts a node of `bytes`; false, and cut, where it would pass a limit. */
  private take(bytes: number, nodes = 1): boolean {
    if (this.nodes + nodes > MAX_DRAWN_NODES || this.bytes + bytes > MAX_DRAWN_BYTES) {
      this.cut = true;
      return false;
    }
    this.nodes += nodes;
    this.bytes += bytes;
    return true;
  }
}

/** The tree of what `root` holds, as a device is sent it. */
export function drawnTree(root: Node, portraitOf: PortraitOf): DrawnTree {
  const writer = new TreeWriter(portraitOf);
  const nodes = writer.children(root, 1);
  return { nodes, cut: writer.cut };
}
