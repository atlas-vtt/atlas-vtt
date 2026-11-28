import { isRecord } from './shape.ts';

/**
 * The Keys screen's grid as the GM fills it, one for each kind of device: a fixed number of square slots,
 * each empty or holding one key, and folders that open a grid of their own. Atlas keeps it as the GM's
 * preference and sends it whole; a device sends changes to it, never the grid (`gmScreenLayoutEdits.ts`).
 *
 * The reader below makes a legal grid from anything: a slot it cannot read is empty, a folder too deep or a
 * key past the most a grid holds is left out. A key of a kind this version does not know is kept as it
 * came, so a newer Atlas's key survives this one saving the grid: every such key up to `MAX_FOREIGN_KEY`
 * characters of JSON, which a newer Atlas keeps each key it adds within. A device is sent such a key whole
 * up to `MAX_SHOWN_FOREIGN_KEY` and as its kind alone beyond (`shownLayout`), so a grid fits one message.
 */

export const GM_SCREEN_DEVICES = ['phone', 'tablet'] as const;
export type GmScreenDevice = (typeof GM_SCREEN_DEVICES)[number];

/**
 * Slots of a device's grid. A folder's grid is as large, and its first place is Back, which the page draws
 * and nothing stores: a folder holds one slot fewer.
 */
export const GRID_SLOTS: Readonly<Record<GmScreenDevice, number>> = { phone: 15, tablet: 20 };
/** A folder in the grid is one deep, a folder in it two; none goes deeper than this. */
export const MAX_FOLDER_DEPTH = 3;
/** Keys in one grid, its folders' keys and the folders themselves counted: the grid fits one message of Atlas. */
export const MAX_LAYOUT_KEYS = 300;
/** Longest folder name. */
export const MAX_FOLDER_NAME = 40;
/** Longest id, last known name or dice formula. */
export const MAX_KEY_TEXT = 200;
/**
 * Most characters of a key of a kind this version does not know, as JSON, that a grid keeps; a larger one, or
 * one nested too deep to be written, is left out, so a hand-edited settings file never stops Atlas loading.
 */
export const MAX_FOREIGN_KEY = 16_384;
/** Most characters of such a key, as JSON, that a device is sent whole; it gets a larger one as its kind alone. */
export const MAX_SHOWN_FOREIGN_KEY = 1000;

/**
 * The keys a slot may hold by name: the Keys screen's keys that need nothing more. Each presses the sound
 * remote's command of that name (`RemoteCommand`), except `handout`, which takes a shown handout back and
 * otherwise shows players the image under the computer's pointer, as the Stream Deck's key does.
 */
export const KEY_COMMANDS = [
  'stopAll', 'pause', 'nextMood', 'nextTrack', 'previousTrack', 'shuffle', 'repeat', 'muteMusic',
  'combat', 'rollInitiative', 'present', 'freeze', 'curtain', 'handout', 'shareRolls', 'playerWindow',
] as const;
export type KeyCommand = (typeof KEY_COMMANDS)[number];

/** The glyphs a folder may show; the page draws them. */
export const FOLDER_GLYPHS = ['folder', 'music', 'swords', 'skull', 'dice', 'map', 'star', 'moon', 'flame', 'shield'] as const;
export type FolderGlyph = (typeof FOLDER_GLYPHS)[number];

/** A command by its name; one this version does not know is kept and shown as a key it cannot press. */
export interface CommandKey {
  readonly k: 'command';
  readonly command: string;
}

/** A mood by id, with its name as it was when the key was placed: what the key shows once the mood is gone. */
export interface MoodKey {
  readonly k: 'mood';
  readonly id: string;
  readonly name: string;
}

/** A saved roll of the map in front's collection by id, with its last known name. */
export interface RollKey {
  readonly k: 'roll';
  readonly id: string;
  readonly name: string;
}

/** A roll of the dice tray, as its formula: `1d20`, `2d6+3`. */
export interface DiceKey {
  readonly k: 'dice';
  readonly formula: string;
}

/** A folder Atlas fills: every mood of the library, in the library's order (the `moods` message). */
export interface AllMoodsKey {
  readonly k: 'moods';
}

/** A folder: a name, a glyph, and `GRID_SLOTS - 1` slots after its Back. */
export interface FolderKey {
  readonly k: 'folder';
  readonly name: string;
  readonly glyph: string;
  readonly slots: readonly LayoutSlot[];
}

export type LayoutKey = CommandKey | MoodKey | RollKey | DiceKey | AllMoodsKey | FolderKey;

/**
 * A key of a kind a newer version made, kept field for field as it came; only the reader makes one. Its brand
 * is a property name, not a unique symbol, so the type compares by its shape wherever this file is compiled.
 */
export type ForeignKey = Readonly<Record<string, unknown>> & { readonly k: string; readonly '~foreign': true };

export type LayoutSlot = LayoutKey | ForeignKey | null;

/** One device kind's grid: exactly `GRID_SLOTS` slots. */
export interface GmScreenLayout {
  readonly slots: readonly LayoutSlot[];
}

