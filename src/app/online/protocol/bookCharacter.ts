import { parseAsset, type AssetRef } from './asset.ts';
import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { isPlainKey } from './sheetValues.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** What a sheet holds at most: the six resources a token shows, and the numbers its statblock tracks. */
export const MAX_SHEET_RESOURCES = 32;
/** The longest key a sheet names a resource by. */
export const MAX_RESOURCE_KEY = 64;

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
const DIRECTIONS: readonly unknown[] = ['drains', 'fills', 'static'];

/** A resource of the player's own character, by name: what its bar shows, as a number too. */
export interface SheetResource {
  /** What the GM's Atlas knows the resource by, which a player's edit names; null from a GM that names none. */
  readonly key: string | null;
  readonly name: string;
  readonly colour: string;
  readonly direction: 'drains' | 'fills' | 'static';
  readonly current: number;
  readonly max: number;
  /** Whether the player may change `current` (`book-resource`): never without a key, never for a fixed value; false from a GM that does not say. */
  readonly editable: boolean;
  /**
   * Whether the player may change `max` (`book-resource` with `max`; a fixed value's one number is
   * its maximum): never without a key, never where a formula works it out; false from a GM that does
   * not say, or one below `RESOURCE_MAX_GM_LEVEL`.
   */
  readonly maxEditable: boolean;
}

/** The character a player plays: the token the GM linked to them, as little as a sheet needs. */
export interface BookCharacter {
  readonly name: string;
  /** The token's artwork, asked for by hash like the map. */
  readonly art: AssetRef | null;
  /** The colour of the token's ring; null for artwork shown unframed. */
  readonly ring: string | null;
  readonly resources: readonly SheetResource[];
}

/**
 * A player sets the current value of one of their character's resources; the GM's Atlas clamps it to
 * the resource's range. With `max` they set its maximum too (a whole number), and `current` is the
 * value kept within it; a GM below `RESOURCE_MAX_GM_LEVEL` reads the current value alone.
 */
export interface BookResourceMessage {
  readonly t: 'book-resource';
  readonly key: string;
  readonly current: number;
  readonly max?: number;
}

/** The GM level from which the GM's Atlas takes a resource's maximum (`book-resource` with `max`, `SheetResource.maxEditable`) and a Counters row's. */
export const RESOURCE_MAX_GM_LEVEL = 7;

const isValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

/** A key a resource may be named by: a string of 1 to `MAX_RESOURCE_KEY` characters, none of them a control character. */
export const isResourceKey = (value: unknown): value is string => isPlainKey(value, MAX_RESOURCE_KEY);

/** A static value may be 0 (an armour class); a counting one needs a maximum above 0. */
const holdsValue = (direction: unknown, max: number): boolean => (direction === 'static' ? max >= 0 : max > 0);

/** A switch a GM may leave out (false), or undefined when it is no boolean. */
const flag = (value: unknown): boolean | undefined => (value === undefined ? false : typeof value === 'boolean' ? value : undefined);

/** A resource as the page reads it. A sheet of an older GM names no key and says nothing of edits: it reads as one the player cannot change. */
function parseResource(value: unknown): SheetResource | null {
  if (!isRecord(value) || typeof value.colour !== 'string' || !HEX_COLOUR.test(value.colour) || !DIRECTIONS.includes(value.direction)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  if (name === null || !isValue(value.current) || !isValue(value.max) || !holdsValue(value.direction, value.max)) return null;
  const key = value.key === undefined || value.key === null ? null : isResourceKey(value.key) ? value.key : undefined;
  const editable = flag(value.editable);
  const maxEditable = flag(value.maxEditable);
  if (key === undefined || editable === undefined || maxEditable === undefined) return null;
  const direction = value.direction as SheetResource['direction'];
  return {
    key, name, colour: value.colour, direction, current: value.current, max: value.max,
    editable: editable && key !== null && direction !== 'static', maxEditable: maxEditable && key !== null,
  };
}

function parseResources(value: unknown): SheetResource[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHEET_RESOURCES) return null;
  const resources = value.map(parseResource);
  return resources.every((resource) => resource !== null) ? resources : null;
}

/** A character, null for none, or undefined when it is malformed. */
export function parseBookCharacter(value: unknown): BookCharacter | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const name = bookLine(value.name, MAX_BOOK_TITLE, true);
  const art = value.art === null ? null : parseAsset(value.art);
  const resources = parseResources(value.resources);
  const ringOk = value.ring === null || (typeof value.ring === 'string' && HEX_COLOUR.test(value.ring));
  if (name === null || resources === null || !ringOk || (art === null && value.art !== null)) return undefined;
  return { name, art, ring: value.ring as string | null, resources };
}

/** A player's edit of a resource as the GM reads it, or null when it is malformed. */
export function parseBookResourceMessage(value: Record<string, unknown>): BookResourceMessage | null {
  if (!isResourceKey(value.key) || !isValue(value.current)) return null;
  if (value.max === undefined) return { t: 'book-resource', key: value.key, current: value.current };
  const max = value.max;
  return isValue(max) && Number.isInteger(max) && max >= 0 ? { t: 'book-resource', key: value.key, current: value.current, max } : null;
}
