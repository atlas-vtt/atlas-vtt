import { isPressId } from './gmScreenKeys.ts';
import {
  isCommandName, isFolderName, isGlyphName, isGmScreenDevice, isKeyText, MAX_FOLDER_DEPTH, parseLayout, slotsAt, type GmScreenDevice, type GmScreenLayout,
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

/** One change to a grid. `move` onto a filled slot swaps the two; `rename` names and draws a folder anew. */
export type LayoutEdit =
  | { readonly op: 'put'; readonly at: SlotPath; readonly key: KeyChoice }
  | { readonly op: 'move'; readonly from: SlotPath; readonly to: SlotPath }
  | { readonly op: 'remove'; readonly at: SlotPath }
  | { readonly op: 'rename'; readonly at: SlotPath; readonly name: string; readonly glyph: string };

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
  switch (value.op) {
    case 'put': {
      const at = parseSlotPath(value.at, device);
      const key = parseKeyChoice(value.key);
      return at && key ? { op: 'put', at, key } : null;
    }
    case 'move': {
      const from = parseSlotPath(value.from, device);
      const to = parseSlotPath(value.to, device);
      return from && to ? { op: 'move', from, to } : null;
    }
    case 'remove': {
      const at = parseSlotPath(value.at, device);
      return at ? { op: 'remove', at } : null;
    }
    case 'rename': {
      const at = parseSlotPath(value.at, device);
      return at && isFolderName(value.name) && isGlyphName(value.glyph) ? { op: 'rename', at, name: value.name, glyph: value.glyph } : null;
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

