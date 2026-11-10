/**
 * The senses of a token with a linked statblock. A token follows its statblock's senses line
 * until it has senses of its own: nothing is copied onto the token, so an edit of the note shows
 * at once, and vision itself is never switched on by a statblock.
 */

import { sameSenses } from '../gameSystems/senseRules';
import type { GameUnit } from '../grid/statedDistance';
import type { TokenVision } from '../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { positiveNumber } from '../utils/numberInput';
import { tokenSenses } from '../vision/tokenSenses';
import type { IndexedCreature } from './CreatureIndex';
import { isPerceptionScore, parseSenses, type ParsedSenses } from './parseSenses';
import { sensesTextOf } from './sensesText';

/** What senses read of a token. */
export interface SensedToken {
  vision?: TokenVision | undefined;
  statblockPath?: string | undefined;
}

/**
 * A linked statblock as `CreatureIndex` holds it; a new record replaces it whenever the note is
 * read again. Its meanings say which field a native template keeps its senses in.
 */
export type SensedCreature = Pick<IndexedCreature, 'fields'> & Partial<Pick<IndexedCreature, 'meanings'>>;

const NO_SENSES: ParsedSenses = deepFreeze({ senses: [], unknown: [] });

function deepFreeze(parsed: ParsedSenses): ParsedSenses {
  parsed.senses.forEach((sense) => Object.freeze(sense));
  Object.freeze(parsed.senses);
  Object.freeze(parsed.unknown);
  return Object.freeze(parsed);
}

/** One reading of a creature's senses line, with the rules it was read by. */
interface Reading {
  definitions: readonly SenseDefinition[];
  unit: GameUnit;
  parsed: ParsedSenses;
}

/** Readings kept per creature record: more collections than this seldom share one note. */
const MAX_READINGS = 4;

/** The readings of each creature record, newest first; a record the index replaced takes them with it. */
const readings = new WeakMap<SensedCreature, Reading[]>();

function readBy(reading: Reading, definitions: readonly SenseDefinition[], unit: GameUnit): boolean {
  return reading.unit.unitType === unit.unitType
    && reading.unit.ruleDistance === unit.ruleDistance
    && (reading.definitions === definitions || sameSenses(reading.definitions, definitions));
}

/**
 * What a creature's statblock says about its senses, read with the collection's senses and unit.
 * Read once per creature record and rules: `CreatureIndex` hands out a new record whenever the
 * note or the bestiary changes, and collections with other senses or another unit get a reading
 * of their own, so each keeps its list while they share the note. The result is shared and frozen.
 */
export function creatureSenses(creature: SensedCreature | null | undefined, definitions: readonly SenseDefinition[], unit: GameUnit): ParsedSenses {
  if (!creature) return NO_SENSES;
  const known = readings.get(creature) ?? [];
  const reading = known.find((candidate) => readBy(candidate, definitions, unit));
  if (reading) return reading.parsed;
  const text = sensesTextOf(creature.fields, creature.meanings);
  const parsed = text === null ? NO_SENSES : deepFreeze(parseSenses(text, definitions, unit));
  const unitRead = { unitType: unit.unitType, ruleDistance: unit.ruleDistance };
  readings.set(creature, [{ definitions, unit: unitRead, parsed }, ...known].slice(0, MAX_READINGS));
  return parsed;
}

/** Whether the statblock says anything sight acts on. */
function saysSomething(parsed: ParsedSenses): boolean {
  return parsed.senses.length > 0 || parsed.blindBeyond === true;
}

/**
 * The senses a token has of its own, as `tokenSenses` reads them: its `vision.senses` once that
 * is a list (even an empty one), else its old darkvision and tremorsense fields. Null when it has
 * neither, so it follows its statblock.
 */
export function ownSenses(token: SensedToken, definitions: readonly SenseDefinition[]): TokenSense[] | null {
  const own = tokenSenses(token.vision, definitions);
  return Array.isArray(token.vision?.senses) || own.length > 0 ? own : null;
}

