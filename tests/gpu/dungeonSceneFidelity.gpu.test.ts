import { describe, expect, it } from 'vitest';
import type { ThemeChoice } from '../../src/app/dungeons/themes/themeTypes';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { cellKey, doorMiddle, floorCellsOf } from '../../src/app/dungeons/geometry';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { propTall } from '../../src/app/dungeons/render/propShapes';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { dungeonScene } from '../../src/app/dungeons/scene/toScene';
import { groundsWalls } from '../../src/app/dungeons/scene/toGroundsWalls';
import { dungeonWalls } from '../../src/app/dungeons/scene/toWalls';
import { wallInkWidth } from '../../src/app/dungeons/render/wallInk';
import { NARROW_SHARE, narrowMargin } from '../../src/app/dungeons/render/cave/outlineGuard';
import { DEFAULT_VIEW, type DungeonView } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { alphaAt, changedMask, gridAgreement, inkEdgesFromWalls, inkMask, outlinesOffObjects, wallsInTerrain, wallsOnInk, type Picture } from './dungeonFidelityChecks';
import type { WallSegment } from '../../src/app/types/wallTypes';

/** The collection's units: five feet a square. */
const FEET = { unitType: 'feet', ruleDistance: 5 } as const;

/**
 * A dungeon's scene against the map images it was written for, at the 200 px per cell scenes are
 * drawn at, floor by floor (each its level's walls on its own map): every wall lies on drawn wall
 * ink, every drawn wall face has a wall, doors stand on the drawn doors, the scene's grid is the
 * grid drawn on the map (half cells with small tiles), and every outline of a tall object lies on
 * the object as drawn. The outlines are no drawn walls: the wall checks leave them out.
 */

const PX_PER_CELL = 200;

/**
 * The most pixels a floor is drawn with. Chromium's canvas limit is 268 MP, and a large cave floor
 * passes it at 200 px a cell (seed 707: 93 × 120 cells, 446 MP), where the canvas comes back blank.
 */
const MAX_CANVAS_PIXELS = 240_000_000;
/** The fewest pixels a cell is drawn with where 200 do not fit. */
const LEAST_PX_PER_CELL = 60;

/** 200 px a cell where the map fits the canvas, else the largest whole number of pixels a cell that does. */
function pxPerCellFor(model: DungeonModel, view: DungeonView): number {
  const { cellsWide, cellsHigh } = mapLayout(model, 1, view);
  return Math.min(PX_PER_CELL, Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (cellsWide * cellsHigh))));
}

/** Samples a cell is read with, each way, for whether the drawn floor covers it. */
const CELL_SAMPLES = 7;

/**
 * The floor with the cells the grid check skips taken out of its rooms, as terrain is: they are
 * drawn over the floor and the grid is drawn over them unchanged, but they read as grid colour
 * between its lines. The water's cells, whose pale edge does; and on a cave floor, the cells the
 * cave's wall cuts into (the outline may take up to a third of a cell, `FLOOR_SHARE` in
 * `outlineGuard.ts`): some of a cell's samples lie off the floor as drawn (`field`), and its rock
 * hatching and the wall's shadow do.
 */
function gridFloor(floor: DungeonModel['floors'][number], field: { distance(x: number, y: number): number }): DungeonModel['floors'][number] {
  const skipped = new Set(floor.waterCells.map(c => cellKey(c.x, c.y)));
  const cutInto = (c: { x: number; y: number }): boolean => {
    for (let i = 0; i < CELL_SAMPLES; i++) for (let j = 0; j < CELL_SAMPLES; j++) if (field.distance(c.x + (i + 0.5) / CELL_SAMPLES, c.y + (j + 0.5) / CELL_SAMPLES) > 0) return true;
    return false;
  };
  if (floor.cave) for (const c of floor.rooms.flatMap(room => floorCellsOf(room))) if (cutInto(c)) skipped.add(cellKey(c.x, c.y));
  return { ...floor, rooms: floor.rooms.map(room => ({ ...room, cells: floorCellsOf(room).filter(c => !skipped.has(cellKey(c.x, c.y))) })) };
}

