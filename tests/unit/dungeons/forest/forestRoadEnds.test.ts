import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { CellPoint, DungeonModel, DungeonRoad } from '../../../../src/app/dungeons/model';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { pointInPolygon } from '../../../../src/app/dungeons/render/geometry';
import { roadBand } from '../../../../src/app/dungeons/render/forest/roads';
import { dungeonWalls } from '../../../../src/app/dungeons/scene/toWalls';
import { roomFacts } from '../../../../src/app/dungeons/scene/roomFacts';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import type { DungeonTag } from '../../../../src/app/dungeons/tags';
import { MASS_DEPTH } from '../../../../src/app/dungeons/render/forest/woodsMass';
import { visibleDungeon, type VisibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';

type Vec = CellPoint;

/** Tag sets a GM asks a forest for: sizes, water, life, the layout's shapes. */
const TAG_SETS: readonly DungeonTag[][] = [[], ['small'], ['medium'], ['large'], ['wet'], ['flooded'], ['dry'], ['inhabited'], ['overgrown'], ['large', 'wet'], ['winding'], ['spacious', 'flooded'], ['chaotic'], ['string'], ['deep'], ['crumbling', 'wet']];
/** How many forests: every tag set in turn, one to three floors (caves below widen the map). `VITE_FOREST_ROAD_FORESTS=960` sweeps wider, `VITE_FOREST_ROAD_SEED` from other seeds. */
const COUNT = Number(import.meta.env.VITE_FOREST_ROAD_FORESTS ?? 240);
const FIRST_SEED = Number(import.meta.env.VITE_FOREST_ROAD_SEED ?? 5000);
const CASES: { seed: number; tags: DungeonTag[]; floors: number }[] = Array.from({ length: COUNT }, (_, k) => ({
  seed: FIRST_SEED + k,
  tags: TAG_SETS[k % TAG_SETS.length]!,
  floors: 1 + (Math.floor(k / TAG_SETS.length) % 3),
}));
interface Forest {
  model: DungeonModel;
  shown: VisibleDungeon;
  roads: DungeonRoad[];
  /** The map's picture, in cells. */
  picture: { minX: number; minY: number; maxX: number; maxY: number };
}

const forests: Forest[] = CASES.map(({ seed, tags, floors }) => {
  const model = generateDungeon({ seed, theme: 'forest', tags, floors });
  const layout = mapLayout(model, 1, DEFAULT_VIEW);
  const { x, y } = layout.originCell;
  return { model, shown: visibleDungeon(model, DEFAULT_VIEW, 0), roads: model.floors[0]!.roads ?? [], picture: { minX: x, minY: y, maxX: x + layout.cellsWide, maxY: y + layout.cellsHigh } };
});

function segmentDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function nearestOnLine(line: readonly Vec[], p: Vec): { distance: number; index: number } {
  let best = { distance: Infinity, index: 0 };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    if (distance < best.distance) best = { distance, index: i };
  }
  return best;
}

