/**
 * A typed room's pieces by its type's recipe: the defining piece first, then the other pieces in
 * order by verb. Deeper rooms of a repeated type get more of their optional pieces (the depth
 * ladder), and the theme's richness scales them after that. A defining piece that cannot be
 * placed (not drawn yet, or no room for it) leaves the room bare.
 */

import { dir } from '../geometry';
import type { CellPoint, DungeonProp, PropKind } from '../model';
import { chance, int } from '../rng';
import { WALL_SIDES } from '../terrain/roomCells';
import type { FurnishRecipe, Piece } from '../themes/themeTypes';
import { dais } from './arrange';
import { besideParent, flanking, inGrid, onShore } from './arrangeGroups';
import { PROP_SPECS } from './catalogue';
import { againstWall, atBackWall, atCentre, inCorner, inRows, onWall } from './cellVerbs';
import { type FurnishSpace, type PlacedPiece, record } from './furnishSpace';
import { keptPieces, ruinedKeep } from './ruined';
import { occupyCells } from './space';

export interface RecipeContext {
  /** 0 for the shallowest room of its type, 1 for the deepest; 0.5 for a type held once. */
  depthRank: number;
  ruined: boolean;
  /** The theme's richness for the room, 0..1; 1 knowing nothing more. */
  richness: number;
}

/** The room's free cells whose middles lie within `half` cells of a prop's middle across its front and `from`..`to` cells ahead of it. */
function cellsUnder(fs: FurnishSpace, prop: DungeonProp, half: number, from: number, to: number): CellPoint[] {
  const { cells: rc } = fs;
  const out: CellPoint[] = [];
  const front = { x: Math.sin(prop.rotation), y: -Math.cos(prop.rotation) };
  for (let i = 0; i < rc.depth; i++) {
    for (let j = 0; j < rc.width; j++) {
      const c = rc.cell(i, j);
      const dx = c.x + 0.5 - prop.x;
      const dy = c.y + 0.5 - prop.y;
      const ahead = dx * front.x + dy * front.y;
      if (ahead > from && ahead < to && Math.abs(dx * front.y - dy * front.x) < half && rc.isFree(c)) out.push(c);
    }
  }
  return out;
}

/** A dais against the back wall, where it is offered; its cells taken walkable. */
function onDais(fs: FurnishSpace): DungeonProp[] {
  if (!fs.offered.has('dais')) return [];
  const platform = dais(fs.space, fs.doors);
  if (!platform) return [];
  const cells = cellsUnder(fs, platform, 1.5 * platform.scale, 0, 1.35 * platform.scale);
  fs.cells.take(cells, 'walk');
  occupyCells(fs.space, cells);
  return [record(fs, { prop: platform, cells, clear: [], facing: dir(Math.round(Math.sin(platform.rotation)), Math.round(-Math.cos(platform.rotation))) })];
}

const lastOf = (fs: FurnishSpace, kind: PropKind | undefined): PlacedPiece | undefined => (kind ? fs.placed.findLast((p) => p.prop.kind === kind) : undefined);

/** One piece of a recipe by its verb, `count` of it; what it placed. */
function placeByVerb(fs: FurnishSpace, piece: Piece, count: number, defining: PlacedPiece | undefined): DungeonProp[] {
  const { kind } = piece;
  const repeat = (place: () => DungeonProp | null): DungeonProp[] => Array.from({ length: count }, place).filter((p): p is DungeonProp => p !== null);
  switch (piece.verb) {
    case 'backWall':
      return kind === 'dais' ? onDais(fs) : repeat(() => atBackWall(fs, kind));
    case 'wall':
      if (PROP_SPECS[kind].wallPiece) return onWall(fs, kind, count);
      return repeat(() => againstWall(fs, kind, WALL_SIDES));
    case 'rows':
      return inRows(fs, kind, count);
    case 'centre':
      return repeat(() => atCentre(fs, kind));
    case 'corner':
      return repeat(() => inCorner(fs, kind));
    case 'flank':
      return Array.from({ length: count }).flatMap(() => flanking(fs, kind, piece.of === 'door' ? 'door' : (defining ?? null)));
    case 'withParent': {
      const parent = lastOf(fs, piece.parent);
      return parent ? besideParent(fs, kind, parent, count) : [];
    }
    case 'grid':
      return inGrid(fs, kind, count);
    case 'shore':
      return onShore(fs, kind, count);
  }
}

const countOf = (fs: FurnishSpace, piece: Piece): number => (piece.count ? int(fs.rng, piece.count[0], piece.count[1]) : 1);

/** The room's pieces by its recipe, in order; what was placed. */
export function furnishByRecipe(fs: FurnishSpace, recipe: FurnishRecipe, context: RecipeContext): DungeonProp[] {
  const out: DungeonProp[] = [];
  const { defining } = recipe;
  let definingPiece: PlacedPiece | undefined;
  if (defining) {
    const placed = placeByVerb(fs, defining, countOf(fs, defining), undefined);
    if (placed.length === 0) return out;
    out.push(...placed);
    definingPiece = fs.placed.find((p) => p.prop === placed[0]);
  }
  // A ruin keeps its defining piece and part of the rest.
  const pieces = context.ruined ? keptPieces(fs.rng, recipe.pieces, ruinedKeep(fs.rng)) : recipe.pieces;
  for (const piece of pieces) {
    const odds = piece.always ? 1 : Math.min(1, (piece.chance ?? 1) * (0.7 + 0.6 * context.depthRank)) * context.richness;
    if (!chance(fs.rng, odds)) continue;
    out.push(...placeByVerb(fs, piece, countOf(fs, piece), definingPiece));
  }
  return out;
}
