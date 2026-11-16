import type { DungeonTerrain } from '../../model';
import type { Vec } from '../geometry';
import type { RenderEnv } from '../renderEnv';
import { pitchRims } from '../cave/ways/shafts';
import { holeRings } from '../terrain/holes';
import { isHole, shownPieces } from '../terrain/pieces';

/**
 * Where a cave's floor opens downward (its holes and the mouths of the pitches going down from
 * it): the grid stops at their rims, since the floor does, while it runs on across a terrace.
 */
export function caveOpenings(env: RenderEnv): Vec[][] {
  if (env.dungeon.floor.cave === undefined) return [];
  return [...shownPieces(env).filter(isHole).flatMap(piece => holeRings(piece, env)), ...pitchRims(env)];
}

/**
 * The outline of the hole overhead that the floor under it lies below (`DungeonTerrain.under`): the
 * hole's own outline on the floor above it, so the opening drawn in the ceiling is the one cut in
 * that floor. None where no hole above names it.
 */
export function openingAbove(env: RenderEnv, piece: DungeonTerrain): Vec[][] {
  const { model, index } = env.dungeon;
  const hole = model.floors.flatMap(floor => floor.terrain).find(p => p.opening !== undefined && p.opening.link === piece.under && p.opening.bottom === index);
  return hole ? holeRings(hole, env) : [];
}