const KNOWN_KINDS: ReadonlySet<string> = new Set<LayoutKey['k']>(['command', 'mood', 'roll', 'dice', 'moods', 'folder']);
const KIND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const COMMAND_PATTERN = /^[A-Za-z]{1,32}$/;
const GLYPH_PATTERN = /^[a-z0-9-]{1,32}$/;

export const isGmScreenDevice = (value: unknown): value is GmScreenDevice => value === 'phone' || value === 'tablet';
export const isKeyCommand = (value: string): value is KeyCommand => (KEY_COMMANDS as readonly string[]).includes(value);
export const isFolderGlyph = (value: string): value is FolderGlyph => (FOLDER_GLYPHS as readonly string[]).includes(value);
export const isForeignKey = (slot: LayoutSlot): slot is ForeignKey => slot !== null && !KNOWN_KINDS.has(slot.k);

/** Slots of a grid `depth` folders down: the device's grid at 0, one fewer in any folder. */
export const slotsAt = (device: GmScreenDevice, depth: number): number => GRID_SLOTS[device] - (depth > 0 ? 1 : 0);

export const isKeyText = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= MAX_KEY_TEXT;
export const isCommandName = (value: unknown): value is string => typeof value === 'string' && COMMAND_PATTERN.test(value);
const isKeyName = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_KEY_TEXT;
export const isFolderName = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 1 && value.length <= MAX_FOLDER_NAME;
export const isGlyphName = (value: unknown): value is string => typeof value === 'string' && GLYPH_PATTERN.test(value);

/** Reads in reading order, a folder's slots right after the folder, and counts the keys so a grid stops at `MAX_LAYOUT_KEYS`. */
class LayoutReader {
  private keys = 0;
  private readonly device: GmScreenDevice;

  constructor(device: GmScreenDevice) {
    this.device = device;
  }

  slots(value: unknown, depth: number): LayoutSlot[] {
    const size = slotsAt(this.device, depth);
    const given = Array.isArray(value) ? value.slice(0, size) : [];
    return Array.from({ length: size }, (_, index) => this.slot(given[index], depth));
  }

  /** A key takes its place before a folder's slots are read, so a folder never stands without its own. */
  private slot(value: unknown, depth: number): LayoutSlot {
    if (this.keys >= MAX_LAYOUT_KEYS) return null;
    this.keys += 1;
    const key = this.key(value, depth);
    if (key === null) this.keys -= 1;
    return key;
  }

  private key(value: unknown, depth: number): LayoutSlot {
    if (!isRecord(value) || typeof value.k !== 'string' || !KIND_PATTERN.test(value.k)) return null;
    switch (value.k) {
      case 'command':
        return isCommandName(value.command) ? { k: 'command', command: value.command } : null;
      case 'mood':
        return isKeyText(value.id) && isKeyName(value.name) ? { k: 'mood', id: value.id, name: value.name } : null;
      case 'roll':
        return isKeyText(value.id) && isKeyName(value.name) ? { k: 'roll', id: value.id, name: value.name } : null;
      case 'dice':
        return isKeyText(value.formula) ? { k: 'dice', formula: value.formula } : null;
      case 'moods':
        return { k: 'moods' };
      case 'folder':
        if (depth >= MAX_FOLDER_DEPTH || !isFolderName(value.name) || !isGlyphName(value.glyph)) return null;
        return { k: 'folder', name: value.name, glyph: value.glyph, slots: this.slots(value.slots, depth + 1) };
      default:
        return foreignKey(value);
    }
  }
}

/** Characters of `value` as JSON; null for a value that cannot be written (nested too deep, or a cycle). */
function jsonLength(value: unknown): number | null {
  try {
    return JSON.stringify(value)?.length ?? null;
  } catch {
    return null;
  }
}

function foreignKey(value: Record<string, unknown>): ForeignKey | null {
  const length = jsonLength(value);
  return length !== null && length <= MAX_FOREIGN_KEY ? (value as ForeignKey) : null;
}

/** A grid for `device` from anything that holds a `slots` list; null for anything else. */
export function parseLayout(value: unknown, device: GmScreenDevice): GmScreenLayout | null {
  if (!isRecord(value) || !Array.isArray(value.slots)) return null;
  return { slots: new LayoutReader(device).slots(value.slots, 0) };
}

/** `layout` as a device is sent it: a key of a kind this version does not know larger than `MAX_SHOWN_FOREIGN_KEY` as its kind alone. */
export function shownLayout(layout: GmScreenLayout): GmScreenLayout {
  const shown = (slots: readonly LayoutSlot[]): LayoutSlot[] => slots.map((slot): LayoutSlot => {
    if (slot === null) return null;
    if (isForeignKey(slot)) return (jsonLength(slot) ?? Infinity) <= MAX_SHOWN_FOREIGN_KEY ? slot : ({ k: slot.k } as ForeignKey);
    return slot.k === 'folder' ? { ...slot, slots: shown(slot.slots) } : slot;
  });
  return { slots: shown(layout.slots) };
}

/** The keys a grid holds, every folder and the keys in folders counted. */
export function layoutKeyCount(slots: readonly LayoutSlot[]): number {
  return slots.reduce((count, slot) => {
    if (slot === null) return count;
    return count + 1 + (!isForeignKey(slot) && slot.k === 'folder' ? layoutKeyCount(slot.slots) : 0);
  }, 0);
}
