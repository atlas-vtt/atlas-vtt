import { describe, expect, it } from 'vitest';
import { bottomUp, stackOf, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import { approachCells, spotRect, type StairEnd } from '../../../src/app/dungeons/floors/stairSpots';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { cellsOf, floorCellsOf } from '../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonModel, DungeonRequest, DungeonStair } from '../../../src/app/dungeons/model';
import { dungeonScene } from '../../../src/app/dungeons/scene/toScene';
import { DEFAULT_PX_PER_CELL, mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DEFAULT_STYLE_ID, dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';
import { flightSides, levelLinkList, linkAt } from '../../../src/app/levels/levelLinks';
import { onLevel } from '../../../src/app/levels/sceneLevels';
import { withStairSides } from '../../../src/app/online/gm/stairSides';
import { movementWalls, moveWallsOf, reaches, type MoveWalls, type Point } from '../../../src/app/online/movement/index.ts';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { wallList } from '../../../src/app/vision/wallList';

/**
 * Every level link of generated multi-floor dungeons, walked as a player's token is moved on the
 * online player page and checked by the GM (`landing`): its centre stops at the scene's walls of its
 * level as `movementWalls` makes them (sealing bridges and tall objects' outlines included) and at
 * the closed sides of walked stairs (`stairSides`). Doors count as opened, as players open them;
 * secret doors stay shut (a cave's crawl is rock as drawn): a way is never placed in a secret wing
 * (`holdsStairs`), so one reached only through a secret door is a way players cannot find, and fails.
 * On both floors of every link: each cell of the row it is entered from is walkable, reaches the
 * level's main walkable area, steps onto the stairs across their ground end (never blocked by their
 * own sides) and walks on along them to the row where the token changes level.
 */

const PX = DEFAULT_PX_PER_CELL;
/** Sample points a cell, a side: the lattice a token's centre is walked over between cells, so it may pass round a tree trunk. */
const LATTICE = 3;
const TAG_SETS: readonly string[][] = [['medium'], ['small'], ['large'], ['winding'], ['wet', 'chaotic'], ['flooded', 'deep'], ['large', 'inhabited'], ['dry', 'compact']];

interface Scene {
  model: DungeonModel;
  levels: SceneLevel[];
  levelIds: string[];
  links: LevelLink[];
  walls: Record<string, WallSegment>;
  image: { width: number; height: number };
  origin: CellPoint;
  size: { w: number; h: number };
}

function sceneOf(model: DungeonModel): Scene {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  const placement = { originCell: layout.originCell, pxPerCell: PX };
  const image = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, dungeonStyle(DEFAULT_STYLE_ID), DEFAULT_VIEW, placement, image, { unitType: 'feet', ruleDistance: 5 });
  if (!parts?.levelIds) throw new Error(`seed ${model.seed}: no scene of levels`);
  const levelIds = parts.levelIds;
  const levels = bottomUp(stackOf(model)).map((index): SceneLevel => ({ id: levelIds[index]!, elevation: { bottom: 0, top: 10 }, background: null }));
  return { model, levels, levelIds, links: levelLinkList(parts.scene.levelLinks), walls: parts.scene.walls ?? {}, image, origin: layout.originCell, size: { w: layout.cellsWide, h: layout.cellsHigh } };
}

/** The walls a token on `level` stops at, every door open but the secret ones, with the closed sides of that level's stairs. */
function levelWalls(scene: Scene, level: string): MoveWalls {
  const own = Object.fromEntries(Object.entries(scene.walls).filter(([, wall]) => onLevel(wall, level, scene.levels)).map(([id, wall]) => [id, wall.type === 'door' ? { ...wall, closed: false } : wall]));
  const walls = movementWalls(wallList(own), scene.image);
  const sides = moveWallsOf(flightSides(scene.links, level, scene.levels).map(([a, b]) => [a.x, a.y, b.x, b.y] as const), walls.gap);
  return withStairSides(walls, sides)!;
}

/** The walls near each cell (within a cell of it), so a step reads only those: the same sweep, far fewer lines. */
function wallsByCell(walls: MoveWalls, scene: Scene): (x: number, y: number) => MoveWalls {
  const { w, h } = scene.size;
  const buckets: number[][] = Array.from({ length: w * h }, () => []);
  const { lines } = walls;
  for (let at = 0; at < lines.length; at += 4) {
    const [ax, ay, bx, by] = [lines[at]! / PX, lines[at + 1]! / PX, lines[at + 2]! / PX, lines[at + 3]! / PX];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx)) - 1), x1 = Math.min(w - 1, Math.floor(Math.max(ax, bx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by)) - 1), y1 = Math.min(h - 1, Math.floor(Math.max(ay, by)) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buckets[y * w + x]!.push(at);
  }
  const near = buckets.map((bucket) => moveWallsOf(bucket.map((at) => [lines[at]!, lines[at + 1]!, lines[at + 2]!, lines[at + 3]!] as const), walls.gap));
  return (x, y) => near[y * w + x]!;
}

