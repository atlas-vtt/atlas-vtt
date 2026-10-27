import type { DungeonTerrain } from '../../model';
import type { Hand } from '../art/hand';
import { isNaturalDeepWater, naturalDeepRings } from '../art/pools';
import { cellRings, edgesFacing } from './cellRings';
import { dropDepth, drawDrop } from './drops';
import { cellSet, onFloor } from './pieces';
import { chiselled } from './stones';

/** Hazards on the floor that are no hole: pits, deep water and channels of lava, acid or water. */

export function drawPit(hand: Hand, piece: DungeonTerrain): void {
  drawDrop(hand, cellRings(piece.cells).map(r => chiselled(r, piece.id * 11 + 1, 0.02)), 'pit');
}

/**
 * Deep water over whole cells: it falls away steeply just inside its shore. A cave's is the depth of
 * the floor's water it lies in (`drawPools`); only where the view hides that water is it drawn here,
 * with a shore of its own.
 */
export function drawDeepWater(hand: Hand, piece: DungeonTerrain): void {
  if (isNaturalDeepWater(hand.scene.env.dungeon.floor, piece)) {
    if (!hand.scene.env.view.water) drawNaturalDeep(hand, piece);
    return;
  }
  const rings = cellRings(piece.cells).map(r => chiselled(r, piece.id * 5 + 2, 0.035));
  hand.water(rings, dropDepth(hand, rings).depth, true);
}

function drawNaturalDeep(hand: Hand, piece: DungeonTerrain): void {
  const rings = naturalDeepRings(piece.cells, hand.scene.env.dungeon.model.seed + piece.id);
  hand.water(rings, dropDepth(hand, rings).depth, true);
}

/** A channel from wall to wall: molten rock, acid or deep water, its banks cut where they meet floor. */
export function drawChannel(hand: Hand, piece: DungeonTerrain): void {
  if (isNaturalDeepWater(hand.scene.env.dungeon.floor, piece)) {
    if (!hand.scene.env.view.water) drawNaturalDeep(hand, piece);
    return;
  }
  const own = cellSet(piece.cells);
  const rings = cellRings(piece.cells).map(r => chiselled(r, piece.id * 3 + 7, 0.03));
  const hazard = piece.traits.hazard;
  if (hazard === 'lava' || hazard === 'acid') hand.lava(rings, hazard);
  else hand.water(rings, dropDepth(hand, rings).depth, true);
  const banks = edgesFacing(piece.cells, c => !own.has(`${c.x},${c.y}`) && onFloor(hand.scene.env, c));
  hand.line(banks.map(e => [e.from, e.to]), 'outline');
}