const CASES: readonly { seed: number; theme?: ThemeChoice; tags: string[]; floors: number; look: DungeonStyleId; view: Partial<DungeonView>; fiveRoom?: boolean }[] = [
  { seed: 101, tags: ['medium'], floors: 1, look: 'parchment', view: {} },
  { seed: 202, tags: ['small', 'round'], floors: 2, look: 'night', view: { smallTiles: true } },
  { seed: 303, theme: 'fortress', tags: ['small', 'secret', 'colonnades'], floors: 2, look: 'masonry', view: { monochrome: true } },
  { seed: 404, tags: ['small', 'winding'], floors: 3, look: 'stipple', view: { smallTiles: true, grid: 'solid' } },
  { seed: 505, tags: ['medium', 'colonnades'], floors: 1, look: 'blueprint', view: {} },
  // Terrain: a gallery over the arena and a bridged chasm onto the floor below, and a five-room dungeon.
  { seed: 282, tags: ['small'], floors: 2, look: 'parchment', view: {} },
  { seed: 375, theme: 'cavern', tags: ['small', 'crumbling', 'dry'], floors: 2, look: 'sepia', view: { smallTiles: true } },
  { seed: 42, tags: [], floors: 1, look: 'masonry', view: {}, fiveRoom: true },
  // Ivy and moss lie over the walls' foot: the walls must still be found on the ink.
  { seed: 16, theme: 'mansion', tags: ['overgrown'], floors: 1, look: 'parchment', view: {} },
  // A lived-in house: each fireplace's firebox is open to its room and walled round its recess.
  { seed: 16, theme: 'mansion', tags: ['inhabited'], floors: 1, look: 'parchment', view: {} },
  { seed: 404, theme: 'fortress', tags: ['overgrown', 'colonnades', 'wet'], floors: 2, look: 'print', view: {} },
  // Caverns: walls following natural rock, narrows, crawls, pitches and scree; every cave art family runs these again.
  { seed: 606, theme: 'cavern', tags: ['medium'], floors: 1, look: 'parchment', view: {} },
  { seed: 707, theme: 'cavern', tags: ['large', 'lava'], floors: 3, look: 'volcanic', view: {} },
  { seed: 808, theme: 'cavern', tags: ['small', 'secret', 'wet'], floors: 2, look: 'print', view: { monochrome: true } },
  { seed: 909, theme: 'cavern', tags: [], floors: 1, look: 'masonry', view: {}, fiveRoom: true },
  // Great chambers that end at an abyss.
  { seed: 259, theme: 'cavern', tags: ['medium'], floors: 1, look: 'parchment', view: {} },
  { seed: 90, theme: 'cavern', tags: ['medium'], floors: 1, look: 'print', view: {} },
  { seed: 149, theme: 'cavern', tags: [], floors: 1, look: 'parchment', view: {} },
];

const TALL_TERRAIN = new Set(['pillar', 'obelisk', 'statue', 'wall-fragment']);

/** The dungeon without its tall objects: the columns that stand, every prop with a lighting outline (`propTall`), and terrain that is total cover. */
function withoutTallObjects(model: DungeonModel): DungeonModel {
  return {
    ...model,
    floors: model.floors.map(floor => ({
      ...floor,
      columns: floor.columns.filter(column => column.shattered),
      props: floor.props.filter(prop => !propTall(prop.kind)),
      terrain: floor.terrain.filter(piece => !TALL_TERRAIN.has(piece.kind)),
    })),
  };
}

/** The dungeon without what grows on it: climbers lie over the walls' ink on purpose. */
function withoutGrowth(model: DungeonModel): DungeonModel {
  return { ...model, floors: model.floors.map(floor => ({ ...floor, growth: [] })) };
}

/** A floor's outlines of tall objects, each a ring of corners. */
function outlinesOf(walls: readonly WallSegment[]): { x: number; y: number }[][] {
  const rings = new Map<string, { x: number; y: number }[]>();
  for (const wall of walls) rings.set(wall.chainId!, [...(rings.get(wall.chainId!) ?? []), wall.p1]);
  return [...rings.values()];
}