/** How a token perceives, and where that comes from. */
export interface EffectiveVision {
  senses: TokenSense[];
  /**
   * `token`: its own senses or old fields. `statblock`: it follows its linked statblock.
   * `pending`: it follows a statblock that has not been read yet. `none`: it has no senses.
   */
  source: 'token' | 'statblock' | 'pending' | 'none';
  /**
   * How far the token's normal sight reaches, in game units; unset is unlimited. It is the
   * token's own `vision.range` where that is set; else the radius its statblock says the creature
   * is blind beyond, or 0 where the statblock gives it no normal sight at all. The statblock
   * limits sight whatever the source of the senses, so a token edited by hand stays blind beyond
   * its radius until the GM gives it a range.
   */
  sightRange?: number;
  /** The statblock says the creature is blind beyond its senses, whether or not the token's own range overrides it. */
  blindBeyond: boolean;
  /**
   * The linked statblock has not been read yet and could still change `senses` or `sightRange`:
   * sight should show and record nothing for this token until it is (the resolver announces it).
   */
  pending: boolean;
  /** Changes exactly when `senses`, `sightRange` or `pending` do: compare it instead of the list. */
  key: string;
}

/** A list of senses as one value, in the order listed. */
function sensesKey(senses: readonly TokenSense[]): string {
  return senses.map((sense) => `${sense.id}=${sense.range ?? ''}`).join('|');
}

/**
 * How a token perceives. Its senses are, in this order: its own `vision.senses` (even empty),
 * else its old darkvision and tremorsense fields, else those of its linked statblock. Its sight
 * range follows the statblock where the token sets none (`EffectiveVision.sightRange`).
 * `creature` is the record of `token.statblockPath` in `CreatureIndex`: undefined while unread,
 * null for a note without a statblock.
 */
export function effectiveVision(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): EffectiveVision {
  const own = ownSenses(token, definitions);
  const linked = Boolean(token.statblockPath);
  const unread = linked && creature === undefined;
  const parsed = linked ? creatureSenses(creature, definitions, unit) : NO_SENSES;
  const blindBeyond = parsed.blindBeyond === true;
  const ownRange = positiveNumber(token.vision?.range);
  const sightRange = ownRange ?? (blindBeyond ? parsed.blindBeyondRange ?? 0 : undefined);
  const pending = unread && (!own || ownRange === undefined);
  const senses = own ?? parsed.senses;
  const source = own ? 'token' : unread ? 'pending' : saysSomething(parsed) ? 'statblock' : 'none';
  return {
    senses,
    source,
    ...(sightRange !== undefined && { sightRange }),
    blindBeyond,
    pending,
    key: `${sensesKey(senses)};${sightRange ?? ''};${pending ? 'pending' : ''}`,
  };
}

/** The senses of `effectiveVision`. The list is shared between calls and frozen: compare it by reference, never change it. */
export function effectiveSenses(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): TokenSense[] {
  return effectiveVision(token, creature, definitions, unit).senses;
}

/** What a token takes from its statblock, for an editor to show. */
export interface InheritedSenses {
  senses: TokenSense[];
  /** Phrases of the senses line that name no sense of the collection, without its perception scores. */
  notRecognised: string[];
  blindBeyond: boolean;
  blindBeyondRange?: number;
}

/**
 * The senses a token follows from its statblock, or null when it has senses of its own, links no
 * statblock, or the statblock's senses line says nothing to show. The lists are the caller's.
 */
export function inheritedSensesOf(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): InheritedSenses | null {
  if (!token.statblockPath || ownSenses(token, definitions)) return null;
  const parsed = creatureSenses(creature, definitions, unit);
  const notRecognised = parsed.unknown.filter((phrase) => !isPerceptionScore(phrase));
  if (!saysSomething(parsed) && notRecognised.length === 0) return null;
  return {
    senses: parsed.senses.map((sense) => ({ ...sense })),
    notRecognised,
    blindBeyond: parsed.blindBeyond === true,
    ...(parsed.blindBeyondRange !== undefined && { blindBeyondRange: parsed.blindBeyondRange }),
  };
}
