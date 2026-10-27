/**
 * The boss room of a typed dungeon: the arena its climax type describes (its platform standing
 * empty), then the climax type's pieces by its recipe.
 */

import type { PropKind } from '../model';
import { PROP_SPECS, isCellPiece } from '../props/catalogue';
import type { FurnishSpace } from '../props/furnishSpace';
import { furnishByRecipe } from '../props/recipe';
import type { Rng } from '../rng';
import { programmeOf } from '../themes/themes';
import type { ArenaSpec } from '../themes/themeTypes';
import { furnishArena } from './arena';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { type TypedRoom, typedSpace } from './typeTerrain';
import type { TerrainWork } from './work';

/** What cannot be walked in an arena takes at most this share of its floor, pieces and all. */
const ARENA_OPEN = 0.4;

/** An arena with nothing of its own: for a typed boss room whose type is no climax, which then takes no hazard and no set piece. */
const PLAIN_ARENA: ArenaSpec = { setPieces: [], mirrored: ['pillar', 'wall-fragment'], hazards: [] };

/** The arena of a typed boss room: its climax type's, else a plain one. */
export function arenaOf(work: TerrainWork, typed: TypedRoom): ArenaSpec {
  return programmeOf(work.theme.definition, work.tags)?.climax.find((c) => c.type === typed.spec.id)?.arena ?? PLAIN_ARENA;
}

/** The arena of its climax type, then the type's pieces besides the one it is built round (a throne room's statues), keeping the arena open. */
export function furnishTypedArena(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, typed: TypedRoom): void {
  const floor = work.floors[k];
  if (!floor) return;
  furnishArena(work, k, rc, rng, work.tags, arenaOf(work, typed));
  floor.deferPieces(() => arenaPieces(work, k, floor, rc, typed));
}

/** The climax type's pieces in its arena, keeping it open. */
function arenaPieces(work: TerrainWork, k: number, floor: FloorTerrain, rc: RoomCells, typed: TypedRoom): void {
  const base = typedSpace(work, k, rc, floor);
  // The arena stays open: what cannot be walked never takes more than this share of it.
  const open = (kind: PropKind): boolean => {
    const spec = PROP_SPECS[kind];
    const cells = spec.footing === 'block' ? (isCellPiece(spec) ? spec.footprint.along * spec.footprint.out : 1) : 0;
    return rc.blockedCount() + cells <= rc.floorCount * ARENA_OPEN;
  };
  const fs: FurnishSpace = { ...base, placeAllowed: (kind, at) => open(kind) && (base.placeAllowed?.(kind, at) ?? true) };
  furnishByRecipe(fs, { pieces: typed.spec.furnish.pieces }, typed.context);
}
