import type { WallSegment } from '../../types/wallTypes';
import { doorCells, doorMiddle } from '../geometry';
import type { DoorKind, DungeonDoor, DungeonModel } from '../model';
import { visibleFloor, type VisibleFloor } from '../render/visibleDungeon';
import type { DungeonStyle, DungeonView } from '../style';
import { wallInkWidth } from '../render/wallInk';
import type { Vec } from '../render/geometry';
import { OUTER_WALL, mouthDepth } from '../render/houseShapes';
import { shownWindows } from '../render/art/windows';
import { fireSites, firesLit } from '../render/fireSites';
import { acrossMouth, fireboxCut, recessWalls, type FireboxCut } from './fireboxWalls';
import { onWindow, secretDoorways, windowCuts } from './houseWalls';
import { STEPS, doorEnds, doorLine, splitRings, wallRings, type RingHit } from './wallOutline';

/** Where a dungeon map lies in the world: its pixel (0, 0) is the corner of `originCell`. */
export interface DungeonPlacement {
  originCell: { x: number; y: number };
  pxPerCell: number;
}

/** What stands in a door cell: a door of a kind, or nothing (an opening or steps). */
interface DoorWall {
  type: 'door' | 'secret-door';
  /** Where the door lies along the passage, from the cell's middle towards the child room, in cells. */
  v: (door: DungeonDoor, half: number) => number;
}

/**
 * Door kinds as walls: a door closed in its cell's middle, where its leaf is drawn; a secret door
 * closing the passage at its parent's wall, where the map shows that wall unbroken. Openings and
 * steps leave the passage open.
 */
const DOOR_WALLS: Partial<Record<DoorKind, DoorWall>> = {
  door: { type: 'door', v: () => 0 },
  secret: { type: 'secret-door', v: (door, half) => (door.from === null ? 0.5 - half : half - 0.5) },
};

/** Doors closed on their own line: a cave's crawl is rock all through and a house's doorway is its wall, so even a secret door closes there. */
const ON_LINE_DOOR_WALLS: Partial<Record<DoorKind, DoorWall>> = { ...DOOR_WALLS, secret: { type: 'secret-door', v: () => 0 } };

/** How far past a mouth's side an edge across it may reach and still be the mouth, in cells. */
const MOUTH_OVERHANG = 0.5;

/**
 * Whether an edge of a wall ring lies on the outer mouth of an entrance: the edge of its cell's
 * wall ring that faces the outside. An entrance leads out, so no wall closes it there (the map
 * draws none either: the ground outside the way in is cleared). An edge along the mouth's line whose
 * middle lies within the mouth is its too, though a corner of it lies further out: a cave's
 * outline may cross a wide mouth in one straight edge that overhangs it a little (up to
 * `MOUTH_OVERHANG`), which was left standing as a wall across the way in.
 */