/** A line's heading at point `i`, over half a cell either side (points lie a quarter cell apart). */
function heading(line: readonly Vec[], i: number, reach = 2): Vec {
  const a = line[Math.max(0, i - reach)]!;
  const b = line[Math.min(line.length - 1, i + reach)]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/** How far outside the picture `p` lies, in cells (0 inside). */
function outside(picture: Forest['picture'], p: Vec): number {
  return Math.hypot(Math.max(0, picture.minX - p.x, p.x - picture.maxX), Math.max(0, picture.minY - p.y, p.y - picture.maxY));
}

function inRings(rings: readonly (readonly Vec[])[], p: Vec): boolean {
  return rings.filter((ring) => pointInPolygon(ring, p.x, p.y)).length % 2 === 1;
}

type EndKind = 'off the map' | 'merged';

/** What a road's end does, or null where it ends in none of the ways a road may end. */
function endOf({ roads, picture }: Forest, road: DungeonRoad, atStart: boolean): EndKind | null {
  const end = atStart ? road.points[0]! : road.points[road.points.length - 1]!;
  // Its worn ground (round at its end) lies wholly beyond the picture.
  if (outside(picture, end) > road.width / 2 + 1) return 'off the map';
  for (const other of roads) {
    if (other === road) continue;
    const on = nearestOnLine(other.points, end);
    if (on.distance > 0.05) continue;
    // It runs into the other road along it, at a slant at most, as a fork joins: never square, never stopping short.
    const own = heading(road.points, atStart ? 0 : road.points.length - 1);
    const theirs = heading(other.points, on.index);
    return Math.abs(own.x * theirs.x + own.y * theirs.y) > Math.cos((35 * Math.PI) / 180) ? 'merged' : null;
  }
  // Nowhere else: a forest's roads have no dead ends (nothing at an entrance or a river's bank to end at).
  return null;
}

describe('a Forest’s roads', { timeout: 60000 }, () => {
  it('run off the map or merge into another road along it at both ends, never stopping at an entrance or a river’s bank', () => {
    const kinds = new Map<string, number>();
    const wrong: string[] = [];
    forests.forEach((forest, k) => {
      for (const road of forest.roads) {
        for (const atStart of [true, false]) {
          const kind = endOf(forest, road, atStart);
          if (!kind) wrong.push(`${JSON.stringify(CASES[k])} road ${forest.roads.indexOf(road)} ${atStart ? 'start' : 'end'}`);
          kinds.set(kind ?? 'wrong', (kinds.get(kind ?? 'wrong') ?? 0) + 1);
        }
      }
    });
    expect(wrong).toEqual([]);
    // Both kinds of end a road network is made of come up, so the checks above do not pass for want of cases.
    expect(kinds.get('off the map')).toBeGreaterThan(COUNT * 2);
    expect(kinds.get('merged')).toBeGreaterThan(COUNT / 4);
  });

  it('lay their ground whole along their line and either side of it, without a cut or a hole where they bend', () => {
    for (const { roads, picture } of forests) {
      for (const road of roads) {
        const half = road.width / 2;
        const worn = roadBand(road, half);
        const verge = roadBand(road, half + MASS_DEPTH);
        road.points.forEach((p, i) => {
          if (i % 2 || outside(picture, p) > 0) return;
          const h = heading(road.points, i, 1);
          for (const side of [-1, 1]) {
            const at = (reach: number): Vec => ({ x: p.x - h.y * side * reach, y: p.y + h.x * side * reach });
            expect(inRings(worn, at(half * 0.95))).toBe(true);
            expect(inRings(verge, at((half + MASS_DEPTH) * 0.95))).toBe(true);
          }
        });
      }
    }
  });

  it('lead through every entrance a forest keeps, and it keeps at least one: the others are walled and named nowhere', () => {
    const wrong: string[] = [];
    forests.forEach(({ model, shown, roads }, k) => {
      const at = JSON.stringify(CASES[k]);
      const mouths = shown.ways.map((way) => way.mouth.at);
      if (!mouths.length) wrong.push(`${at}: no way in`);
      for (const m of mouths) if (!roads.some((road) => road.points.some((p) => Math.hypot(p.x - m.x, p.y - m.y) < 2.5))) wrong.push(`${at}: an entrance no road leads through`);
      // The scene's walls are closed rings but at the entrances it keeps: every loose end of a wall lies at one.
      const px = 10;
      const layout = mapLayout(model, px, DEFAULT_VIEW);
      const cell = (p: Vec): Vec => ({ x: p.x / px + layout.originCell.x, y: p.y / px + layout.originCell.y });
      const degree = new Map<string, { p: Vec; n: number }>();
      const walls = Object.values(dungeonWalls(model, dungeonStyle('parchment'), DEFAULT_VIEW, layout, 0).walls);
      for (const wall of walls) {
        for (const end of [wall.p1, wall.p2]) {
          const key = `${Math.round(end.x * 100)},${Math.round(end.y * 100)}`;
          degree.set(key, { p: cell(end), n: (degree.get(key)?.n ?? 0) + 1 });
        }
      }
      const loose = [...degree.values()].filter((end) => end.n === 1).map((end) => end.p);
      for (const end of loose) if (!mouths.some((m) => Math.hypot(m.x - end.x, m.y - end.y) < 1.5)) wrong.push(`${at}: a wall open at ${end.x.toFixed(1)},${end.y.toFixed(1)}, at no entrance`);
      // And an entrance it keeps is open: walls end beside it, or none stands near it (a road's ground carries the floor on through it).
      const open = (m: Vec): boolean => loose.some((end) => Math.hypot(m.x - end.x, m.y - end.y) < 1.5) || !walls.some((wall) => segmentDistance(m, cell(wall.p1), cell(wall.p2)) < 0.4);
      for (const m of mouths) if (!open(m)) wrong.push(`${at}: an entrance walled`);
      // The note names a way out for each entrance kept and no other.
      const named = shown.rooms.map((room) => roomFacts(shown, room, DEFAULT_VIEW)).join(' ').split('opens to the outside').length - 1;
      if (named !== mouths.length) wrong.push(`${at}: the note names ${named} ways out of ${mouths.length}`);
    });
    expect(wrong).toEqual([]);
  });
});
