/**
 * The hazards of typed rooms, each laid only for one of its type's reasons and shaped by it: an
 * oubliette is one shaft cut square in the gaol's floor, a cistern a basin of deep water with a
 * walkable rim along its walls, a ruin's collapse an irregular chasm opening onto the floor below.
 * A room that takes its hazard is no longer furnished (only formations of nature stay in it).
 */

import type { CellPoint } from '../model';
import { type Rng, chance, shuffled } from '../rng';
import type { FeatureReason } from '../themes/features';
import type { RoomTypeSpec } from '../themes/themeTypes';
import { draft } from './catalog';
import { roughGround } from './difficult';
import { placeCaveReason } from './cavern/caveHazards';
import { leavesRoom, placeCollapse } from './hazards';
import type { RoomCells } from './roomCells';
import type { TerrainWork } from './work';

/** How often a room of a type with a hazard's reason takes the hazard rather than its pieces. */
const HAZARD_CHANCE: Readonly<Partial<Record<FeatureReason, number>>> = {
  oubliette: 0.5,
  cistern: 0.8,
  collapse: 1,
  'rotted-floor': 1,
  'fault-chasm': 0.9,
  sinkhole: 0.7,
  pitch: 0.8,
  'cave-lake': 1,
  'cave-stream': 1,
  sump: 1,
  'lava-flow': 1,
  'sulphur-spring': 1,
};

/** One shaft in the gaol's floor, a cell clear of its walls, the back half first. */
function oubliette(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const floor = work.floors[k];
  if (!floor || rc.depth < 3 || rc.width < 3) return false;
  const spots: CellPoint[] = [];
  for (let i = rc.depth - 2; i >= 1; i--) for (const j of shuffled(rng, Array.from({ length: rc.width - 2 }, (_, n) => n + 1))) spots.push(rc.cell(i, j));
  return spots.some((c) => leavesRoom(rc, [c]) && rc.allows([c], 'block') && floor.place(draft('pit', rc.room.id, [c], { name: 'dungeon.terrain.oubliette' })) !== null);
}

/** A basin of deep water filling the cistern but for a rim a cell wide along its walls, the largest that leaves the room whole. */
function cisternBasin(work: TerrainWork, k: number, rc: RoomCells): boolean {
  const floor = work.floors[k];
  if (!floor || rc.depth < 4 || rc.width < 4) return false;
  for (let shrink = 0; shrink <= 2; shrink++) {
    const di = rc.depth - 2 - shrink * 2;
    const dj = rc.width - 2 - shrink * 2;
    if (di < 2 || dj < 2) break;
    const cells = rc.block(1 + shrink, 1 + shrink, di, dj);
    if (cells.some((c) => rc.nearStairs(c)) || !rc.allows(cells, 'block')) continue;
    if (floor.place(draft('deep-water', rc.room.id, cells)) !== null) return true;
  }
  return false;
}

/** The hazard of a typed room, laid for one of its reasons; whether the room took it (a ruined room its collapse or rubble), keeping no pieces but nature's. */
export function placeTypeHazard(work: TerrainWork, k: number, rc: RoomCells, spec: RoomTypeSpec, rng: Rng): boolean {
  const ruined = work.theme.ruined;
  for (const reason of spec.terrain.features ?? []) {
    const odds = HAZARD_CHANCE[reason];
    if (odds === undefined || !chance(rng, odds)) continue;
    switch (reason) {
      case 'oubliette':
        if (oubliette(work, k, rc, rng)) return true;
        break;
      case 'cistern':
        if (cisternBasin(work, k, rc)) return true;
        break;
      case 'collapse':
      case 'rotted-floor': {
        const floor = work.floors[k];
        if (!ruined || !floor) break;
        const fell = placeCollapse(work, k, rc, rng);
        // Where nothing lies below to fall to, the floor has only given way: rubble or rotten boards. Either way the room is its ruin.
        if (reason === 'rotted-floor' || !fell) roughGround(floor, rc, rng, reason === 'rotted-floor' ? 'broken-floor' : 'rubble-field');
        return true;
      }
      default:
        if (work.cave && placeCaveReason(work, k, rc, reason, rng)) return true;
        break;
    }
  }
  return false;
}
