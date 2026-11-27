import { isPressId } from './gmScreenKeys.ts';
import {
  isCommandName, isFolderName, isForeignKey, isGlyphName, isGmScreenDevice, isKeyText, MAX_FOLDER_DEPTH, parseLayout, slotsAt, type GmScreenDevice, type GmScreenLayout, type LayoutSlot,
} from './gmScreenLayout.ts';
import { isRecord } from './shape.ts';

/**
 * How a device and Atlas agree on the Keys screen's grid: the device says which kind it is and gets that
 * kind's grid, on every opening; it sends one change at a time, which Atlas applies or refuses and answers,
 * and every device of that kind then gets the grid again. A grid with folders is larger than a device's
 * message may be, so a device never sends one. An Atlas or a page that does not know these messages ignores
 * them: the page keeps its long list of keys.
 */

/**
 * A slot named by its places: the place in the device's grid, then the place in each folder below it. In a
 * folder a place counts the slots after Back, so its first slot is 0. Only `parseLayoutEdit` makes one, and
 * every place lies inside its grid; whether the slots it passes are folders is for Atlas to find.
 */
export type SlotPath = readonly number[] & { readonly '~parsed': true };

/** What a device asks to put into a slot; Atlas makes the key, with the names of its own library and an empty folder. */
export type KeyChoice =
  | { readonly k: 'command'; readonly command: string }
  | { readonly k: 'mood'; readonly id: string }
  | { readonly k: 'roll'; readonly id: string }
  | { readonly k: 'dice'; readonly formula: string }
  | { readonly k: 'moods' }
  | { readonly k: 'folder'; readonly name: string; readonly glyph: string };

/**
 * What lay along a slot's path as a device saw it (`pathPrint`), so Atlas can tell an edit made on a grid that changed since.
 * A device sends it where it knows it; an edit without it acts on whatever lies there, as from a page before prints.
 */
export type SlotPrint = string & { readonly '~print': true };

/**
 * One change to a grid. `move` onto a filled slot swaps the two; `rename` names and draws a folder anew. `held` is
 * what the device saw along the path of the slot it acts on (`at`, or `from` for a move), `there` along a move's `to`.
 */
export type LayoutEdit =
  | { readonly op: 'put'; readonly at: SlotPath; readonly key: KeyChoice; readonly held?: SlotPrint }
  | { readonly op: 'move'; readonly from: SlotPath; readonly to: SlotPath; readonly held?: SlotPrint; readonly there?: SlotPrint }
  | { readonly op: 'remove'; readonly at: SlotPath; readonly held?: SlotPrint }
  | { readonly op: 'rename'; readonly at: SlotPath; readonly name: string; readonly glyph: string; readonly held?: SlotPrint };

/** Why Atlas refused a change; the page says each in a sentence of its own. */
export const LAYOUT_REFUSALS = [
  /** The device never said which kind it is. */
  'no-layout',
  /** No change this version reads, or a place outside its grid. */
  'malformed',
  /** A slot on the way is no folder. */
  'no-slot',
  /** A folder would lie deeper than `MAX_FOLDER_DEPTH`. */
  'too-deep',
  /** A folder would go into itself. */
  'into-itself',
  /** The grid holds `MAX_LAYOUT_KEYS`. */
  'full',
  /** `rename` names a slot that holds no folder. */
  'not-folder',
  'unknown-command',
  'unknown-glyph',
  'no-mood',
  'no-roll',
  /** The dice tool would not roll the formula. */
  'bad-formula',
  /** A slot on the way, or the slot or anything in it, is not what the device saw (`held`, `there`): another device or Atlas changed it first. */
  'changed',
] as const;
export type LayoutRefusal = (typeof LAYOUT_REFUSALS)[number];

/** A device says which kind it is: Atlas answers with that kind's grid. Sent on every opening. */
export interface LayoutAsk {
  readonly t: 'layout-ask';
  readonly device: GmScreenDevice;
}

/** A device's change: `edit` is read by `parseLayoutEdit` on Atlas's side, so one it cannot read is still answered. `id` comes back in the answer. */
export interface LayoutEditMessage {
  readonly t: 'layout-edit';
  readonly id: number;
  readonly edit: Readonly<Record<string, unknown>>;
}

export type LayoutDeviceMessage = LayoutAsk | LayoutEditMessage;

export type LayoutMessage =
  /** The grid of the device's kind, whole: on every opening, and after every change by any device of that kind or in Atlas. */
  | { readonly t: 'layout'; readonly device: GmScreenDevice; readonly layout: GmScreenLayout }
  /** Atlas applied change `id`, or refused it and says why. */
  | { readonly t: 'layout-answer'; readonly id: number; readonly refused: string | null };

const REFUSAL_PATTERN = /^[a-z][a-z-]{0,31}$/;
const PRINT_PATTERN = /^[0-9a-z]{1,7}\.[0-9a-z]{1,7}$/;

/** `value` with each object's fields in one order, so the same data writes the same on both sides. */
function inOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inOrder);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().map((name) => [name, inOrder(value[name])]);
}

/**
 * What names a slot's key: its kind and what it is, a folder with everything it holds, and a key of a newer kind by all of
 * its own data. Atlas's folder of all moods is named by its kind alone: Atlas fills it, so a change of its library changes no print.
 */
