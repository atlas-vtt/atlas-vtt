/**
 * Rolling a generator: every part's cell resolved as any table cell is (dice, linked tables,
 * Base views), in row order, in one roll and so with one results budget; then the Name filled
 * with what the parts rolled. Parts may keep what they rolled before (locked parts, or all but
 * the one rerolled). A generator with a `Type` part is also an item. Pure: the cells are
 * resolved by the function handed in, which is `resolveCell`.
 */

import type { LootItem } from '../loot/lootItem';
import { toDraw, type LootDraw } from '../loot/lootRoller';
import type { RarityOption } from '../types/randomTableTypes';
import { fillName, generatorShape, partKey, partValues, TYPE_PART } from './generatorParts';
import type { CellContext, NestingStop, ResolvedCell } from './resultCells';
import type { RandomTable } from './tableModel';

/** Resolves one cell; `resolveCell`, handed in so this module and the cells do not import each other. */
export type CellResolution = (cell: string, context: CellContext) => Promise<ResolvedCell>;

export interface RolledPart {
  row: number;
  label: string;
  /** What it rolled, trimmed; empty for a part that gave nothing. */
  value: string;
  /** Items the Base views and Items tables its cell links gave. */
  items: LootDraw[];
}

/** What a part keeps instead of rolling again. */
export interface KeptPart {
  value: string;
  items: readonly LootDraw[];
}

export interface GeneratorRollOptions {
  /** Parts, by row, that keep what they rolled before. */
  keep?: ReadonlyMap<number, KeptPart>;
  /** The Name part as it rolled before, `{Part}`s unfilled: kept instead of rolling the Name again. */
  nameTemplate?: string;
}

export interface RolledGenerator {
  /** The Name part filled, else the generator's own name. */
  name: string;
  /** The Name part as it rolled, before its `{Part}`s were filled; absent without a Name part. */
  nameTemplate?: string;
  /** Every part but the Name, in row order, empty ones included. */
  parts: RolledPart[];
  stopped: NestingStop[];
}

/** Rolls `table` as a generator named `generatorName` where it has no Name part. */
export async function rollGenerator(
  table: RandomTable, generatorName: string, context: CellContext, resolve: CellResolution, options: GeneratorRollOptions = {},
): Promise<RolledGenerator> {
  const { name, parts } = generatorShape(table);
  // A part is no row of a table rolled on: a link to the generator itself is a loop, never a reroll.
  const { row: _row, ...partContext } = context;
  const stopped: NestingStop[] = [];
  const rolled: RolledPart[] = [];
  let nameTemplate = options.nameTemplate;
  for (const part of [...(name ? [name] : []), ...parts].sort((a, b) => a.row - b.row)) {
    const kept = part === name ? undefined : options.keep?.get(part.row);
    if (kept) {
      rolled.push({ row: part.row, label: part.label, value: kept.value, items: [...kept.items] });
      continue;
    }
    if (part === name && nameTemplate !== undefined) continue;
    const cell = await resolve(part.cell, partContext);
    stopped.push(...cell.stopped);
    if (part === name) nameTemplate = cell.text;
    else rolled.push({ row: part.row, label: part.label, value: cell.text.trim(), items: cell.items });
  }
  const filled = name && nameTemplate !== undefined ? fillName(nameTemplate, partValues(rolled)) : '';
  return { name: filled || generatorName, ...(name && nameTemplate !== undefined && { nameTemplate }), parts: rolled, stopped };
}

/** The parts that rolled something. */
export const shownParts = (rolled: RolledGenerator): RolledPart[] => rolled.parts.filter((part) => part.value !== '');

/** A rolled generator as one line of text, for a cell that links it: "+1 Longsword (Bonus: +1; Feature: oak leaves)". */
export function generatorText(rolled: RolledGenerator): string {
  const parts = shownParts(rolled).map((part) => `${part.label}: ${part.value}`);
  return parts.length > 0 ? `${rolled.name} (${parts.join('; ')})` : rolled.name;
}

export interface GeneratorItemOrigin {
  /** The generator's note, which the item's card opens. */
  notePath: string;
  /** [note name, generator name]. */
  source: string[];
  currency?: string | undefined;
  rarities?: readonly RarityOption[];
}

/**
 * The item a generator with a `Type` part gives: its name, its type, and the other parts as
 * lines of its description; null for a generator without one.
 */
export function generatorItem(rolled: RolledGenerator, origin: GeneratorItemOrigin): LootDraw | null {
  const type = rolled.parts.find((part) => partKey(part.label) === TYPE_PART);
  if (!type) return null;
  const lines = shownParts(rolled).filter((part) => part !== type).map((part) => `${part.label}: ${part.value}`);
  const item: LootItem = {
    id: origin.notePath,
    name: rolled.name,
    source: origin.source,
    ...(type.value && { type: type.value }),
    ...(lines.length > 0 && { description: lines.join('\n') }),
    properties: [],
  };
  return toDraw(item, origin.currency, origin.rarities);
}
