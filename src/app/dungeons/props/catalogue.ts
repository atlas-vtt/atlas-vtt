/**
 * Every kind of piece described once: how much floor it takes, which cells around it stay walkable, whether it hangs on the wall, what cover it gives and whether it
 * can be walked across. Placement (`cellVerbs.ts`, `arrangeGroups.ts`, `space.ts`), the scene's
 * features and the room notes read it; nothing else keeps a table per kind.
 */

import type { CoverLevel } from '../model';
import type { Footing } from '../terrain/catalog';
import { CAVERN_PROP_SPECS } from './catalogueNatural';
import type { PropKind } from './propKinds';

/** The cells kept walkable around a piece: the row before it, all round, or none. */
export type PropClear = 'front' | 'ring' | 'none';

/** Whole cells along its wall or front and out from it, or a disc of `reach` cells placed below a cell. */
export type Footprint = { along: number; out: number } | { reach: number };

export interface PropSpec {
  footprint: Footprint;
  clear: PropClear;
  /** Hangs on a wall run no door breaks and takes no floor. */
  wallPiece?: true;
  cover?: CoverLevel;
  /** Whether its cells can be walked across; none for a wall piece. */
  footing?: Footing;
  /** A formation nature made: a hazard room keeps it. */
  natural?: true;
}

/** A free-standing disc. */
function standing(reach: number, cover?: CoverLevel): PropSpec {
  return { footprint: { reach }, clear: 'none', footing: 'block', ...(cover && { cover }) };
}

export const PROP_SPECS: Readonly<Record<PropKind, PropSpec>> = {
  dais: { footprint: { reach: 1.5 }, clear: 'front', footing: 'walk' },
  statue: standing(0.35, 'total'),
  bust: { ...standing(0.2, 'half'), clear: 'front' },
  fountain: standing(0.52, 'half'),
  well: standing(0.42, 'half'),
  // A fireplace built into a wall, its hearth stone before it.
  hearth: { footprint: { along: 2, out: 1 }, clear: 'front', footing: 'block' },
  ...CAVERN_PROP_SPECS,
};

/** Whether a piece takes whole cells (a wall piece takes a row of none). */
export function isCellPiece(spec: PropSpec): spec is PropSpec & { footprint: { along: number; out: number } } {
  return 'along' in spec.footprint;
}

/** How far a wall piece reaches off its wall into the room, in cells. */
const WALL_PIECE_REACH = 0.1;

/** How far a piece reaches from its centre, in cells: a disc's radius, a wall piece's depth, else half its shorter side. */
export function propReach(kind: PropKind): number {
  const spec = PROP_SPECS[kind];
  const { footprint } = spec;
  if ('reach' in footprint) return footprint.reach;
  if (spec.wallPiece) return WALL_PIECE_REACH;
  return Math.min(footprint.along, footprint.out) / 2;
}
