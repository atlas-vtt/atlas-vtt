/**
 * A roll on one of the collection's tables, as the history keeps it: Text tables give
 * results (their first column as text, the other columns as fields, the GM's hidden
 * columns marked), Items tables give item draws as a loot base does. Rows that roll other
 * tables or Base views (master tables) give what those gave.
 */

import type { LootRoll, TableResult, TableResultField } from '../loot/lootHistory';
import { toDraw, type LootDraw } from '../loot/lootRoller';
import { resolveCell, type CellContext, type TableResolver } from './resultCells';
import type { CollectionTable } from './TableNoteReader';
import { tableSourceId } from './tableLookup';
import type { RarityOption } from '../types/randomTableTypes';
import { TABLE_LIMITS } from './tableModel';
import { rollTable, type TableDraw } from './tableRoller';

export interface TableRollRequest {
  /** How many to draw; at most `TABLE_LIMITS.results`. */
  count: number;
  resolver: TableResolver;
  /** Named after plain-number item prices. */
  currency?: string | undefined;
  /** The collection's rarity words, which paint drawn items. */
  rarities?: readonly RarityOption[];
  random?: () => number;
}

export interface TableRollOutcome {
  results: TableResult[];
  draws: LootDraw[];
}

/** A Text table's result, and the items Base views linked in its text gave. */
async function textResult(found: CollectionTable, draw: TableDraw, context: CellContext): Promise<{ result: TableResult; items: LootDraw[] }> {
  const { source, table } = found;
  const hidden = new Set(source.hiddenColumns ?? []);
  const cells = draw.row?.cells ?? [];
  const text = await resolveCell(cells[0] ?? '', context);
  const fields: TableResultField[] = [];
  for (let column = 1; column < cells.length; column++) {
    const value = (await resolveCell(cells[column]!, context)).text.trim();
    const label = table!.columns[column] ?? '';
    if (value) fields.push({ label, value, ...(hidden.has(label) && { hidden: true as const }) });
  }
  const result: TableResult = {
    id: crypto.randomUUID(),
    source: [found.noteName, source.label ?? table!.name],
    notePath: source.path,
    ...(draw.roll && { roll: draw.roll }),
    text: text.text,
    ...(text.rolls.length > 0 && { rolls: text.rolls }),
    fields,
  };
  return { result, items: text.items };
}

async function itemDraws(found: CollectionTable, draw: TableDraw, context: CellContext): Promise<LootDraw[]> {
  if (!draw.row) return [];
  // A row that rolls another table or a Base view gives what that gave; any other row is its own item.
  const nested = await resolveCell(draw.row.cells[0] ?? '', context);
  if (nested.items.length > 0) return nested.items;
  const item = found.items?.[draw.row.index];
  return item ? [toDraw(item, context.currency, context.rarities)] : [];
}

/** Rolls `found` (a table that was found in its note); nothing for a table that is missing. */
export async function rollCollectionTable(found: CollectionTable, request: TableRollRequest): Promise<TableRollOutcome> {
  if (!found.table) return { results: [], draws: [] };
  const random = request.random ?? Math.random;
  const draws = rollTable(found.table, { count: request.count, noRepeats: found.source.noRepeats === true, random });
  const context: CellContext = {
    resolver: request.resolver,
    fromPath: found.source.path,
    random,
    trail: [tableSourceId({ path: found.source.path, index: found.table.index })],
    budget: { results: TABLE_LIMITS.results - draws.length },
    currency: request.currency,
    ...(request.rarities && { rarities: request.rarities }),
  };
  const outcome: TableRollOutcome = { results: [], draws: [] };
  for (const draw of draws) {
    if (found.source.kind === 'items') {
      outcome.draws.push(...await itemDraws(found, draw, context));
      continue;
    }
    const { result, items } = await textResult(found, draw, context);
    outcome.results.push(result);
    outcome.draws.push(...items);
  }
  return outcome;
}

/** The history entry of a roll; an older Atlas leaves one without items out whole. */
export function tableRollEntry(outcome: TableRollOutcome, mapName: string, rolledAt = Date.now()): LootRoll {
  return {
    id: crypto.randomUUID(),
    rolledAt,
    mapName,
    draws: outcome.draws,
    ...(outcome.results.length > 0 && { results: outcome.results }),
  };
}