function draw(model: DungeonModel, look: DungeonStyleId, view: DungeonView, floor: number, px: number): Picture {
  const layout = mapLayout(model, px, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const ctx = canvas.getContext('2d')!;
  renderMap(ctx, model, dungeonStyle(look), view, { pxPerCell: px, floor });
  return { data: ctx.getImageData(0, 0, layout.widthPx, layout.heightPx).data, width: layout.widthPx, height: layout.heightPx };
}

/** Walls that pass through the inside of a narrows or a lane cell, more than `inset` px from its edges, as `x,y` of the first point found. */
/**
 * The walls inside a narrows or on the main path, `inset` from each cell's edges. A narrow way's
 * cell (its door's, its passage's) is drawn narrower than itself, the rock closing in, so only a
 * middle square half as wide as its share is held open there (`narrowMargin`), where a token stands.
 */
function wallsInWay(floor: DungeonModel['floors'][number], walls: readonly WallSegment[], placement: { originCell: { x: number; y: number }; pxPerCell: number }, inset: number, halfInk: number): string[] {
  const narrowShare = new Map<string, number>();
  for (const room of floor.rooms) if (room.narrow) for (const c of floorCellsOf(room)) narrowShare.set(cellKey(c.x, c.y), NARROW_SHARE[room.narrow]);
  for (const d of floor.doors) if (d.kind === 'opening' && d.from !== null && d.to !== null && (d.way === 'crawl' || d.way === 'squeeze' || d.way === 'letterbox')) narrowShare.set(cellKey(d.x, d.y), Math.min(NARROW_SHARE[d.way], narrowShare.get(cellKey(d.x, d.y)) ?? 1));
  const narrowCells = floor.rooms.filter(room => room.narrow).flatMap(floorCellsOf);
  const cells = [...(floor.cave?.lane ?? []), ...floor.doors.filter(d => d.kind !== 'secret' && d.from !== null).flatMap(d => [{ x: d.x, y: d.y }, ...(d.wide ? [{ x: d.x + d.wide.x, y: d.y + d.wide.y }] : [])]), ...narrowCells];
  const { originCell, pxPerCell } = placement;
  const insetOf = (c: { x: number; y: number }): number => {
    const share = narrowShare.get(cellKey(c.x, c.y));
    return share === undefined ? inset : pxPerCell * narrowMargin(share) + halfInk;
  };
  const out: string[] = [];
  for (const wall of walls.filter(w => w.type !== 'door')) {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = wall.p1.x + (wall.p2.x - wall.p1.x) * t;
      const y = wall.p1.y + (wall.p2.y - wall.p1.y) * t;
      const inside = cells.some(c => {
        const x0 = (c.x - originCell.x) * pxPerCell;
        const y0 = (c.y - originCell.y) * pxPerCell;
        const within = insetOf(c);
        return x > x0 + within && x < x0 + pxPerCell - within && y > y0 + within && y < y0 + pxPerCell - within;
      });
      if (inside) {
        out.push(`${Math.round(x)},${Math.round(y)}`);
        break;
      }
    }
  }
  return out.slice(0, 5);
}

const share = (values: readonly number[], limit: number): number => values.filter(v => v <= limit).length / Math.max(1, values.length);

let outlined = 0;

