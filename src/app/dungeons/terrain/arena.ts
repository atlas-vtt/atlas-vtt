/**
 * The boss room as an arena (Terrain principles 1, 5, 6): open, with few strong features. The high
 * ground at the far side (a platform, 10 ft where the room is deep, with nothing standing on it),
 * one objective set piece the GM can use beyond hit points (three statues, a ring of standing
 * stones, or four pillars), wide cover that breaks the sight line from the door to the platform, and a hazard
 * where it fits (a channel before the platform, bridged; or pits flanking the floor). It stays
 * open: pieces that cannot be walked never take more than a third of its floor.
 */

import type { CellDir, CellPoint, DungeonRoom } from '../model';
import { dir } from '../geometry';
import { type Rng, chance, weighted } from '../rng';
import type { DungeonTag } from '../tags';
import type { ArenaSetPiece, ArenaSpec } from '../themes/themeTypes';
import { draft } from './catalog';
import { type CoverShape, ensureCover, tryShape } from './cover';
import { farWallBlock, ledgeAlongWall, platformAtFarWall } from './elevation';
import type { FloorTerrain } from './floorTerrain';
import { placeCaveHazard } from './cavern/caveHazards';
import { placeHazard } from './hazards';
import { placeInterest } from './interest';
import { RoomCells } from './roomCells';
import type { TerrainWork } from './work';

/** Pieces that cannot be walked take at most this share of the arena's floor. */
const OPEN_SHARE = 1 / 3;

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

function roomy(rc: RoomCells, cells: number): boolean {
  return rc.blockedCount() + cells <= rc.floorCount * OPEN_SHARE;
}

/** The objective in the arena's open middle, between the door and the platform. */
function setPiece(floor: FloorTerrain, rc: RoomCells, rng: Rng, choice: ArenaSetPiece, platformDepth: number): boolean {
  const room = rc.room.id;
  const facing = negate(rc.axis);
  const open = rc.depth - platformDepth;
  const midI = Math.max(1, Math.floor(open / 2) - 1);
  const midJ = Math.floor((rc.width - 1) / 2);
  switch (choice) {
    case 'statues': {
      // Three statues in a triangle, its point towards the platform.
      const spots = [rc.block(midI + 2, midJ, 1, 1), rc.block(midI, midJ - 2, 1, 1), rc.block(midI, midJ + 2, 1, 1)];
      if (rc.width < 5 || open < 5 || !spots.every((cells) => rc.fits(cells)) || !roomy(rc, 3)) return false;
      if (!rc.allows(spots.flat(), 'block')) return false;
      spots.forEach((cells) => floor.place(draft('statue', room, cells, { facing: dir(cells[0]!.x - rc.cell(midI + 1, midJ).x, cells[0]!.y - rc.cell(midI + 1, midJ).y) })));
      return true;
    }
    case 'ring': {
      const size = rc.width >= 10 && open >= 8 ? 3 : 2;
      if (rc.width < size + 4 || open < size + 3) return false;
      const j = Math.floor((rc.width - size) / 2);
      return roomy(rc, size * size) && floor.place(draft('portal-ring', room, rc.block(midI, j, size, size), { facing })) !== null;
    }
    case 'mosaic':
      return placeInterest(floor, rc, rng, 'mosaic');
    case 'pillars': {
      if (rc.width < 7 || open < 6) return false;
      const corners = [
        [midI - 1, 1],
        [midI - 1, rc.width - 2],
        [midI + 2, 1],
        [midI + 2, rc.width - 2],
      ] as const;
      const cells = corners.map(([i, j]) => rc.block(Math.max(1, i), j, 1, 1));
      if (!roomy(rc, 4) || !cells.every((c) => rc.fits(c)) || !rc.allows(cells.flat(), 'block')) return false;
      cells.forEach((c) => floor.place(draft('pillar', room, c, { facing })));
      return true;
    }
  }
}

type CoverKind = ArenaSpec['mirrored'][number];

/**
 * Wide cover across the arena's middle, of the kinds it may take (pillars or wall fragments
 * unless its climax type says otherwise): built pieces mirrored, a rubble heap alone, since
 * nothing natural is set in pairs by rule.
 */
