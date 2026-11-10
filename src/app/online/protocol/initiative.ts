import { parseAsset, type AssetRef } from './asset.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_NAME, TOKEN_ID_PATTERN } from './tokens.ts';
import { MAX_INSTANCE_NUMBER, MAX_TOKEN_CONDITIONS, parseCondition, type SharedCondition } from './tokenUI.ts';

/** Combatants one `initiative` message may list. */
export const MAX_COMBATANTS = 200;
export const INITIATIVE_SIDES = ['players', 'opponents'] as const;
export type SharedSide = (typeof INITIATIVE_SIDES)[number];
/** Sides one `initiative` message may list, and the longest id of a side. */
export const MAX_SIDES = 8;
export const MAX_SIDE_ID = 64;

/** A combatant on the players' initiative list: never one whose token is hidden. */
export interface SharedCombatant {
  readonly initiative: number;
  /** Shown only while the player view shows names. */
  readonly name: string | null;
  /** The combatant has the turn (in turn order, while a fight runs). */
  readonly turn: boolean;
  readonly sitsOut: boolean;
  /** Delayed its turn: waits outside the order until it acts. Absent from older GMs. */
  readonly delayed?: true;
  /** Defeated, as the GM's card shows it: drawn dimmed and marked. Absent from older GMs. */
  readonly defeated?: true;
  /** No number rolled or typed yet: an empty slot, not the 0 `initiative` holds. Absent from older GMs. */
  readonly unnumbered?: true;
  /**
   * In a list that starts at the turn (`SharedInitiative.fromTurn`), the combatant acts in the next
   * round: it is drawn after the round's last, below a divider naming the next round. Absent from older GMs.
   */
  readonly nextRound?: true;
  /** The condition badges the map shows players on the combatant's token, in order. Absent from older GMs. */
  readonly conditions?: readonly SharedCondition[];
  /** The portrait's artwork, asked for by hash like the map. */
  readonly art: AssetRef | null;
  /** The ring around the portrait (`#rrggbb`, or null untinted); absent for an unframed token. */
  readonly ring: { readonly colour: string | null } | null;
  /** The players' side, or the opponents' for every other side (what older pages group by). */
  readonly side: SharedSide;
  /** The id of a side the collection named (in `SharedInitiative.sides`), where the combatant fights on one. Absent from older GMs. */
  readonly sideId?: string;
  /** Hit points, where the collection shows them to players. */
  readonly hp: { readonly current: number; readonly max: number } | null;
  /**
   * The number the combatant's look-alike badge shows the players, as their own picture numbers
   * look-alikes they see (and those beside the map their list shows); absent without a badge. Absent from older GMs.
   */
  readonly instance?: number;
  /**
   * The id the players know the combatant's token by in their token list, which a click on the card
   * brings into view; absent for a token they are not sent (beside the map, out of sight). Absent from older GMs.
   */
  readonly token?: string;
}

/** A side of a fight by sides as the players' list heads its group. */
export interface SharedSideTurn {
  /** `players`, `opponents`, or the id of a side the collection named. */
  readonly id: string;
  readonly name: string;
  /** This round's roll, where the sides roll for their order. */
  readonly roll: number | null;
  /** The side has the turn; sides with equal rolls have it at once. */
  readonly turn: boolean;
}

/** The players' initiative list, as Atlas's player window shows it. */
export interface SharedInitiative {
  readonly isActive: boolean;
  readonly round: number;
  readonly bySides: boolean;
  readonly firstSide: SharedSide;
  readonly activeSide: SharedSide | null;
  /** By sides: every side in the order it acts this round. Absent from older GMs, which have the two of `firstSide`. */
  readonly sides?: readonly SharedSideTurn[];
  /** A fight by cards: each combatant's `initiative` is the card it was dealt, and the lowest acts first. Absent from older GMs. */
  readonly byCards?: true;
  readonly combatants: readonly SharedCombatant[];
  /**
   * The GM's lists start at the turn during a fight: in turn order the combatants without
   * `nextRound` first, then a divider, then those with it; by sides the side whose turn it is first,
   * then a divider before the sides that act before it. Absent: the list in turn order.
   */
  readonly fromTurn?: true;
  /** The GM switched the turn banner off: the page names no turn as it moves on. Absent from older GMs. */
  readonly bannerOff?: true;
  /**
   * During a fight players move a token of theirs that fights only while it holds the turn (by
   * sides: while its side does); the GM refuses other moves. Absent from older GMs.
   */
  readonly movesOnTurn?: true;
  /** The GM docked the lists at the left edge of the map; absent, they stand at the right. Absent from older GMs. */
  readonly dock?: 'left';
}

