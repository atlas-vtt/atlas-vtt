import { isRecord } from './shape.ts';

/** Bars a token shows below it: Atlas's two bar sockets. */
export const MAX_TOKEN_BARS = 2;
/** Condition badges one token may carry. */
export const MAX_TOKEN_CONDITIONS = 64;
/** The largest resource value or condition number sent. */
export const MAX_TOKEN_VALUE = 1_000_000_000;
/** The largest instance number sent. */
export const MAX_INSTANCE_NUMBER = 10_000;
/** A condition's icon: one of Atlas's widget icons, by id. */
export const CONDITION_ICON_PATTERN = /^[a-z0-9-]{1,40}$/;
/** The longest text a condition badge shows instead of an icon (the initial of its name). */
export const MAX_CONDITION_TEXT = 8;

const HEX_COLOUR = /^#[0-9a-f]{6}$/;
const DIRECTIONS: readonly unknown[] = ['drains', 'fills', 'static'];

/** A resource bar as Atlas's player window draws it: its colour, how it counts, whether spending it defeats the token, and its value. */
export interface SharedBar {
  /** The resource's own colour, `#rrggbb`; Atlas's warning colours are worked out from the value as it draws. */
  readonly colour: string;
  readonly direction: 'drains' | 'fills' | 'static';
  readonly defeats: boolean;
  readonly current: number;
  readonly max: number;
}

/** A condition badge on the token's ring: colour, glyph and the number of a valued condition. */
export interface SharedCondition {
  readonly colour: string;
  readonly glyph: { readonly kind: 'icon'; readonly icon: string } | { readonly kind: 'text'; readonly text: string };
  readonly value: number | null;
}

/** What Atlas's player window draws on and around a creature token besides its artwork. */
export interface SharedTokenUI {
  /** Whether its name (the token's `name`) shows on a nameplate. */
  readonly nameplate: boolean;
  /** Greyed out with a skull: a resource that defeats it is spent. */
  readonly downed: boolean;
  /** The bars of resources players may see, in socket order. */
  readonly bars: readonly SharedBar[];
  readonly conditions: readonly SharedCondition[];
}

const isValue = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

/** A static value may be 0 (an armour class); a counting one needs a maximum above 0. */
const holdsValue = (direction: unknown, max: number): boolean => (direction === 'static' ? max >= 0 : max > 0);

function parseBar(value: unknown): SharedBar | null {
  if (!isRecord(value)) return null;
  const { colour, direction, defeats, current, max } = value;
  if (typeof colour !== 'string' || !HEX_COLOUR.test(colour) || !DIRECTIONS.includes(direction) || typeof defeats !== 'boolean') return null;
  if (!isValue(current) || !isValue(max) || !holdsValue(direction, max)) return null;
  return { colour, direction: direction as SharedBar['direction'], defeats, current, max };
}

function parseGlyph(value: unknown): SharedCondition['glyph'] | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'icon' && typeof value.icon === 'string' && CONDITION_ICON_PATTERN.test(value.icon)) return { kind: 'icon', icon: value.icon };
  if (value.kind === 'text' && typeof value.text === 'string' && value.text.length > 0 && value.text.length <= MAX_CONDITION_TEXT) return { kind: 'text', text: value.text };
  return null;
}

/** A condition badge, or null when it is malformed. */
export function parseCondition(value: unknown): SharedCondition | null {
  if (!isRecord(value) || typeof value.colour !== 'string' || !HEX_COLOUR.test(value.colour)) return null;
  const glyph = parseGlyph(value.glyph);
  if (glyph === null || (value.value !== null && !isValue(value.value))) return null;
  return { colour: value.colour, glyph, value: value.value };
}

function parseList<T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed: T[] = [];
  for (const entry of value) {
    const item = parse(entry);
    if (item === null) return null;
    parsed.push(item);
  }
  return parsed;
}

/** A token's UI, null for a token without one, or undefined when it is malformed. A list from an older companion has none. */
export function parseTokenUI(value: unknown): SharedTokenUI | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.nameplate !== 'boolean' || typeof value.downed !== 'boolean') return undefined;
  const bars = parseList(value.bars, MAX_TOKEN_BARS, parseBar);
  const conditions = parseList(value.conditions, MAX_TOKEN_CONDITIONS, parseCondition);
  if (bars === null || conditions === null) return undefined;
  return { nameplate: value.nameplate, downed: value.downed, bars, conditions };
}

/** A token's instance number, null without a badge, or undefined when it is malformed. */
export function parseBadge(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_INSTANCE_NUMBER ? value : undefined;
}