function slotIdentity(slot: LayoutSlot): unknown {
  if (slot === null) return [];
  if (isForeignKey(slot)) return ['?', inOrder(slot)];
  switch (slot.k) {
    case 'command':
      return [slot.k, slot.command];
    case 'mood':
    case 'roll':
      return [slot.k, slot.id];
    case 'dice':
      return [slot.k, slot.formula];
    case 'moods':
      return [slot.k];
    case 'folder':
      return [slot.k, slot.name, slot.glyph, slot.slots.map(slotIdentity)];
  }
}

/** A slot's print: a few characters that tell what lies there (`slotIdentity`) from anything else, the same on both sides. */
export function slotPrint(slot: LayoutSlot): SlotPrint {
  const text = JSON.stringify(slotIdentity(slot));
  let a = 0x811c9dc5;
  let b = 0x9e3779b9 ^ text.length;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995);
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}` as SlotPrint;
}

/**
 * The print of what lies along `path` in `slots`, a grid as the device was sent it (`shownLayout`): the slot at its first
 * place with everything it holds, so it covers every folder on the way and everything beneath the slot `path` names. An
 * edit made on it is refused where anything else in that slot changed too, which is safe. Undefined where the way is gone.
 */
export function pathPrint(slots: readonly LayoutSlot[], path: readonly number[]): SlotPrint | undefined {
  const [first, ...rest] = path;
  const top = first === undefined ? undefined : slots[first];
  let slot = top;
  for (const place of rest) {
    if (slot == null || isForeignKey(slot) || slot.k !== 'folder') return undefined;
    slot = slot.slots[place];
  }
  return top === undefined || slot === undefined ? undefined : slotPrint(top);
}

/** The prints an edit names, only those it names; null where one it names is none. */
function parsePrints(value: Record<string, unknown>, names: readonly ('held' | 'there')[]): { held?: SlotPrint; there?: SlotPrint } | null {
  const prints: { held?: SlotPrint; there?: SlotPrint } = {};
  for (const name of names) {
    const print = value[name];
    if (print === undefined) continue;
    if (typeof print !== 'string' || !PRINT_PATTERN.test(print)) return null;
    prints[name] = print as SlotPrint;
  }
  return prints;
}

function parseSlotPath(value: unknown, device: GmScreenDevice): SlotPath | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FOLDER_DEPTH + 1) return null;
  const inside = value.every((place, depth) => typeof place === 'number' && Number.isInteger(place) && place >= 0 && place < slotsAt(device, depth));
  return inside ? (value.slice() as unknown as SlotPath) : null;
}

function parseKeyChoice(value: unknown): KeyChoice | null {
  if (!isRecord(value)) return null;
  switch (value.k) {
    case 'command':
      return isCommandName(value.command) ? { k: 'command', command: value.command } : null;
    case 'mood':
      return isKeyText(value.id) ? { k: 'mood', id: value.id } : null;
    case 'roll':
      return isKeyText(value.id) ? { k: 'roll', id: value.id } : null;
    case 'dice':
      return isKeyText(value.formula) ? { k: 'dice', formula: value.formula } : null;
    case 'moods':
      return { k: 'moods' };
    case 'folder':
      return isFolderName(value.name) && isGlyphName(value.glyph) ? { k: 'folder', name: value.name, glyph: value.glyph } : null;
    default:
      return null;
  }
}

/** A change to `device`'s grid, or null for anything that is none. */
export function parseLayoutEdit(value: unknown, device: GmScreenDevice): LayoutEdit | null {
  if (!isRecord(value)) return null;
  const prints = parsePrints(value, value.op === 'move' ? ['held', 'there'] : ['held']);
  if (prints === null) return null;
  switch (value.op) {
    case 'put': {
      const at = parseSlotPath(value.at, device);
      const key = parseKeyChoice(value.key);
      return at && key ? { op: 'put', at, key, ...prints } : null;
    }
    case 'move': {
      const from = parseSlotPath(value.from, device);
      const to = parseSlotPath(value.to, device);
      return from && to ? { op: 'move', from, to, ...prints } : null;
    }
    case 'remove': {
      const at = parseSlotPath(value.at, device);
      return at ? { op: 'remove', at, ...prints } : null;
    }
    case 'rename': {
      const at = parseSlotPath(value.at, device);
      return at && isFolderName(value.name) && isGlyphName(value.glyph) ? { op: 'rename', at, name: value.name, glyph: value.glyph, ...prints } : null;
    }
    default:
      return null;
  }
}

/** A device's layout message, or null for anything else. */
export function parseLayoutDeviceMessage(value: Record<string, unknown>): LayoutDeviceMessage | null {
  if (value.t === 'layout-ask') return isGmScreenDevice(value.device) ? { t: 'layout-ask', device: value.device } : null;
  if (value.t === 'layout-edit') return isPressId(value.id) && isRecord(value.edit) ? { t: 'layout-edit', id: value.id, edit: value.edit } : null;
  return null;
}

/** Atlas's layout message, or null for anything else. */
export function parseLayoutMessage(value: Record<string, unknown>): LayoutMessage | null {
  if (value.t === 'layout') {
    if (!isGmScreenDevice(value.device)) return null;
    const layout = parseLayout(value.layout, value.device);
    return layout === null ? null : { t: 'layout', device: value.device, layout };
  }
  if (value.t === 'layout-answer') {
    if (!isPressId(value.id) || !(value.refused === null || (typeof value.refused === 'string' && REFUSAL_PATTERN.test(value.refused)))) return null;
    return { t: 'layout-answer', id: value.id, refused: value.refused };
  }
  return null;
}

