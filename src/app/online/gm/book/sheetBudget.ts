import {
  MAX_ABILITIES, MAX_GM_FRAME, MAX_SHEET_CHARS, MAX_SHEET_NODES, writtenChars, type AbilityComponent, type AbilityEntry, type SheetNode, type SheetText,
  type SheetValue,
} from '../../protocol/index.ts';

/** Bytes of a frame left for the rest of the message a statblock travels in (envelope, type, keys). */
const FRAME_MARGIN = 16 * 1024;
/** The most bytes a drawn statblock's JSON takes, so its message always fits one GM frame. */
export const MAX_STATBLOCK_BYTES = MAX_GM_FRAME - FRAME_MARGIN;
/** What the sheet's nodes leave for the abilities of a statblock that has some, so a sheet of huge values never crowds out the Abilities tab. */
const ABILITY_BYTES = 32 * 1024;
const ABILITY_CHARS = 10_000;

interface Limits {
  readonly bytes: number;
  readonly chars: number;
}

const WHOLE: Limits = { bytes: MAX_STATBLOCK_BYTES, chars: MAX_SHEET_CHARS };
const BESIDE_ABILITIES: Limits = { bytes: MAX_STATBLOCK_BYTES - ABILITY_BYTES, chars: MAX_SHEET_CHARS - ABILITY_CHARS };

/** What one part of a drawn statblock costs, as the protocol's parser counts it, and its bytes. */
interface Cost {
  readonly nodes: number;
  readonly chars: number;
  readonly abilities: number;
  readonly bytes: number;
}

/** The UTF-8 bytes of a value's JSON. */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const textChars = (text: SheetText): number => text.opening.length;

/** What a value spends of the parser's text budget: its opening, then its label and words together. */
function valueChars(value: SheetValue): number {
  return textChars(value.text) + [value.label ?? '', ...(value.words ?? [])].join('').length;
}

/** What a node itself spends, children aside (they are taken on their own). */
function ownChars(node: SheetNode): number {
  switch (node.k) {
    case 'value': return valueChars(node.value);
    case 'metric': return node.values.reduce((sum, value) => sum + valueChars(value), 0);
    case 'heading': return node.text.length;
    case 'table': return JSON.stringify([node.columns, node.rows, node.worked]).length + (node.workedLabels ?? []).join('').length;
    case 'counters': return node.counters.map((row) => row.name + (row.reset ?? '') + (row.regain ?? '')).join('').length;
    default: return 0;
  }
}

/**
 * The budget a drawn statblock is built within: what the page's parser allows it (nodes, characters
 * of text, abilities) and the bytes of one GM frame. The builder takes each part in the order the
 * parser reads them (sigils, the sheet's nodes depth first, then the abilities) and leaves out what
 * no longer fits, so it never sends what the page refuses. The sheet is cut at the first node that
 * does not fit: every node after it is left out too (`droppedNodes`), never a hole here and there.
 * Where the statblock has abilities, the nodes leave them room (`reserveForAbilities`).
 */
export class SheetBudget {
  private nodes = 0;
  private chars = 0;
  private abilities = 0;
  private bytes = 0;
  private nodeLimits = WHOLE;
  private cut = false;
  /** How many nodes the sheet was cut by. */
  droppedNodes = 0;

  /** Takes a cost if it fits within `limits`, and says whether it did. */
  private take(cost: Cost, limits: Limits = WHOLE): boolean {
    const fits = this.nodes + cost.nodes <= MAX_SHEET_NODES && this.chars + cost.chars <= limits.chars
      && this.abilities + cost.abilities <= MAX_ABILITIES && this.bytes + cost.bytes <= limits.bytes;
    if (!fits) return false;
    this.nodes += cost.nodes;
    this.chars += cost.chars;
    this.abilities += cost.abilities;
    this.bytes += cost.bytes;
    return true;
  }

  /** A sigil or another value outside the nodes. */
  takeValue(value: SheetValue): boolean {
    return this.take({ nodes: 0, chars: valueChars(value), abilities: 0, bytes: jsonBytes(value) });
  }

  /** Whether the sheet's nodes leave room for abilities: only a statblock that has some keeps it. */
  reserveForAbilities(reserve: boolean): void {
    this.nodeLimits = reserve ? BESIDE_ABILITIES : WHOLE;
  }

  /** A node, counted alone: a container's children are taken on their own, so only its frame counts here. False from the first that does not fit on. */
  takeNode(node: SheetNode): boolean {
    const own = node.k === 'section' || node.k === 'row' ? { ...node, nodes: [] } : node.k === 'tabs' ? { ...node, tabs: [] } : node;
    this.cut ||= !this.take({ nodes: 1, chars: ownChars(node), abilities: 0, bytes: jsonBytes(own) }, this.nodeLimits);
    if (this.cut) this.droppedNodes += 1;
    return !this.cut;
  }

  /** A component's frame (name, parts, the tabs' labels and intros), its entries aside. */
  takeFrame(frame: AbilityComponent): boolean {
    const chars = frame.tabs.reduce((sum, tab) => sum + (tab.intro ? textChars(tab.intro) : 0), 0) + (frame.heading ?? '').length + (frame.section ?? '').length;
    return this.take({ nodes: 0, chars, abilities: 0, bytes: jsonBytes(frame) });
  }

  /** One ability: its name, text and parts, and what differs as written, as the parser counts them. */
  takeAbility(entry: AbilityEntry): boolean {
    const written = entry.written === undefined ? 0 : (entry.written.text ? textChars(entry.written.text) : 0) + writtenChars(entry.written).length;
    return this.take({ nodes: 0, chars: textChars(entry.text) + entry.name.length + JSON.stringify(entry.parts).length + written, abilities: 1, bytes: jsonBytes(entry) });
  }
}
