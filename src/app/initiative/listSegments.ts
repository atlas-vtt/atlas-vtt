import type { SideId } from '../types/initiativeRulesTypes';
import type { ListedSide } from './sides';

/** Combatants drawn together: the order (unlabelled), a side under its name, or those that delayed their turn. */
export interface CardGroup<T> {
  readonly kind: 'group';
  /** Stable among the groups of one list: `order`, `next`, `delayed` or the side. */
  readonly key: string;
  /** A side's group, shown under the side's name (and this round's roll, where the order is rolled). */
  readonly side?: ListedSide;
  /** The side has the turn; sides with equal rolls have it at once. */
  readonly active?: boolean;
  /** Those that delayed their turn, shown under "Delayed". */
  readonly delayed?: boolean;
  readonly items: readonly T[];
}

/** Where the list runs on into the next round. */
export interface RoundDivider {
  readonly kind: 'round';
  /** The round that begins below it. */
  readonly round: number;
}

export type ListSegment<T> = CardGroup<T> | RoundDivider;

/** How a list of combatants is laid out. */
export interface ListShape<T> {
  /** The combatants act by sides (`listedBySides`): grouped under their side. */
  readonly bySides: boolean;
  /** The sides in the order they act this round, the side or sides with the turn marked (`listedSides`). */
  readonly sides: readonly ListedSide[];
  sideOf(item: T): SideId;
  delayed(item: T): boolean;
  /** A fight is running: the turn and the round are known. */
  readonly fightRuns: boolean;
  readonly round: number;
  /**
   * In turn order, the place among the combatants that have not delayed where the rest of this
   * round begins (the combatant whose turn it is); -1 for none. Ignored by sides.
   */
  readonly turnAt: number;
  /** The list starts at the turn and runs on into the next round below a divider. */
  readonly fromTurn: boolean;
  /** Sides nobody in the list belongs to are drawn too (the GM's tracker), else left out (the players'). */
  readonly emptySides: boolean;
}

/**
 * The list of a fight as it is drawn: in turn order, the delayed below it; by sides, each side
 * under its name. With `fromTurn` while a fight runs, the list starts with the combatant (or the
 * first side) whose turn it is and runs on to the round's end, then past a divider into the next round's first.
 */
export function listSegments<T>(items: readonly T[], shape: ListShape<T>): ListSegment<T>[] {
  const rotate = shape.fightRuns && shape.fromTurn;
  const nextRound: RoundDivider = { kind: 'round', round: shape.round + 1 };

  if (shape.bySides) {
    const groups = shape.sides.map((side): CardGroup<T> => ({
      kind: 'group',
      key: side.id,
      side,
      active: shape.fightRuns && side.active,
      items: items.filter((item) => shape.sideOf(item) === side.id),
    }));
    const turnAt = rotate ? groups.findIndex((group) => group.active) : -1;
    const rotated = turnAt <= 0 ? groups : [...groups.slice(turnAt), nextRound, ...groups.slice(0, turnAt)];
    const shown = shape.emptySides ? rotated : rotated.filter((segment) => segment.kind === 'round' || segment.items.length > 0);
    // A side nobody is shown of leaves no divider at either end: the list then starts with the next round
    while (shown[0]?.kind === 'round') shown.shift();
    while (shown.at(-1)?.kind === 'round') shown.pop();
    return shown;
  }

  const order = items.filter((item) => !shape.delayed(item));
  const delayed = items.filter((item) => shape.delayed(item));
  const delayedGroup: ListSegment<T>[] = delayed.length > 0 ? [{ kind: 'group', key: 'delayed', delayed: true, items: delayed }] : [];
  const turnAt = rotate && shape.turnAt < order.length ? shape.turnAt : -1;
  if (turnAt <= 0) return [{ kind: 'group', key: 'order', items: order }, ...delayedGroup];
  return [
    { kind: 'group', key: 'order', items: order.slice(turnAt) },
    nextRound,
    { kind: 'group', key: 'next', items: order.slice(0, turnAt) },
    ...delayedGroup,
  ];
}

/**
 * The first `count` combatants of a list, as a collapsed tracker shows them: the groups they
 * belong to and a divider they pass. Those that delayed their turn are not next and stay out. The
 * side whose turn it is stays even with nobody in it (a GM may track only the opponents), so the
 * turn still shows.
 */
export function firstCards<T>(segments: readonly ListSegment<T>[], count: number): ListSegment<T>[] {
  const kept: ListSegment<T>[] = [];
  let left = count;
  for (const segment of segments) {
    if (left <= 0) break;
    if (segment.kind === 'round') {
      kept.push(segment);
      continue;
    }
    if (segment.delayed || (segment.items.length === 0 && !segment.active)) continue;
    const items = segment.items.slice(0, left);
    left -= items.length;
    kept.push({ ...segment, items });
  }
  // A divider with nobody before or after it says nothing
  while (kept[0]?.kind === 'round') kept.shift();
  while (kept.at(-1)?.kind === 'round') kept.pop();
  return kept;
}

/** The combatants of a list in the order it shows them. */
export function shownItems<T>(segments: readonly ListSegment<T>[]): T[] {
  return segments.flatMap((segment) => (segment.kind === 'group' ? [...segment.items] : []));
}
