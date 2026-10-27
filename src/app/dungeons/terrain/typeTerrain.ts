/**
 * The terrain and pieces of a room the theme typed: its lanes kept clear first, its terrain and
 * cover, then its recipe placed through the room's cells, where the theme's facts allow, offering
 * only kinds with a drawing.
 */

import { DRAWN_PROP_KINDS } from '../drawnKinds';
import { cellKey } from '../geometry';
import type { TerrainKind } from '../model';
import { PROP_SPECS } from '../props/catalogue';
import { type FurnishSpace, furnishSpace } from '../props/furnishSpace';
import { type RecipeContext, furnishByRecipe } from '../props/recipe';
import { frameOf } from '../props/roomFrame';
import { roomSpace } from '../props/space';
import { type Rng, chance } from '../rng';
import type { RoomTypeId } from '../themes/roomTypes';
import type { FurnishRecipe, Piece, RoomTypeSpec } from '../themes/themeTypes';
import { CRAMPED_AREA, holdsFight, pillars, structureCover } from './cover';
import { ruinedGround } from './difficult';
import { platformAtFarWall } from './elevation';
import type { FloorTerrain } from './floorTerrain';
import { placeInterest } from './interest';
import type { RoomCells } from './roomCells';
import { reserveLanes } from './roomLanes';
import type { TerrainWork } from './work';

/** How often a room of a ruin lies under rubble or broken floor. */
const RUINED_GROUND_CHANCE = 0.6;

/** A room's type and how its recipe is read there. */
export interface TypedRoom {
  spec: RoomTypeSpec;
  context: RecipeContext;
}

/** The cells pieces keep off in a room: its stairwells, the cells it must keep reachable, and every cell terrain fills. */
function keptClear(floor: FloorTerrain, rc: RoomCells): Set<string> {
  return new Set([...floor.takenCells(), ...floor.lane, ...[...floor.stairCellsIn(rc), ...rc.needed].map((c) => cellKey(c.x, c.y))]);
}

/** The pieces of a typed room, with what is drawn and the theme's facts, from the furnishing's own stream. */
export function typedSpace(work: TerrainWork, k: number, rc: RoomCells, floor: FloorTerrain): FurnishSpace {
  const { room } = rc;
  return furnishSpace({
    floor,
    cells: rc,
    space: roomSpace(frameOf(room), keptClear(floor, rc), floor.plan.columns),
    rng: work.furnishRng(k, `${room.id}`),
    offered: DRAWN_PROP_KINDS,
    doors: floor.plan.doors,
    placeAllowed: (kind, at) => work.theme.facts.placeAllowed(kind, at, { floor: k, room: room.id }),
  });
}

/** A recipe as a room that took its hazard keeps it: only the formations nature made. */
function naturalOnly(recipe: FurnishRecipe): FurnishRecipe {
  const natural = (piece: Piece | undefined): boolean => piece !== undefined && PROP_SPECS[piece.kind].natural === true;
  return { ...(natural(recipe.defining) && { defining: recipe.defining }), pieces: recipe.pieces.filter(natural) };
}

/** The terrain the type allows beyond its pieces: a summoning circle, a basin, pillars in a hall. A platform at the far wall only where nothing of the recipe stands there. */
function allowedTerrain(work: TerrainWork, k: number, rc: RoomCells, spec: RoomTypeSpec, rng: Rng): void {
  const floor = work.floors[k];
  if (!floor) return;
  const allows = (kind: TerrainKind): boolean => spec.terrain.allows?.includes(kind) === true;
  if (allows('mosaic')) placeInterest(floor, rc, rng, 'mosaic');
  if (allows('pool') && chance(rng, 0.5)) placeInterest(floor, rc, rng, 'pool');
  if (allows('pillar') && rc.floorCount > CRAMPED_AREA && chance(rng, 0.6)) pillars(floor, rc, rng);
  const atBack = spec.furnish.defining?.verb === 'backWall';
  if (allows('platform') && !atBack && rc.depth >= 6 && chance(rng, 0.4)) platformAtFarWall(floor, rc, 1, rc.width - 2, 1);
}

/**
 * A typed room: its lanes kept clear, then its terrain from the terrain stream (what the type
 * allows, cover, a ruin's ground), and, once the floor's water and undergrowth lie, its pieces by
 * its recipe from the furnishing stream (only nature's in a room that took its hazard). A room left
 * empty gets its lanes and its cover and nothing else. Terrain never waits on a piece, so which
 * kinds are drawn moves no terrain.
 */
export function furnishTypedRoom(work: TerrainWork, k: number, rc: RoomCells, typed: TypedRoom, options: { hazarded?: boolean; empty?: boolean } = {}): void {
  const floor = work.floors[k];
  if (!floor) return;
  const { spec, context } = typed;
  const { hazarded = false, empty = false } = options;
  const rng = work.rng(k, `type:${rc.room.id}`);
  reserveLanes(rc);
  // A room whose hazard (or the collapse of its floor) is the fight takes no cover, nor one of a theme that shows architecture alone.
  const covered = !hazarded && !work.theme.definition.architectureOnly && holdsFight(floor, rc);
  const own = !hazarded && !empty;
  if (own) allowedTerrain(work, k, rc, spec, rng);
  // Cover before a ruin's decay, which would take its place.
  if (covered) structureCover(floor, rc, rng, work.tags, work.cave !== undefined);
  if (own && work.theme.ruined && chance(rng, RUINED_GROUND_CHANCE)) ruinedGround(floor, rc, rng);
  if (!empty) floor.deferPieces(() => furnishByRecipe(typedSpace(work, k, rc, floor), hazarded ? naturalOnly(spec.furnish) : spec.furnish, context));
}

/**
 * Where each room of a repeated type ranks by depth among the rooms of its type: 0 the
 * shallowest, 1 the deepest, 0.5 for a type held once; by floor, then room id.
 */
export function depthRanks(types: readonly ReadonlyMap<number, RoomTypeId>[], depthOf: (floor: number, room: number) => number): Map<number, number>[] {
  const byType = new Map<RoomTypeId, { floor: number; room: number; depth: number }[]>();
  types.forEach((floorTypes, floor) => {
    for (const [room, type] of floorTypes) byType.set(type, [...(byType.get(type) ?? []), { floor, room, depth: depthOf(floor, room) }]);
  });
  const out = types.map(() => new Map<number, number>());
  for (const rooms of byType.values()) {
    const ranked = [...rooms].sort((a, b) => a.depth - b.depth || a.floor - b.floor || a.room - b.room);
    ranked.forEach((r, k) => out[r.floor]?.set(r.room, ranked.length === 1 ? 0.5 : k / (ranked.length - 1)));
  }
  return out;
}
