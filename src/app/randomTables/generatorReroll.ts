/**
 * Rolling a generator's result again on its card: one part (the Name filled again with what it
 * rolled), or every part the GM has not locked (the Name rolled again too). The result keeps its
 * id and its item's id, and the roll its other results and draws, so the history entry is
 * replaced by the roll the card shows. Pure but for the rolls.
 */

import type { LootRoll, TableResult } from '../loot/lootHistory';
import type { LootDraw } from '../loot/lootRoller';
import { generatorShape, partKey } from './generatorParts';
import type { KeptPart } from './generatorRoller';
import { rollGeneratorOnce, type GeneratorOutcome, type GeneratorRollRequest } from './generatorResults';
import type { CollectionTable } from './TableNoteReader';

/** The draws a result holds: its own item and the items its parts gave. */
export function heldDraws(result: TableResult): Set<string> {
  return new Set([...(result.item ? [result.item] : []), ...result.fields.flatMap((field) => field.items ?? [])]);
}

/**
 * Whether `result` can be rolled again from `found`: it is a result of that generator, and every
 * part it shows is still the part of the same name in the same row.
 */
export function canReroll(result: TableResult, found: CollectionTable | undefined): found is CollectionTable {
  if (!found?.table || !result.generator || found.source.kind !== 'generator') return false;
  if (result.generator.path !== found.source.path || result.generator.index !== found.source.index) return false;
  const labels = new Map(generatorShape(found.table).parts.map((part) => [part.row, partKey(part.label)]));
  return result.fields.every((field) => field.row !== undefined && labels.get(field.row) === partKey(field.label));
}

/** What a shown part keeps: its value and the draws of the roll it gave. */
function keptPart(result: TableResult, row: number, draws: readonly LootDraw[]): KeptPart {
  const field = result.fields.find((entry) => entry.row === row);
  const ids = new Set(field?.items ?? []);
  return { value: field?.value ?? '', items: draws.filter((draw) => ids.has(draw.id)) };
}

/** `roll` with `before` replaced by `after`: its draws leave, and `after`'s take the place of the first of them. */
export function withReplacedResult(roll: LootRoll, before: TableResult, after: GeneratorOutcome): LootRoll {
  const held = heldDraws(before);
  const at = roll.draws.findIndex((draw) => held.has(draw.id));
  const draws = roll.draws.filter((draw) => !held.has(draw.id));
  draws.splice(at < 0 ? draws.length : at, 0, ...after.draws);
  return {
    ...roll,
    draws,
    ...(roll.results && { results: roll.results.map((result) => (result.id === before.id ? after.result : result)) }),
  };
}

async function rerolled(
  roll: LootRoll, result: TableResult, found: CollectionTable, request: GeneratorRollRequest, keep: Map<number, KeptPart>, nameTemplate?: string,
): Promise<LootRoll | null> {
  const outcome = await rollGeneratorOnce(found, request, {
    keep,
    ...(nameTemplate !== undefined && { nameTemplate }),
    kept: { id: result.id, ...(result.item && { item: result.item }) },
  });
  return outcome && withReplacedResult(roll, result, outcome);
}

/** `roll` with the part in `row` of `result` rolled again; null where it cannot be. */
export function rerollPart(roll: LootRoll, result: TableResult, row: number, found: CollectionTable | undefined, request: GeneratorRollRequest): Promise<LootRoll | null> {
  if (!canReroll(result, found)) return Promise.resolve(null);
  const keep = new Map(generatorShape(found.table!).parts
    .filter((part) => part.row !== row)
    .map((part) => [part.row, keptPart(result, part.row, roll.draws)] as const));
  return rerolled(roll, result, found, request, keep, result.generator?.name);
}

/** `roll` with every part of `result` but the `locked` rows rolled again, its Name too; null where it cannot be. */
export function rerollUnlocked(
  roll: LootRoll, result: TableResult, locked: ReadonlySet<number>, found: CollectionTable | undefined, request: GeneratorRollRequest,
): Promise<LootRoll | null> {
  if (!canReroll(result, found)) return Promise.resolve(null);
  const keep = new Map([...locked].map((row) => [row, keptPart(result, row, roll.draws)] as const));
  return rerolled(roll, result, found, request, keep);
}
