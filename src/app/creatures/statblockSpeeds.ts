/**
 * How far a creature moves, read from its statblock: every speed its speed line states ("30 ft.,
 * fly 60 ft.", or "double near" in a game of range bands), in the collection's game units. A
 * token moves by its own speed where the GM set one, else by its statblock's first, else by the
 * speed its game gives creatures that state none.
 */

import type { MeasurementSettings } from '../grid/measurementFormat';
import { readDistance, toGameUnits, type GameUnit } from '../grid/statedDistance';
import { unitScaleOf } from '../lighting/lightingUnits';
import { bandReachChoices } from '../measure/reachSteps';
import { NO_MEANINGS, type FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { positiveNumber } from '../utils/numberInput';
import type { IndexedCreature } from './CreatureIndex';
import { phrasesOf } from './sensesText';
import { boundedText } from './statblockValues';

/** One speed a statblock states. */
export interface StatedSpeed {
  /** What kind of movement, as written ("fly", "swim"); null for the speed that names none. */
  name: string | null;
  /** Game units of the collection. */
  speed: number;
}

/** The most speeds read from one statblock. */
export const MAX_STATED_SPEEDS = 8;
/** The longest name a speed keeps. */
const MAX_SPEED_NAME = 24;
/** Words before a distance that are the line's own label and no kind of movement. */
const LABELS = new Set(['speed', 'speeds', 'movement', 'move', 'mv']);

/** The kind of movement the text before a distance names: its last words after any punctuation; none for the line's own label. */
function nameBefore(text: string): string | null {
  const words = text.split(/[,;:()/]/).pop()?.replace(/[.\s]+$/u, '').trim() ?? '';
  const name = words.slice(-MAX_SPEED_NAME).trim();
  return name === '' || LABELS.has(name.toLowerCase()) ? null : name;
}

/** What speeds are read in: the collection's unit, and its range bands where it names distances. */
export type SpeedUnit = GameUnit & Partial<Pick<MeasurementSettings, 'mode' | 'rangeBands'>>;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Every range band `text` names as a speed ("double near (fly)"), in the order written: each is
 * as far as its band reaches. Where a name holds another ("Double Near", "Near") the longer one
 * is read. None where the collection measures distances.
 */
function bandSpeedsIn(text: string, unit: SpeedUnit): StatedSpeed[] {
  if (unit.mode !== 'abstract') return [];
  const bands = bandReachChoices({ mode: 'abstract', rangeBands: unit.rangeBands ?? [] })
    .map((band) => ({ name: band.name.trim().toLowerCase(), cells: band.cells }))
    .filter((band) => band.name !== '')
    .sort((a, b) => b.name.length - a.name.length);
  const perCell = unitScaleOf({ unitDistance: unit.ruleDistance }, null).unitDistance;
  const lower = text.toLowerCase();
  const speeds: StatedSpeed[] = [];
  let from = 0;
  for (let at = 0; at < lower.length && speeds.length < MAX_STATED_SPEEDS; at += 1) {
    if (at > 0 && WORD_CHARACTER.test(lower[at - 1]!)) continue;
    const band = bands.find(({ name }) => lower.startsWith(name, at) && !WORD_CHARACTER.test(lower[at + name.length] ?? ''));
    if (!band) continue;
    speeds.push({ name: nameBefore(text.slice(from, at)), speed: band.cells * perCell });
    from = at + band.name.length;
    at = from - 1;
  }
  return speeds;
}

/** Every speed `text` states, in the order written: its distances, else the range bands it names. */
function speedsIn(text: string, unit: SpeedUnit): StatedSpeed[] {
  const speeds: StatedSpeed[] = [];
  let rest = text;
  while (speeds.length < MAX_STATED_SPEEDS) {
    const stated = readDistance(rest);
    if (!stated) break;
    const speed = toGameUnits(stated, unit);
    if (speed > 0 && Number.isFinite(speed)) speeds.push({ name: nameBefore(rest.slice(0, stated.start)), speed });
    rest = rest.slice(stated.end);
  }
  return speeds.length > 0 ? speeds : bandSpeedsIn(text, unit);
}

/** The speed value of a statblock: the field its template means as the speed, else its `speed`. */
function speedValue(fields: Readonly<Record<string, unknown>>, meanings: FieldMeanings): unknown {
  const meant = meanings.speed === undefined ? undefined : fields[meanings.speed];
  return meant === undefined || meant === null || meant === '' ? fields.speed : meant;
}

/**
 * Every speed a statblock states, the default first. The value is the field its template means as
 * the speed, else `speed`, in any shape statblocks hold it: a line ("30 ft., climb 30 ft."), a bare
 * number, a list of lines or named entries, or speeds kept by name (`{ walk: 30, fly: 60 }`). A
 * distance is read as rulebooks write it and converted to the collection's unit (`toGameUnits`);
 * a bare number is taken as it stands; a collection that measures in range bands also reads a
 * band's name as that band's reach. None where the statblock states no speed.
 */
export function statblockSpeeds(fields: Readonly<Record<string, unknown>>, meanings: FieldMeanings | undefined, unit: SpeedUnit): StatedSpeed[] {
  const value = speedValue(fields, meanings ?? NO_MEANINGS);
  if (typeof value === 'number') return value > 0 && Number.isFinite(value) ? [{ name: null, speed: value }] : [];
  const phrases = phrasesOf(value);
  return phrases.length > 0 ? speedsIn(boundedText(phrases.join(', ')), unit) : [];
}

/**
 * Whether a statblock says anything of its speed, readable or not. One that says "0 ft." or
 * "none" states its speed: it is not a creature that states none.
 */
function statesSpeed(fields: Readonly<Record<string, unknown>>, meanings: FieldMeanings | undefined): boolean {
  const value = speedValue(fields, meanings ?? NO_MEANINGS);
  return typeof value === 'number' || phrasesOf(value).length > 0;
}

/** What a token's speed is read of: its own speed, the statblock it links and the speed it picked of that. */
export interface SpeedToken {
  speed?: unknown;
  statblockPath?: string | undefined;
  /** The name of the stated speed the token moves by (`BaseToken.speedKind`); unset is the first. */
  speedKind?: unknown;
}

/** A linked statblock as `CreatureIndex` holds it. */
export type SpeedCreature = Pick<IndexedCreature, 'fields'> & Partial<Pick<IndexedCreature, 'meanings'>>;

/** The speed a token has of its own: a number above 0 set by hand. */
export function ownSpeed(token: Pick<SpeedToken, 'speed'>): number | undefined {
  return positiveNumber(token.speed);
}

/** A speed's name as names are compared: whatever its case; null for a speed without a name. */
export function speedKindOf(name: unknown): string | null {
  const kind = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return kind === '' ? null : kind;
}

/**
 * The speeds of a statblock a token may move by: the first it states, the default, and every
 * later one that has a name of its own, by which a token records its pick (`speedKind`). A later
 * speed without a name, or named like one before it, cannot be told apart and is left out.
 */
export function speedChoices(speeds: readonly StatedSpeed[]): StatedSpeed[] {
  const seen = new Set<string | null>();
  return speeds.filter((stated, index) => {
    const kind = speedKindOf(stated.name);
    if (index > 0 && (kind === null || seen.has(kind))) return false;
    seen.add(kind);
    return true;
  });
}

/** The stated speed a token picked by name (`kind`): that choice, else the first, which also stands in for a pick the statblock no longer states. */
export function chosenSpeed(speeds: readonly StatedSpeed[], kind: unknown): StatedSpeed | undefined {
  const picked = speedKindOf(kind);
  const choices = speedChoices(speeds);
  return (picked === null ? undefined : choices.find((stated) => speedKindOf(stated.name) === picked)) ?? choices[0];
}

/**
 * How far a token moves in one move, in the collection's game units: its own speed, else the one
 * it picked of those its linked statblock states (`speedKind`), else the first. A token without a
 * statblock, or whose statblock says nothing of its speed, moves by `none`, the speed the
 * movement rules give a creature that states none (`MovementRules.speed`). Null for a token
 * without any, which moves without steps: also while its statblock is unread (what it states is
 * not known yet), and where it states a speed that is none ("0 ft.") or cannot be read.
 * `creature` is the record of `token.statblockPath` in `CreatureIndex`: undefined while unread,
 * null for a note without a statblock.
 */
export function tokenSpeed(token: SpeedToken, creature: SpeedCreature | null | undefined, unit: SpeedUnit, none?: number): number | null {
  const own = ownSpeed(token);
  if (own !== undefined) return own;
  const fallback = positiveNumber(none) ?? null;
  if (!token.statblockPath) return fallback;
  if (creature === undefined) return null;
  if (!creature || !statesSpeed(creature.fields, creature.meanings)) return fallback;
  return chosenSpeed(statblockSpeeds(creature.fields, creature.meanings, unit), token.speedKind)?.speed ?? null;
}
