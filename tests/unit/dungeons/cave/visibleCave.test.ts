import { describe, expect, it } from 'vitest';
import { cellsOf } from '../../../../src/app/dungeons/geometry';
import type { CaveFloor, CellPoint, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { caveFloorShapes } from '../../../../src/app/dungeons/render/cave/visibleCave';
import { type FloorShape, type Vec, pointSegmentDistance, shapeDistance } from '../../../../src/app/dungeons/render/geometry';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { visibleFloor } from '../../../../src/app/dungeons/render/visibleDungeon';
import { wallInkWidth } from '../../../../src/app/dungeons/render/wallInk';
import { dungeonWalls } from '../../../../src/app/dungeons/scene/toWalls';
import { wallRings } from '../../../../src/app/dungeons/scene/wallOutline';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import { addDoor, addRoom, emptyModel, entryFloor } from '../../../fixtures/dungeonModelBuilder';

const STYLE = dungeonStyle('parchment');
const CAVE: CaveFloor = { lane: [], heights: [], faults: [], basins: [], streams: [], dams: [] };

const rect = (x0: number, y0: number, x1: number, y1: number): CellPoint[] => cellsOf({ x0, y0, x1, y1 });

/**
 * Chamber 0 (entered by a two-cell mouth from the top), a wide narrows east into chamber 1, and a
 * secret crawl south from chamber 1 into a one-room wing (2).
 */
function cavern(): DungeonModel {
  const model: DungeonModel = { ...emptyModel(31), theme: 'cavern' };
  const floor = entryFloor(model);
  floor.cave = CAVE;
  const a = rect(0, 0, 5, 4).filter((c) => !(c.x === 5 && c.y === 0) && !(c.x === 0 && c.y === 4));
  addRoom(floor, { x: 0, y: 0, w: 6, h: 5, axis: { x: 0, y: 1 }, cells: a } as DungeonRoom);
  addRoom(floor, { x: 7, y: 0, w: 6, h: 5, axis: { x: 1, y: 0 }, parent: 0, cells: rect(7, 0, 12, 4).filter((c) => !(c.x === 12 && c.y === 4)) } as DungeonRoom);
  addRoom(floor, { x: 8, y: 6, w: 4, h: 4, axis: { x: 0, y: 1 }, parent: 1, wing: 'secret', cells: rect(8, 6, 11, 9) } as DungeonRoom);
  floor.doors.push({ x: 2, y: -1, dir: { x: 0, y: 1 }, kind: 'opening', from: null, to: 0, wide: { x: 1, y: 0 } });
  floor.doors.push({ x: 6, y: 1, dir: { x: 1, y: 0 }, kind: 'opening', from: 0, to: 1, wide: { x: 0, y: 1 } });
  addDoor(floor, 9, 5, { x: 0, y: 1 }, 'secret', 1, 2);
  return model;
}

const inside = (shapes: readonly FloorShape[], p: Vec): boolean => Math.min(...shapes.map((s) => shapeDistance(s, p.x, p.y))) < 0;

describe('a cavern floor as the view shows it', () => {
  it('is the traced mask: crawl cells are rock', () => {
    const model = cavern();
    const { floors, rooms, doors } = visibleFloor(model, DEFAULT_VIEW);
    expect(floors).toBe(caveFloorShapes(model, 0, rooms, doors));
    expect(floors.every((s) => s.kind === 'poly')).toBe(true);
    for (const room of rooms) for (const c of room.cells!) expect(inside(floors, { x: c.x + 0.5, y: c.y + 0.5 })).toBe(true);
    for (const c of [{ x: 6, y: 1 }, { x: 6, y: 2 }, { x: 2, y: -1 }, { x: 3, y: -1 }]) expect(inside(floors, { x: c.x + 0.5, y: c.y + 0.5 })).toBe(true);
    expect(inside(floors, { x: 9.5, y: 5.5 })).toBe(false);
    expect(inside(floors, { x: 5.5, y: 0.5 })).toBe(false);
  });

  it('has its walls on the outline grown by half the wall ink, and every secret door placed', () => {
    const model = cavern();
    const placement = { originCell: mapLayout(model, 100, DEFAULT_VIEW).originCell, pxPerCell: 100 };
    const { floors, doors } = visibleFloor(model, DEFAULT_VIEW);
    const half = wallInkWidth(STYLE) / 2;
    const rings = wallRings(floors, doors.filter((d) => d.kind === 'secret'), half);
    const { walls, unplaced } = dungeonWalls(model, STYLE, DEFAULT_VIEW, placement);
    expect(unplaced).toBe(0);
    const secret = Object.values(walls).filter((w) => w.type === 'secret-door');
    expect(secret).toHaveLength(1);
    const cell = (p: Vec): Vec => ({ x: p.x / 100 + placement.originCell.x, y: p.y / 100 + placement.originCell.y });
    const near = (p: Vec): number => Math.min(...rings.flatMap((ring) => ring.map((a, i) => pointSegmentDistance(p, a, ring[(i + 1) % ring.length]!))));
    for (const wall of Object.values(walls)) for (const p of [wall.p1, wall.p2]) expect(near(cell(p))).toBeLessThan(1e-3);
    // The crawl's door stands in its cell's middle.
    const mid = cell({ x: (secret[0]!.p1.x + secret[0]!.p2.x) / 2, y: (secret[0]!.p1.y + secret[0]!.p2.y) / 2 });
    expect(mid.y).toBeCloseTo(5.5, 6);
  });

  it('leaves no wall across either cell of a two-cell mouth', () => {
    const model = cavern();
    const placement = { originCell: mapLayout(model, 100, DEFAULT_VIEW).originCell, pxPerCell: 100 };
    const walls = Object.values(dungeonWalls(model, STYLE, DEFAULT_VIEW, placement).walls);
    const toCell = (p: Vec): Vec => ({ x: p.x / 100 + placement.originCell.x, y: p.y / 100 + placement.originCell.y });
    for (const x of [2.5, 3.5]) {
      const across = walls.filter((w) => {
        const a = toCell(w.p1);
        const b = toCell(w.p2);
        return Math.min(a.x, b.x) <= x && Math.max(a.x, b.x) >= x && Math.min(a.y, b.y) <= -0.5 && Math.max(a.y, b.y) >= -1.6;
      });
      expect(across.map((w) => [toCell(w.p1), toCell(w.p2)])).toEqual([]);
    }
  });

  it('changes only within 2 cells of the crawl when a wing is hidden', () => {
    const model = cavern();
    const shown = visibleFloor(model, DEFAULT_VIEW).floors;
    const hidden = visibleFloor(model, { ...DEFAULT_VIEW, secrets: false }).floors;
    const vertices = (shapes: readonly FloorShape[]): Set<string> =>
      new Set(
        shapes
          .flatMap((s) => (s.kind === 'poly' ? s.rings.flat() : []))
          .filter((p) => Math.max(Math.abs(p.x - 9.5), Math.abs(p.y - 5.5)) > 2.5 && p.y < 6)
          .map((p) => `${p.x},${p.y}`),
      );
    expect(vertices(hidden)).toEqual(vertices(shown));
  });

  it('survives a JSON round trip and draws the same', () => {
    const model = cavern();
    const copy = JSON.parse(JSON.stringify(model)) as DungeonModel;
    expect(visibleFloor(copy, DEFAULT_VIEW).floors).toEqual(visibleFloor(model, DEFAULT_VIEW).floors);
  });
});