describe('a dungeon scene and its map image', () => {
  for (const { seed, theme, tags, floors, look, view: change, fiveRoom } of CASES) {
    const view: DungeonView = { ...DEFAULT_VIEW, ...change };
    const label = `seed ${seed} [${tags.join(',')}], ${floors} floors, ${look}${view.monochrome ? ' monochrome' : ''}${view.smallTiles ? ', small tiles' : ''}`;
    it(`agree on walls, doors and grid: ${label}`, () => {
      const model = generateDungeon({ seed, theme, tags, floors, ...(fiveRoom && { fiveRoom }) });
      const style = dungeonStyle(look);
      const palette = paletteOf(style, view);
      // Every floor's map has the same layout, round all floors: one scale fits them all. Tolerances in pixels stay as they are at any scale.
      const px = pxPerCellFor(model, view);
      expect(px, `${label}: pixels a cell`).toBeGreaterThanOrEqual(LEAST_PX_PER_CELL);
      const layout = mapLayout(model, px, view);
      const placement = { originCell: layout.originCell, pxPerCell: px };
      const scene = dungeonScene(model, style, view, placement, { width: layout.widthPx, height: layout.heightPx }, FEET)!;
      expect(scene.scene.grid.size).toBe(view.smallTiles ? px / 2 : px);
      const halfInk = (wallInkWidth(style) / 2) * px;
      const level = (index: number): string | undefined => scene.levelIds?.[index];
      model.floors.forEach((floor, index) => {
        const where = `${label}, floor ${index}`;
        const picture = draw(model, look, view, index, px);
        const mask = inkMask(picture, parseHex(palette.ink));
        const onFloor = Object.values(scene.scene.walls).filter(wall => wall.levels?.[0] === level(index));
        const outlines = onFloor.filter(wall => wall.id.includes('_shadow_'));
        const walls = onFloor.filter(wall => !wall.id.includes('_shadow_'));
        // The floor's own walls are the scene's on its level, as the scene writer builds them alone, and so are its grounds' (a house's garden)
        const grounds = walls.filter(wall => wall.id.includes('_grounds_'));
        expect(walls.length - grounds.length, where).toBe(Object.keys(dungeonWalls(model, style, view, placement, index, { id: 'x' }).walls).length);
        expect(grounds.length, where).toBe(Object.keys(groundsWalls(floor.grounds, placement, { id: 'x' })).length);
        const toPx = (x: number, y: number): { x: number; y: number } => ({ x: (x - layout.originCell.x) * px, y: (y - layout.originCell.y) * px });

        // (a) Solid walls lie on drawn ink; the sides of a secret door's passage are not drawn, as the passage is not
        // A door's middle: its cell's, or the edge a house's door stands on.
        const middleOf = (d: (typeof floor.doors)[number]): { x: number; y: number } => (d.edge ? toPx(doorMiddle(d).x, doorMiddle(d).y) : toPx(d.x + 0.5, d.y + 0.5));
        const inSecretCell = (p: { x: number; y: number }): boolean => floor.doors.some(d => d.kind === 'secret' && Math.abs(p.x - middleOf(d).x) <= px / 2 + halfInk + 1 && Math.abs(p.y - middleOf(d).y) <= px / 2 + halfInk + 1);
        // A window stands in the cut of its outer wall, by a thin pane (`houseRender.gpu.test.ts` holds it).
        // A lit firebox's recess is walled along the firebox's own outline, drawn in its stone's ink, not the walls' (`fireLights.test.ts` holds it).
        const solid = walls.filter(w => w.type !== 'door' && w.blocks !== 'movement' && !w.id.includes('_firebox_'));
        if (model.tags.includes('inhabited') && floor.walls === 'edges') expect(walls.filter(w => w.id.includes('_firebox_')).length, where).toBe(3 * floor.props.filter(p => p.kind === 'hearth').length);
        // Where something grows, the walls are held to the picture drawn without it, and the
        // picture with it must still show its walls nearly everywhere.
        const grows = floor.growth.length > 0;
        const bare = grows ? draw(withoutGrowth(model), look, view, index, px) : picture;
        const bareMask = grows ? inkMask(bare, parseHex(palette.ink)) : mask;
        const onInk = wallsOnInk(solid, bareMask, bare).filter(s => !inSecretCell(s.at));
        const far = onInk.filter(s => s.distance > 6).slice(0, 5).map(s => `${Math.round(s.at.x)},${Math.round(s.at.y)}`);
        expect(far, `${where}: walls beyond 6 px of ink`).toEqual([]);
        expect(share(onInk.map(s => s.distance), 2), `${where}: walls within 2 px of ink`).toBeGreaterThanOrEqual(0.99);
        if (grows) {
          const shown = wallsOnInk(solid, mask, picture).filter(s => !inSecretCell(s.at));
          expect(share(shown.map(s => s.distance), 2), `${where}: walls within 2 px of ink under the growth`).toBeGreaterThanOrEqual(0.97);
        }

        // Doors stand across the middle of the drawn door, at right angles to the way through (a house's within its doorway, which its rooms' floors may shorten)
        for (const door of floor.doors.filter(d => d.kind === 'door')) {
          const centre = middleOf(door);
          const wall = walls.filter(w => w.type === 'door').find(w => Math.hypot((w.p1.x + w.p2.x) / 2 - centre.x, (w.p1.y + w.p2.y) / 2 - centre.y) <= (door.edge ? px * 0.06 : 2));
          expect(wall, `${where}: door at ${door.x},${door.y}`).toBeDefined();
          const along = { x: wall!.p2.x - wall!.p1.x, y: wall!.p2.y - wall!.p1.y };
          expect(Math.abs(along.x * door.dir.x + along.y * door.dir.y)).toBeLessThan(0.5);
        }

        // (b) Every drawn wall face has a wall along the ink's middle
        const field = visibleDungeon(model, view, index).field;
        const edges = inkEdgesFromWalls(floor, field, walls, mask, picture, placement);
        // A face pixel lies up to 3 px inside the floor's edge (0.015 cells at 200 px), and a pixel's middle half a diagonal past that
        // where an engraved shadow's hatching meets a curved wall at a slant.
        // A house's thin walls meet stacks and each other in T-junctions, whose inner corner pixels lie up to two pixels further from the ring of walls.
        const slack = floor.walls === 'edges' ? 2 : 0;
        const loose = edges.filter(e => e.distance > halfInk + 3 + Math.SQRT1_2 + slack).slice(0, 5).map(e => `${e.at.x},${e.at.y} (${e.distance.toFixed(1)} px)`);
        expect(edges.length, `${where}: wall faces found`).toBeGreaterThan(1000);
        expect(loose, `${where}: drawn wall faces without a wall`).toEqual([]);

        // No wall stands inside a cave's narrows or on its main path: the way two cells wide stays open.
        // A cell's edge may wander a fifth of a cell in (the outline keeps the middle 0.6 of every such cell, `CELL_CORE` in `outlineGuard.ts`).
        if (floor.cave) expect(wallsInWay(floor, walls, placement, px * 0.2 + halfInk, halfInk), `${where}: walls in a narrows or on the lane`).toEqual([]);

        // No wall stands in a hole or on a bridge: sight passes over a chasm. A hole over a floor below is cut out of the image; a bridge is not
        expect(wallsInTerrain(floor, walls, placement), `${where}: walls in holes or on bridges`).toEqual([]);
        const deepest = index === model.floors.length - 1;
        const bridged = new Set(floor.terrain.filter(p => p.kind === 'bridge').flatMap(p => p.cells.map(c => `${c.x},${c.y}`)));
        for (const hole of floor.terrain.filter(p => p.opening)) {
          for (const c of hole.cells) {
            const alpha = alphaAt(picture, placement, c);
            if (bridged.has(`${c.x},${c.y}`)) expect(alpha, `${where}: bridge at ${c.x},${c.y}`).toBe(255);
            else expect(alpha, `${where}: ${hole.kind} at ${c.x},${c.y}`).toBe(deepest ? 255 : 0);
          }
        }

        // The scene's grid lines are the drawn ones, and no drawn line lies between them
        const { on, off } = gridAgreement(gridFloor(floor, field), scene.scene.grid, picture, placement, { grid: parseHex(palette.grid), floor: parseHex(palette.floor) });
        expect(on, `${where}: grid pixels on the scene's lines`).toBeGreaterThan(200);
        expect(off, `${where}: grid pixels between the scene's lines`).toBeLessThan(on * 0.1);

        // (c) Every outline of a tall object lies on the object as drawn (both drawn without shadows, which fall beside it)
        const plain = { ...view, shadow: false };
        const changed = changedMask(draw(model, look, plain, index, px), draw(withoutTallObjects(model), look, plain, index, px));
        const stray = outlinesOffObjects(outlinesOf(outlines), changed, picture, px * 0.12, 0.15).slice(0, 5).map(p => `${Math.round(p.x)},${Math.round(p.y)}`);
        expect(stray, `${where}: outlines off their drawn object`).toEqual([]);
        outlined += outlinesOf(outlines).length;
      });
    });
  }
  it('outlines tall objects in the cases above', () => {
    expect(outlined).toBeGreaterThan(20);
  });
});
