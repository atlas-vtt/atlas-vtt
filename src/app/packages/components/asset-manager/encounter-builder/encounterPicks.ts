import type { EncounterTokenDraft } from '../../../../encounters/encounterSaveService';
import type { TokenAsset } from '../types';

/** One creature of the encounter being built: a library token and how many of it. */
export interface EncounterPick {
  token: TokenAsset;
  count: number;
}

/** The most copies of one creature an encounter takes; a typo of 1000 goblins stops here. */
export const MAX_PICK_COUNT = 99;

/** The picks with `token` set to `count` copies, in the order they were first picked; 0 removes it. */
export function withCount(picks: readonly EncounterPick[], token: TokenAsset, count: number): EncounterPick[] {
  const clamped = Math.max(0, Math.min(MAX_PICK_COUNT, Math.round(count)));
  const index = picks.findIndex((pick) => pick.token.id === token.id);
  if (index === -1) return clamped > 0 ? [...picks, { token, count: clamped }] : [...picks];
  if (clamped === 0) return picks.filter((_, at) => at !== index);
  return picks.map((pick, at) => (at === index ? { token: pick.token, count: clamped } : pick));
}

export function countOf(picks: readonly EncounterPick[], tokenId: string): number {
  return picks.find((pick) => pick.token.id === tokenId)?.count ?? 0;
}

export function totalCount(picks: readonly EncounterPick[]): number {
  return picks.reduce((sum, pick) => sum + pick.count, 0);
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
 * token. An edited encounter keeps the references it had, in their order, as far as their creature
 * keeps that many copies, so tokens saved from a map keep their state and place; only copies added
 * now are plain, and without a formation they are placed in the grid layout encounters fall back to.
 */
export function encounterDrafts(picks: readonly EncounterPick[], previous: readonly EncounterTokenDraft[] = []): EncounterTokenDraft[] {
  return picks.flatMap(({ token, count }) => {
    const kept = previous.filter((ref) => ref.id === token.id).slice(0, count);
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
    if (pick) pick.count += 1;
    else picks.set(ref.id, { token: known.get(ref.id) ?? fromRef(ref), count: 1 });
  }
  return [...picks.values()];
}