/** A level's lattice of sample points, by component: which points a token's centre walks between. */
class Walkable {
  private readonly n: number;
  private readonly comp: Int32Array;
  private readonly main: number;

  constructor(private readonly scene: Scene, private readonly walls: MoveWalls, floor: number) {
    const { w, h } = scene.size;
    this.n = w * LATTICE;
    const rows = h * LATTICE;
    const near = wallsByCell(walls, scene);
    this.comp = new Int32Array(this.n * rows).fill(-1);
    let count = 0;
    for (let start = 0; start < this.comp.length; start++) {
      if (this.comp[start] !== -1) continue;
      this.comp[start] = count;
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head]!;
        const [i, j] = [at % this.n, Math.floor(at / this.n)];
        const here = this.point(i, j);
        const local = near(Math.floor(i / LATTICE), Math.floor(j / LATTICE));
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const [ni, nj] = [i + di, j + dj];
          if (ni < 0 || nj < 0 || ni >= this.n || nj >= rows || this.comp[nj * this.n + ni] !== -1) continue;
          if (!reaches(local, here, this.point(ni, nj))) continue;
          this.comp[nj * this.n + ni] = count;
          queue.push(nj * this.n + ni);
        }
      }
      count += 1;
    }
    // The main area holds most of the floor's open rooms: a secret wing, behind its secret door, is no part of it.
    const votes = new Map<number, number>();
    for (const room of scene.model.floors[floor]!.rooms.filter((r) => r.wing === 'regular')) for (const c of floorCellsOf(room)) {
      const id = this.at(c);
      votes.set(id, (votes.get(id) ?? 0) + 1);
    }
    this.main = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  private point(i: number, j: number): Point {
    return { x: ((i + 0.5) / LATTICE) * PX, y: ((j + 0.5) / LATTICE) * PX };
  }

  /** The component of a cell's centre. */
  private at(c: CellPoint): number {
    const mid = Math.floor(LATTICE / 2);
    const i = (c.x - this.scene.origin.x) * LATTICE + mid;
    const j = (c.y - this.scene.origin.y) * LATTICE + mid;
    return this.comp[j * this.n + i] ?? -1;
  }

  inMain(c: CellPoint): boolean {
    return this.at(c) === this.main;
  }

  centre(c: CellPoint): Point {
    return { x: (c.x - this.scene.origin.x + 0.5) * PX, y: (c.y - this.scene.origin.y + 0.5) * PX };
  }

  steps(from: CellPoint, to: CellPoint): boolean {
    return reaches(this.walls, this.centre(from), this.centre(to));
  }
}

/** The stairs' cells along the way a token walks them from the row it is entered from at `end`: from the ground end to the far row. */
function treads(stair: DungeonStair, end: StairEnd): CellPoint[][] {
  const r = spotRect(stair);
  const toward = end === 'upper' ? stair.down : { x: -stair.down.x, y: -stair.down.y };
  const rows = toward.x !== 0 ? r.x1 - r.x0 + 1 : r.y1 - r.y0 + 1;
  const first = toward.x > 0 ? r.x0 : toward.x < 0 ? r.x1 : toward.y > 0 ? r.y0 : r.y1;
  return Array.from({ length: rows }, (_, k) => {
    const at = first + k * (toward.x + toward.y);
    return cellsOf(toward.x !== 0 ? { x0: at, y0: r.y0, x1: at, y1: r.y1 } : { x0: r.x0, y0: at, x1: r.x1, y1: at });
  });
}

/** What is wrong with one end of a level link on its floor, if anything. */
function endProblems(scene: Scene, walk: Walkable, level: string, stair: DungeonStair, end: StairEnd): string[] {
  const problems: string[] = [];
  const front = approachCells(stair, end);
  const rows = treads(stair, end);
  const link = scene.links.find((entry) => entry.id === `levellink_dungeon_${stair.link}`);
  if (!link) return ['no level link'];
  for (const c of front) {
    if (!walk.inMain(c)) problems.push(`front ${c.x},${c.y} off the main walkable area`);
    // The tread across the ground end from this cell of the row.
    const tread = rows[0]!.find((t) => Math.abs(t.x - c.x) + Math.abs(t.y - c.y) === 1);
    if (!tread || !walk.steps(c, tread) || !walk.steps(tread, c)) problems.push(`front ${c.x},${c.y} does not step onto the stairs`);
  }
  for (let k = 1; k < rows.length; k++) rows[k]!.forEach((c, i) => {
    if (!walk.steps(rows[k - 1]![i]!, c)) problems.push(`tread ${c.x},${c.y} not reached along the stairs`);
  });
  const far = rows.at(-1)!;
  if (!far.every((c) => linkAt([link], walk.centre(c), level, scene.levels) === link)) problems.push('the far row changes no level');
  return problems;
}

