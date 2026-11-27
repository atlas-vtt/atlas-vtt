import { isHash } from './asset.ts';
import { MAX_COMBATANTS, MAX_SIDES, MAX_SIDE_ID } from './initiative.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_NAME } from './tokens.ts';
import { MAX_INSTANCE_NUMBER } from './tokenUI.ts';

/**
 * The running fight as the GM's initiative tracker shows it, for the Statblocks screen of a GM screen device: the
 * tracker's groups in its order (the order, the next round's below a divider, the delayed, or each side under its
 * name), each combatant with what its card shows. It is the GM's screen, so hidden combatants are in it, marked.
 */

/** A combatant as the GM's tracker draws it. */
export interface FightCombatant {
  /** Atlas's own key for the combatant while its fight runs: what tells one row from another as the list moves. */
  readonly key: string;
  readonly name: string;
  /** The id of the statblock it opens, of the same list's entries; null for none. */
  readonly statblock: string | null;
  /** The hash of its token's art, asked for like the entries' portraits; null for none. */
  readonly portrait: string | null;
  /** The colour of its token's ring (`#rrggbb`); null for art shown without a ring. */
  readonly ring: string | null;
  /** The colour its turn shows in, as the tracker's (`#rrggbb`); null for the accent. Absent from an Atlas that does not say. */
  readonly turnColour?: string | null;
  /** The look-alike number its token's badge shows on the GM's map; absent without a badge. */
  readonly badge?: number;
  /** It holds the turn (by sides: it acts on the side that does). */
  readonly turn?: true;
  /** It fights on the players' side, which the tracker frames. */
  readonly ally?: true;
  /** Hidden from the players: its token is hidden, or the GM left it out of their list. */
  readonly hidden?: true;
  readonly defeated?: true;
  /** It does not act this round. */
  readonly sitsOut?: true;
  /** It delayed its turn and waits outside the order. */
  readonly delayed?: true;
  /** Kept beside the map, not on it. */
  readonly offMap?: true;
}

/** A side of a fight by sides, as the tracker heads its group. */
export interface FightSide {
  /** `players`, `opponents`, or the id of a side the collection named. */
  readonly id: string;
  readonly name: string;
  /** This round's roll, where the sides roll for their order. */
  readonly roll: number | null;
  readonly turn: boolean;
}

export type FightPart =
  /** Combatants drawn together: `key` is `order`, `next` (the next round's, after a divider), `delayed` or a side's id. */
  | { readonly k: 'group'; readonly key: string; readonly side?: FightSide; readonly delayed?: true; readonly combatants: readonly FightCombatant[] }
  /** Where the list runs on into the next round. */
  | { readonly k: 'round'; readonly round: number };

export interface StatblocksFight {
  readonly round: number;
  readonly parts: readonly FightPart[];
}

/** The parts one fight may have: every side and a divider, or the order, the next round's, the delayed and a divider. */
const MAX_PARTS = 2 * MAX_SIDES + 4;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const FLAGS = ['turn', 'ally', 'hidden', 'defeated', 'sitsOut', 'delayed', 'offMap'] as const;

const isWhole = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= limit;
const isName = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_NAME;

function parseCombatant(value: unknown): FightCombatant | null {
  if (!isRecord(value) || typeof value.key !== 'string' || !KEY_PATTERN.test(value.key) || !isName(value.name)) return null;
  const { statblock, portrait, ring, badge, turnColour } = value;
  if (!(statblock === null || (typeof statblock === 'string' && KEY_PATTERN.test(statblock)))) return null;
  if (!(portrait === null || isHash(portrait)) || !(ring === null || (typeof ring === 'string' && COLOUR_PATTERN.test(ring)))) return null;
  const flags = Object.fromEntries(FLAGS.flatMap((flag) => (value[flag] === true ? [[flag, true]] : [])));
  return {
    key: value.key, name: value.name, statblock, portrait, ring,
    ...((turnColour === null || (typeof turnColour === 'string' && COLOUR_PATTERN.test(turnColour))) && { turnColour }),
    ...(isWhole(badge, MAX_INSTANCE_NUMBER) && badge >= 1 && { badge }),
    ...flags,
  };
}

function parseSide(value: unknown): FightSide | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '' || value.id.length > MAX_SIDE_ID || !isName(value.name) || typeof value.turn !== 'boolean') return null;
  const roll = value.roll === null || (typeof value.roll === 'number' && Number.isFinite(value.roll) && Math.abs(value.roll) <= 1e9) ? value.roll : undefined;
  return roll === undefined ? null : { id: value.id, name: value.name, roll, turn: value.turn };
}

function parsePart(value: unknown, budget: { combatants: number }): FightPart | null {
  if (!isRecord(value)) return null;
  if (value.k === 'round') return isWhole(value.round, 1e9) ? { k: 'round', round: value.round } : null;
  if (value.k !== 'group' || typeof value.key !== 'string' || value.key === '' || value.key.length > MAX_SIDE_ID || !Array.isArray(value.combatants)) return null;
  budget.combatants += value.combatants.length;
  if (budget.combatants > MAX_COMBATANTS) return null;
  const combatants = value.combatants.map(parseCombatant);
  if (!combatants.every((combatant): combatant is FightCombatant => combatant !== null)) return null;
  const side = value.side === undefined ? undefined : parseSide(value.side);
  if (side === null) return null;
  return { k: 'group', key: value.key, ...(side && { side }), ...(value.delayed === true && { delayed: true as const }), combatants };
}

/** A fight of a `statblocks` message; undefined for none and for anything malformed, so the list itself still reads. */
export function parseFight(value: unknown): StatblocksFight | undefined {
  if (!isRecord(value) || !isWhole(value.round, 1e9) || !Array.isArray(value.parts) || value.parts.length > MAX_PARTS) return undefined;
  const budget = { combatants: 0 };
  const parts = value.parts.map((part) => parsePart(part, budget));
  if (!parts.every((part): part is FightPart => part !== null)) return undefined;
  const keys = parts.flatMap((part) => (part.k === 'group' ? part.combatants.map((combatant) => combatant.key) : []));
  return new Set(keys).size === keys.length ? { round: value.round, parts } : undefined;
}
