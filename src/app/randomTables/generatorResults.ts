/**
 * A generator's roll as the history keeps it: one `TableResult` per roll, named by its Name part,
 * its parts as fields (empty ones left out), so history, copy and older versions read it as any
 * Text result; it also records its generator and each part's row for rerolls. A generator with a
 * `Type` part is an item too, a draw of the roll that its result names. Items the parts' links
 * gave are draws of the roll, which their part names.
 */

import type { TableResult, TableResultField } from '../loot/lootHistory';
import type { LootDraw } from '../loot/lootRoller';
import type { RarityOption } from '../types/randomTableTypes';
import { generatorItem, rollGenerator, shownParts, type GeneratorRollOptions, type RolledGenerator } from './generatorRoller';
import { resolveCell, type CellContext, type TableResolver } from './resultCells';
import type { CollectionTable } from './TableNoteReader';
import { tableSourceId } from './tableLookup';
import { TABLE_LIMITS } from './tableModel';

export interface GeneratorRollRequest {
  resolver: TableResolver;
  currency?: string | undefined;
  rarities?: readonly RarityOption[];
  random?: () => number;
}

/** One rolled result and the draws it holds: its item first, then its parts' items. */
export interface GeneratorOutcome {
  result: TableResult;
  draws: LootDraw[];
}

/** The ids a result keeps when it is rolled again, so cards and the history follow it. */
export interface KeptIds {
  id: string;
  item?: string;
}

/** The name a listed generator goes by: the GM's in Atlas, else the table's. */
export const generatorName = (found: CollectionTable): string => found.source.label ?? found.table?.name ?? found.noteName;

/** The context a roll of `found` resolves its parts in; `results` is the budget for nested results. */
export function generatorContext(found: CollectionTable, request: GeneratorRollRequest, results: number): CellContext {
  return {
    resolver: request.resolver,
    fromPath: found.source.path,
    random: request.random ?? Math.random,
    trail: found.table ? [tableSourceId({ path: found.source.path, index: found.table.index })] : [],
    budget: { results },
    currency: request.currency,
    ...(request.rarities && { rarities: request.rarities }),
  };
}

/** `rolled` as the result of `found`, keeping `kept`'s ids when it rolls a result again. */
export function generatorOutcome(found: CollectionTable, rolled: RolledGenerator, request: GeneratorRollRequest, kept?: KeptIds): GeneratorOutcome {
  const name = generatorName(found);
  const made = generatorItem(rolled, {
    notePath: found.source.path, source: [found.noteName, name], currency: request.currency, ...(request.rarities && { rarities: request.rarities }),
  });
  const item = made && kept?.item ? { ...made, id: kept.item } : made;
  const parts = shownParts(rolled);
  const fields = parts.map((part): TableResultField => ({
    label: part.label,
    value: part.value,
    row: part.row,
    ...(part.items.length > 0 && { items: part.items.map((draw) => draw.id) }),
  }));
  const result: TableResult = {
    id: kept?.id ?? crypto.randomUUID(),
    source: [found.noteName, name],
    notePath: found.source.path,
    text: rolled.name,
    fields,
    generator: { path: found.source.path, index: found.source.index, ...(rolled.nameTemplate !== undefined && { name: rolled.nameTemplate }) },
    ...(item && { item: item.id }),
  };
  return { result, draws: [...(item ? [item] : []), ...parts.flatMap((part) => part.items)] };
}

/** Rolls `found` as a generator once, parts kept as `options` says. */
export async function rollGeneratorOnce(
  found: CollectionTable, request: GeneratorRollRequest, options: GeneratorRollOptions & { results?: number; kept?: KeptIds } = {},
): Promise<GeneratorOutcome | null> {
  if (!found.table) return null;
  const { results = TABLE_LIMITS.results - 1, kept, ...parts } = options;
  const rolled = await rollGenerator(found.table, generatorName(found), generatorContext(found, request, results), resolveCell, parts);
  return generatorOutcome(found, rolled, request, kept);
}

/** `count` results of `found`, sharing one results budget; nothing for a generator that is missing. */
export async function rollGeneratorResults(
  found: CollectionTable, request: GeneratorRollRequest, count: number,
): Promise<{ results: TableResult[]; draws: LootDraw[] }> {
  const rolls = Math.min(count, TABLE_LIMITS.results);
  if (!found.table) return { results: [], draws: [] };
  const context = generatorContext(found, request, TABLE_LIMITS.results - rolls);
  const outcome: { results: TableResult[]; draws: LootDraw[] } = { results: [], draws: [] };
  for (let i = 0; i < rolls; i++) {
    const rolled = await rollGenerator(found.table, generatorName(found), context, resolveCell);
    const { result, draws } = generatorOutcome(found, rolled, request);
    outcome.results.push(result);
    outcome.draws.push(...draws);
  }
  return outcome;
}
