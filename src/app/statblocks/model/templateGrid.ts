/**
 * The grid the template editor shows a template's layout as, below the header
 * Atlas draws (`templateHeader.ts`): rows. A Side by side block at the top
 * level is a row of tiles, any other top-level block a row of one tile. The
 * grid is a way of reading the tree every template has; it adds nothing to
 * the format. Pure.
 */

import { blockSpec } from './blockCatalogue';
import { headerPartOf, isHeaderBlockId, shownHeaderParts } from './templateHeader';
import type { TreeTarget } from './treeEdit';
import { findBlock } from './treeQueries';
import type { StatblockTemplate, TemplateBlock, TemplateLayout } from './templateTypes';

/** What a tile is to the person editing: the editor's seven kinds, and `other` for blocks it shows as they render. */
export type TileKind = 'value' | 'metric' | 'abilities' | 'table' | 'counters' | 'text' | 'divider' | 'other';

export interface GridTile {
  id: string;
  kind: TileKind;
}

export interface GridRow {
  /** The top-level block the row is. */
  id: string;
  /** A Side by side block: its children are the tiles. */
  paired: boolean;
  tiles: GridTile[];
}

export interface TemplateGrid {
  rows: GridRow[];
}

/** A Tabs block whose every tab holds one list of abilities and nothing else: an Abilities tile with tabs. */
export function isAbilityTabs(block: TemplateBlock): boolean {
  return block.type === 'tabs' && block.blocks.length > 0 && block.blocks.every((tab) =>
    tab.type === 'section' && tab.blocks.length === 1 && tab.blocks[0]?.type === 'entries');
}

export function tileKind(block: TemplateBlock): TileKind {
  switch (block.type) {
    case 'stat': case 'tags': case 'pairs': case 'track': return 'value';
    case 'metric': return 'metric';
    case 'entries': return 'abilities';
    case 'scores': return 'table';
    case 'counters': return 'counters';
    case 'text': return 'text';
    case 'divider': return 'divider';
    case 'tabs': return isAbilityTabs(block) ? 'abilities' : 'other';
    default: return 'other';
  }
}

const KIND_NAMES: Readonly<Record<Exclude<TileKind, 'other'>, string>> = {
  value: 'Value', metric: 'Metric', abilities: 'Abilities', table: 'Table', counters: 'Counters', text: 'Text', divider: 'Divider',
};

/** What a block is called before it has a name of its own: its kind in the grid, else its block's name in the format ("Section", "Tabs"). */
export function kindName(block: TemplateBlock): string {
  const kind = tileKind(block);
  return kind === 'other' ? blockSpec(block.type).label : KIND_NAMES[kind];
}

const tileOf = (block: TemplateBlock): GridTile => ({ id: block.id, kind: tileKind(block) });

export function templateGrid(layout: TemplateLayout): TemplateGrid {
  const rows = layout.blocks.map((block): GridRow => (block.type === 'row'
    ? { id: block.id, paired: true, tiles: block.blocks.map(tileOf) }
    : { id: block.id, paired: false, tiles: [tileOf(block)] }));
  return { rows };
}

/** Whether a block is a tile of the grid: a top-level block other than a Side by side, or a child of a top-level Side by side. */
export function isGridTile(layout: TemplateLayout, id: string): boolean {
  return templateGrid(layout).rows.some((row) => row.tiles.some((tile) => tile.id === id));
}

/** The row a tile stands in. */
export function rowOfTile(layout: TemplateLayout, id: string): GridRow | null {
  return templateGrid(layout).rows.find((row) => row.tiles.some((tile) => tile.id === id)) ?? null;
}

/** Where a block may be put down: the top level, or a row of the grid. */
export function gridAcceptsList(layout: TemplateLayout, parentId: string | null): boolean {
  return parentId === null || layout.blocks.some((block) => block.id === parentId && block.type === 'row');
}

/** Whether a block may go beside `targetId`: the target must be a tile of the grid. */
export function gridAcceptsBeside(layout: TemplateLayout, targetId: string): boolean {
  return isGridTile(layout, targetId);
}

/**
 * The layout with its rows tidied: a top-level Side by side left with one
 * tile becomes that tile, an empty one goes. The same layout where nothing
 * needed it.
 */
export function tidyRows(layout: TemplateLayout): TemplateLayout {
  let changed = false;
  const blocks = layout.blocks.flatMap((block): TemplateBlock[] => {
    if (block.type !== 'row' || block.blocks.length > 1) return [block];
    changed = true;
    return block.blocks;
  });
  return changed ? { ...layout, blocks } : layout;
}

/**
 * What can be selected, in reading order: the parts of the header the card
 * draws, then the tiles. A row is no selection of its own, and the inside of
 * a compound tile is edited as JSON.
 */
export function selectableBlocks(template: StatblockTemplate): string[] {
  const header = shownHeaderParts(template).map((part) => part.block.id);
  return [...header, ...templateGrid(template.layout).rows.flatMap((row) => row.tiles.map((tile) => tile.id))];
}

/** The selectable block a block stands for: a header part itself, else itself or the nearest tile holding it (a tile around a compound tile's inside). */
export function selectableFor(template: StatblockTemplate, id: string): string | null {
  const part = headerPartOf(template, id);
  if (part) return part.hidden ? null : id;
  const selectable = new Set(templateGrid(template.layout).rows.flatMap((row) => row.tiles.map((tile) => tile.id)));
  let current: string | null = id;
  for (let depth = 0; current !== null && depth < 64; depth++) {
    if (selectable.has(current)) return current;
    current = findBlock(template.layout.blocks, current)?.parentId ?? null;
  }
  return null;
}

/**
 * Where a new tile goes: a row of its own right after the row that holds
 * `anchorId`, the first row where the anchor is a part of the header, else
 * at the end of the template.
 */
export function gridInsertTarget(layout: TemplateLayout, anchorId: string | null): TreeTarget {
  const at = anchorId === null ? -1 : layout.blocks.findIndex((block) => block.id === anchorId || findBlock([block], anchorId) !== null);
  if (at < 0) return { parentId: null, index: anchorId !== null && isHeaderBlockId(anchorId) ? 0 : layout.blocks.length };
  return { parentId: null, index: at + 1 };
}

/** Where a new tile goes above the row holding `id`: right before that row. */
export function gridInsertAbove(layout: TemplateLayout, id: string): TreeTarget {
  const at = layout.blocks.findIndex((block) => block.id === id || findBlock([block], id) !== null);
  return { parentId: null, index: at < 0 ? layout.blocks.length : at };
}