function wideCover(floor: FloorTerrain, rc: RoomCells, rng: Rng, platformDepth: number, kinds: readonly CoverKind[] = ['pillar', 'wall-fragment']): void {
  const open = rc.depth - platformDepth;
  const i = Math.max(1, Math.floor(open * 0.35));
  const size = rc.width >= 9 && open >= 7 ? 2 : 1;
  const shapes: Record<CoverKind, CoverShape> = {
    pillar: { kind: 'pillar', di: size, dj: size },
    statue: { kind: 'statue', di: 1, dj: 1 },
    'wall-fragment': { kind: 'wall-fragment', di: 1, dj: Math.min(3, Math.max(2, Math.floor(rc.width / 4))) },
    'rubble-heap': { kind: 'rubble-heap', di: 1, dj: 2 },
  };
  const order = chance(rng, 0.6) ? kinds : [...kinds].reverse();
  for (const kind of order) {
    const shape = shapes[kind];
    const left = Math.max(1, Math.floor(rc.width / 5));
    const right = rc.width - left - shape.dj;
    if (kind === 'rubble-heap') {
      if (roomy(rc, shape.di * shape.dj) && tryShape(floor, rc, shape, i, chance(rng, 0.5) ? left : right)) return;
      continue;
    }
    if (right - left < shape.dj + 1 || !roomy(rc, shape.di * shape.dj * 2)) continue;
    if (tryShape(floor, rc, shape, i, left) && tryShape(floor, rc, shape, i, right)) return;
  }
}

/** The arena's platform: rows deep, at most how wide, and how high. */
function arenaPlatform(rc: Pick<RoomCells, 'depth' | 'width'>): { deep: number; widest: number; elevation: number } {
  return { deep: rc.depth >= 8 ? 2 : 1, widest: Math.ceil(rc.width * 0.6), elevation: rc.depth >= 9 ? 2 : 1 };
}

/** The cells the arena's platform takes at its widest, its steps and the cells at their foot: what a cave keeps floor in its boss room. */
export function arenaSeeds(room: DungeonRoom): CellPoint[] {
  const { cells: _mask, ...rect } = room;
  const rc = new RoomCells(rect, [], [], () => 'lower', []);
  const { deep, widest } = arenaPlatform(rc);
  const w = Math.min(widest, rc.width - 2);
  if (rc.depth < deep + 3 || w < 3) return [];
  const { cells, foot } = farWallBlock(rc, deep, w);
  return [...cells, ...foot];
}

const DEFAULT_SET_PIECES: readonly (readonly [ArenaSetPiece, number])[] = [
  ['statues', 3],
  ['ring', 2],
  ['pillars', 2],
];

/** The set piece drawn by weight, else the first of the others that fits; whether one was placed. */
function placeSetPiece(floor: FloorTerrain, rc: RoomCells, rng: Rng, pieces: readonly (readonly [ArenaSetPiece, number])[], platformDepth: number): boolean {
  if (pieces.length === 0) return false;
  const first = weighted(rng, pieces);
  return [first, ...pieces.map(([p]) => p).filter((p) => p !== first)].some((p) => setPiece(floor, rc, rng, p, platformDepth));
}

/**
 * Turns the boss room into an arena: by its climax type's `arena` where it has one (its set
 * pieces, its kinds of cover, its hazards only), else as before themes.
 */
export function furnishArena(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, tags: ReadonlySet<DungeonTag>, arena?: ArenaSpec): void {
  const floor = work.floors[k];
  if (!floor) return;
  const { deep, widest, elevation } = arenaPlatform(rc);
  // A cave's high ground is a ledge of rock along a wall, never a dais built at its far end.
  if (work.cave) ledgeAlongWall(floor, rc, rng);
  const raised = !work.cave && platformAtFarWall(floor, rc, deep, widest, elevation) !== null;
  const platformDepth = raised ? deep : 0;
  const placed = placeSetPiece(floor, rc, rng, arena ? arena.setPieces : DEFAULT_SET_PIECES, platformDepth);
  wideCover(floor, rc, rng, platformDepth, arena?.mirrored);
  ensureCover(floor, rc, tags, work.cave ? 'rubble-heap' : undefined);
  if (arena) {
    const place = work.cave ? placeCaveHazard : placeHazard;
    if (arena.hazards.length > 0 && chance(rng, placed ? 0.5 : 0.8) && roomy(rc, rc.width)) place(work, k, rc, rng, weighted(rng, arena.hazards.map((h) => [h, 1] as const)), arena.hazards);
    return;
  }
  if (chance(rng, placed ? 0.5 : 0.8) && roomy(rc, rc.width)) placeHazard(work, k, rc, rng, chance(rng, 0.6) ? 'channel' : 'pit');
}
