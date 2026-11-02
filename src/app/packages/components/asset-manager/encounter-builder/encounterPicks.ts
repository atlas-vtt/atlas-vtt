import type { EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import { MAX_COPIES, readDiceQuantity, refQuantity, totalRange, type Quantity, type QuantityRange } from '../../../../encounters/encounterQuantity';
import type { TokenAsset } from '../types';

/** One creature of the encounter being built: a library token and how many of it, a number or dice. */
export interface EncounterPick {
  token: TokenAsset;
  count: Quantity;
}

/**
 * The picks with `token` set to `count` copies, in the order they were first picked; 0 removes it.
 * A number is clamped to `MAX_COPIES`; dice that are no quantity (`readDiceQuantity`) change nothing.
 */
export function withCount(picks: readonly EncounterPick[], token: TokenAsset, count: Quantity): EncounterPick[] {
  if (typeof count === 'string' && !readDiceQuantity(count)) return [...picks];
  const next = typeof count === 'string' ? count.trim() : Math.max(0, Math.min(MAX_COPIES, Math.round(count)));
  const index = picks.findIndex((pick) => pick.token.id === token.id);
  if (index === -1) return next !== 0 ? [...picks, { token, count: next }] : [...picks];
  if (next === 0) return picks.filter((_, at) => at !== index);
  return picks.map((pick, at) => (at === index ? { token: pick.token, count: next } : pick));
}

export function countOf(picks: readonly EncounterPick[], tokenId: string): Quantity {
  return picks.find((pick) => pick.token.id === tokenId)?.count ?? 0;
}

/** The fewest and most creatures the encounter brings, its dice rolled low and high. */
export function totalCount(picks: readonly EncounterPick[]): QuantityRange {
  return totalRange(picks.map((pick) => pick.count));
}

/** A plain reference to one copy of `token`, as the builder stores a creature it adds. */
function draftOf(token: TokenAsset): EncounterTokenDraft {
  return {
    id: token.id,
    name: token.name,
    imagePath: token.imagePath ?? '',
    size: token.size ?? 1,
    ...(token.statblockPath !== undefined && { statblockPath: token.statblockPath }),
  };
}

/**
 * The encounter's token references: one per copy, as an encounter saved from the map holds one per
 * token, and one carrying the dice for a creature whose number is rolled (`quantity`), which a spawn
 * rolls into copies of it. An edited encounter keeps the references it had, in their order, as far
 * as their creature keeps that many copies, so tokens saved from a map keep their state and place;
 * only copies added now are plain, and without a formation they are placed in the grid layout
 * encounters fall back to.
 */
export function encounterDrafts(picks: readonly EncounterPick[], previous: readonly EncounterTokenDraft[] = []): EncounterTokenDraft[] {
  return picks.flatMap(({ token, count }) => {
    const own = previous.filter((ref) => ref.id === token.id).map(({ quantity: _rolled, ...ref }) => ref);
    if (typeof count === 'string') return [{ ...(own[0] ?? draftOf(token)), quantity: count }];
    const kept = own.slice(0, count);
    return [...kept, ...Array.from({ length: count - kept.length }, () => draftOf(token))];
  });
}

/**
 * The picks a saved encounter holds: its references counted by creature, in the order they first
 * appear. A creature the collection lists (`known`) is that token; any other (a token saved from a
 * map, one without a statblock) is made from its reference by `fromRef`, so editing never drops it.
 */
export function picksFromEncounter(
  refs: readonly EncounterTokenDraft[],
  known: ReadonlyMap<string, TokenAsset>,
  fromRef: (ref: EncounterTokenDraft) => TokenAsset,
): EncounterPick[] {
  const picks = new Map<string, EncounterPick>();
  for (const ref of refs) {
    const pick = picks.get(ref.id);
    if (!pick) picks.set(ref.id, { token: known.get(ref.id) ?? fromRef(ref), count: refQuantity(ref) });
    else if (typeof pick.count === 'number') pick.count += 1;
  }
  return [...picks.values()];
}