function entranceMouth(door: DungeonDoor, half: number, cave: boolean): (a: Vec, b: Vec) => boolean {
  const cells = doorCells(door);
  // A cave's outline meets its straight mouth at a slant, so the grown corner lies up to a further half wall along it.
  const reach = cells.length / 2 + (cave ? 2 : 1) * half + 1 / STEPS;
  const m = doorMiddle(door);
  const mouth = { x: m.x - door.dir.x * (mouthDepth(door) + half), y: m.y - door.dir.y * (mouthDepth(door) + half) };
  const along = (p: Vec): number => Math.abs((p.x - mouth.x) * door.dir.y - (p.y - mouth.y) * door.dir.x);
  const onLine = (p: Vec): boolean => Math.abs((p.x - mouth.x) * door.dir.x + (p.y - mouth.y) * door.dir.y) < 1 / STEPS;
  return (a, b) => {
    if (!onLine(a) || !onLine(b)) return false;
    if (along(a) <= reach && along(b) <= reach) return true;
    const middle = along({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return middle <= cells.length / 2 && Math.max(along(a), along(b)) <= reach + MOUTH_OVERHANG;
  };
}

/**
 * The fireboxes of a lived-in house floor's fireplaces as cuts into its wall rings: their fires
 * burn, so each recess is open to its room (`fireboxWalls.ts`). None on other floors.
 */
function litFireboxes(visible: VisibleFloor, rings: readonly Vec[][], half: number): FireboxCut[] {
  if (!firesLit(visible.model) || visible.floor.walls !== 'edges') return [];
  const props = visible.floor.props.filter(prop => visible.roomShapes.has(prop.room));
  return fireSites(props, true).flatMap(site => {
    const cut = site.firebox && fireboxCut(rings, site.firebox, 2 * half + 1 / STEPS);
    return cut ? [cut] : [];
  });
}

export interface DungeonWalls {
  walls: Record<string, WallSegment>;
  /** Doors of each kind that became a door wall. */
  doors: Partial<Record<DoorKind, number>>;
  /** Door kinds whose cell had no walls on both sides to close: left open, for the log. */
  unplaced: number;
}

/** Which floor of a scene walls stand on: their ids begin with `id`, and they carry `levels` where the scene has several. */
export interface WallsOf {
  id: string;
  levels?: string[];
}

/**
 * The walls and doors of one floor of a dungeon in world pixels, along the centre line of its drawn walls:
 * one chain per wall outline, every wall drawn once (rooms side by side have walls of their own,
 * a cell of rock apart), and every door ending exactly on a corner of the wall beside it, so
 * light and sight find no gap. Entrances stay open to the outside, and so do the fireboxes of a
 * lived-in house's fireplaces, walled round their recess (`wall_<id>_firebox_<n>`). Rooms the view hides (a secret
 * wing) have no walls. Pure.
 */
export function dungeonWalls(
  model: DungeonModel,
  style: DungeonStyle,
  view: Pick<DungeonView, 'secrets'>,
  placement: DungeonPlacement,
  floor = 0,
  of: WallsOf = { id: 'dungeon' },
): DungeonWalls {
  const visible = visibleFloor(model, view, floor);
  const { doors, floors, floor: shown } = visible;
  // A door on an edge closes its doorway on the edge itself, whatever its kind.
  const kinds = shown.cave || shown.walls === 'edges' ? ON_LINE_DOOR_WALLS : DOOR_WALLS;
  const half = wallInkWidth(style) / 2;
  const rings = wallRings([...floors, ...secretDoorways(visible)], doors.filter(door => door.kind === 'secret' && !door.edge), half);

  const placed: { door: DungeonDoor; wall: DoorWall; ends: [RingHit, RingHit] }[] = [];
  let unplaced = 0;
  for (const door of doors) {
    const wall = kinds[door.kind];
    if (!wall) continue;
    // The side walls lie half a cell and half a wall from the door's middle
    const reach = (door.edge ? doorCells(door).length / 2 : 0.5) + half + 1 / STEPS;
    const ends = doorEnds(rings, doorLine(door, wall.v(door, half)), reach) ?? doorEnds(rings, doorLine(door, 0), reach);
    if (ends) placed.push({ door, wall, ends });
    else unplaced++;
  }

  // A window cuts the outer wall: between its two cuts stands a wall only a token is stopped by.
  const cuts = shownWindows(visible).flatMap(window => {
    const cut = windowCuts(rings, window, OUTER_WALL / 2 + half);
    return cut ? [cut] : [];
  });
  const glass = onWindow(cuts);
  const fireboxes = litFireboxes(visible, rings, half);
  const mouth = acrossMouth(fireboxes);
  const outlines = splitRings(rings, [...placed.flatMap(p => p.ends), ...cuts.flat(), ...fireboxes.flatMap(f => f.cuts)]);
  const { originCell, pxPerCell } = placement;
  const world = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - originCell.x) * pxPerCell,
    y: (p.y - originCell.y) * pxPerCell,
  });

  const walls: Record<string, WallSegment> = {};
  let count = 0;
  let recesses = 0;
  const add = (from: { x: number; y: number }, to: { x: number; y: number }, rest: Omit<WallSegment, 'id' | 'kind' | 'p1' | 'p2'>, recess = false): void => {
    if (from.x === to.x && from.y === to.y) return;
    const id = recess ? `wall_${of.id}_firebox_${++recesses}` : `wall_${of.id}_${++count}`;
    walls[id] = { id, kind: 'wall', p1: world(from), p2: world(to), ...rest, ...(of.levels && { levels: of.levels }) };
  };

  const mouths = doors.filter(door => door.from === null).map(door => entranceMouth(door, half, shown.cave !== undefined));
  const onMouth = (a: Vec, b: Vec): boolean => mouths.some(mouth => mouth(a, b));
  outlines.forEach((ring, index) => {
    const chainId = `chain_${of.id}_${index + 1}`;
    ring.forEach((corner, i) => {
      const next = ring[(i + 1) % ring.length]!;
      if (onMouth(corner, next) || mouth(corner, next)) return;
      add(corner, next, { type: 'solid', chainId, ...(glass(corner, next) && { blocks: 'movement' as const }) });
    });
  });
  for (const firebox of fireboxes) {
    const chainId = `chain_${of.id}_${firebox.cuts[0].ring + 1}`;
    for (const [from, to] of recessWalls(firebox)) add(from, to, { type: 'solid', chainId }, true);
  }
  const counts: Partial<Record<DoorKind, number>> = {};
  for (const { door, wall, ends } of placed) {
    add(ends[0].point, ends[1].point, { type: wall.type, closed: true });
    counts[door.kind] = (counts[door.kind] ?? 0) + 1;
  }
  return { walls, doors: counts, unplaced };
}