const isNumber = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const isSide = (value: unknown): value is SharedSide => INITIATIVE_SIDES.includes(value as SharedSide);
const isInstance = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_INSTANCE_NUMBER;
const isSideId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_SIDE_ID;

/** The sides of a message: undefined (left out) where they are no list of sides, so a page never fails on them. */
function parseSides(value: unknown): SharedSideTurn[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_SIDES) return undefined;
  const sides: SharedSideTurn[] = [];
  for (const side of value) {
    if (!isRecord(side) || !isSideId(side.id) || typeof side.name !== 'string' || side.name.length > MAX_NAME || typeof side.turn !== 'boolean') return undefined;
    if (side.roll !== null && !isNumber(side.roll, 1e9)) return undefined;
    sides.push({ id: side.id, name: side.name, roll: side.roll, turn: side.turn });
  }
  return sides;
}

function parseCombatant(value: unknown): SharedCombatant | null {
  if (!isRecord(value) || !isNumber(value.initiative, 1e9) || typeof value.turn !== 'boolean' || typeof value.sitsOut !== 'boolean' || !isSide(value.side)) return null;
  const { name, ring, hp } = value;
  if (name !== null && (typeof name !== 'string' || name.length > MAX_NAME)) return null;
  const art = value.art === null ? null : parseAsset(value.art);
  if (value.art !== null && art === null) return null;
  if (ring !== null && (!isRecord(ring) || (ring.colour !== null && (typeof ring.colour !== 'string' || !COLOUR_PATTERN.test(ring.colour))))) return null;
  if (hp !== null && (!isRecord(hp) || !isNumber(hp.current, 1e9) || !isNumber(hp.max, 1e9))) return null;
  return {
    initiative: value.initiative, name, turn: value.turn, sitsOut: value.sitsOut, art, side: value.side,
    ring: ring === null ? null : { colour: ring.colour as string | null },
    hp: hp === null ? null : { current: hp.current as number, max: hp.max as number },
    // Optional flags: anything but `true` reads as unset, so a page never fails on them
    ...(value.delayed === true ? { delayed: true as const } : {}),
    ...(value.defeated === true ? { defeated: true as const } : {}),
    ...(value.unnumbered === true ? { unnumbered: true as const } : {}),
    ...(value.nextRound === true ? { nextRound: true as const } : {}),
    ...conditionsOf(value.conditions),
    ...(isSideId(value.sideId) ? { sideId: value.sideId } : {}),
    ...(isInstance(value.instance) ? { instance: value.instance } : {}),
    ...(typeof value.token === 'string' && TOKEN_ID_PATTERN.test(value.token) ? { token: value.token } : {}),
  };
}

/** Optional condition badges: a list of readable ones, else unset, so a page never fails on them. */
function conditionsOf(value: unknown): { conditions?: SharedCondition[] } {
  if (!Array.isArray(value) || value.length > MAX_TOKEN_CONDITIONS) return {};
  const conditions: SharedCondition[] = [];
  for (const entry of value) {
    const condition = parseCondition(entry);
    if (condition === null) return {};
    conditions.push(condition);
  }
  return { conditions };
}

/** The list of an `initiative` message: null for none shown, undefined for anything malformed. */
export function parseInitiative(value: unknown): SharedInitiative | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.isActive !== 'boolean' || typeof value.bySides !== 'boolean' || !isNumber(value.round, 1e9) || !isSide(value.firstSide)) return undefined;
  if (value.activeSide !== null && !isSide(value.activeSide)) return undefined;
  if (!Array.isArray(value.combatants) || value.combatants.length > MAX_COMBATANTS) return undefined;
  const combatants: SharedCombatant[] = [];
  for (const entry of value.combatants) {
    const combatant = parseCombatant(entry);
    if (combatant === null) return undefined;
    combatants.push(combatant);
  }
  const sides = parseSides(value.sides);
  return {
    isActive: value.isActive, round: value.round, bySides: value.bySides, firstSide: value.firstSide, activeSide: value.activeSide, combatants,
    ...(value.fromTurn === true ? { fromTurn: true as const } : {}),
    ...(sides ? { sides } : {}),
    ...(value.byCards === true ? { byCards: true as const } : {}),
    ...(value.bannerOff === true ? { bannerOff: true as const } : {}),
    ...(value.movesOnTurn === true ? { movesOnTurn: true as const } : {}),
    ...(value.dock === 'left' ? { dock: 'left' as const } : {}),
  };
}