/** Each link has its two ends on two floors, and the links join every floor to every other (a house's back stair may pass a floor). */
function linkCountProblems(model: DungeonModel): string[] {
  const ends = new Map<number, number[]>();
  model.floors.forEach((floor, index) => {
    for (const stair of floor.stairs) ends.set(stair.link, [...(ends.get(stair.link) ?? []), index]);
  });
  const problems = [...ends].filter(([, floors]) => floors.length !== 2 || floors[0] === floors[1]).map(([link, floors]) => `seed ${model.seed}: link ${link} ends on floors ${floors.join(', ')}`);
  const reached = new Set([0]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [a, b] of [...ends.values()]) {
      if (a === undefined || b === undefined || reached.has(a) === reached.has(b)) continue;
      reached.add(a).add(b);
      grew = true;
    }
  }
  if (reached.size !== model.floors.length) problems.push(`seed ${model.seed}: the links join ${reached.size} of ${model.floors.length} floors`);
  return problems;
}

/** The problems of every link of a dungeon generated for `request`, a dungeon short of its floors among them. */
function linkProblems(request: DungeonRequest): string[] {
  const model = generateDungeon(request);
  const short = model.floors.length === request.floors ? [] : [`seed ${model.seed}: ${model.floors.length} of ${request.floors} floors`];
  const scene = sceneOf(model);
  const stack = stackOf(model);
  const access = model.floors.flatMap((floor, index) => {
    if (floor.stairs.length === 0) return [];
    const level = scene.levelIds[index]!;
    const walk = new Walkable(scene, levelWalls(scene, level), index);
    return floor.stairs.flatMap((stair) => endProblems(scene, walk, level, stair, stairEnd(stack, index, stair.to)).map((problem) => `seed ${model.seed}, floor ${index}, link ${stair.link}: ${problem}`));
  });
  return [...short, ...linkCountProblems(model), ...access];
}

/** Seeds per floor count; `VITE_LEVEL_LINK_SEEDS` runs more. */
const SEEDS = Number(import.meta.env.VITE_LEVEL_LINK_SEEDS ?? 30);
/** Water levels sampled besides the tags' own (unset). */
const WATER_LEVELS: readonly (number | undefined)[] = [undefined, 0, 0.3, 0.6, 1];

/** The `k`th request of a sweep: tags, boss room and water level each turning on its own cycle. */
function sweepRequest(theme: ThemeId, floors: number, k: number): DungeonRequest {
  const water = WATER_LEVELS[k % WATER_LEVELS.length];
  return {
    seed: 104_729 * (k + 1) + floors,
    tags: [...TAG_SETS[k % TAG_SETS.length]!],
    floors,
    theme,
    ...(k % 3 === 2 && { bossRoom: false }),
    ...(water !== undefined && { waterLevel: water }),
  };
}

/** Dungeons whose links were once unreached (found in review), kept as fixed cases. */
const REGRESSIONS: readonly DungeonRequest[] = [
  { seed: 3_814_193, theme: 'forest', tags: ['wet', 'chaotic'], floors: 4 },
  { seed: 14_968_014, theme: 'cavern', tags: ['medium'], floors: 2, bossRoom: false, waterLevel: 1 },
];

export function describeLevelLinkAccess(theme: ThemeId): void {
  describe(`every level link of a ${theme} is reached across its front`, () => {
    for (const request of REGRESSIONS.filter((entry) => entry.theme === theme)) {
      it(`in the dungeon of seed ${request.seed} once found unreached`, () => {
        expect(linkProblems(request)).toEqual([]);
      });
    }
    for (const floors of [2, 3, 4]) {
      it(`on both floors it joins, over ${SEEDS} dungeons of ${floors} floors`, () => {
        const problems: string[] = [];
        for (let k = 0; k < SEEDS; k++) problems.push(...linkProblems(sweepRequest(theme, floors, k)));
        expect(problems).toEqual([]);
      }, 600_000);
    }
  });
}
