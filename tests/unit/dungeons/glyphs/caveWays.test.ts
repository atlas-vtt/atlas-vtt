import { describe, expect, it, vi } from 'vitest';
import type { CellDir, DungeonDoor, DungeonModel, DungeonStair } from '../../../../src/app/dungeons/model';
import { buildArtScene } from '../../../../src/app/dungeons/render/art/artScene';
import type { Canvas2D } from '../../../../src/app/dungeons/render/geometry';
import type { Hand } from '../../../../src/app/dungeons/render/art/hand';
import { pathBounds, type PathFn } from '../../../../src/app/dungeons/render/art/paths';
import { caveWay, type CaveWayPart } from '../../../../src/app/dungeons/render/cave/caveArt';
import { CAVE_WAYS } from '../../../../src/app/dungeons/render/cave/ways';
import { engravedHand } from '../../../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../../../src/app/dungeons/render/engraved/pens';
import { stoneColours } from '../../../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../../../src/app/dungeons/render/stone/hand';
import { createRenderEnv } from '../../../../src/app/dungeons/render/renderEnv';
import { SvgCanvas } from '../../../../src/app/dungeons/render/svgCanvas';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import { addRoom, emptyFloor, emptyModel } from '../../../fixtures/dungeonModelBuilder';

const PARTS: CaveWayPart[] = ['narrows', 'crawl', 'pitch', 'aven', 'scree'];
const DIRS: CellDir[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const STAIR: DungeonStair = { x: 2, y: 2, w: 2, h: 3, down: { x: 0, y: 1 }, to: 1, link: 0, way: 'pitch' };

function modelWith(doors: DungeonDoor[] = [], stairs: DungeonStair[] = []): DungeonModel {
  const model = emptyModel(412);
  model.theme = 'cavern';
  model.floors.push(emptyFloor());
  for (const floor of model.floors) {
    addRoom(floor, { x: 0, y: 0, w: 8, h: 8 });
    floor.cave = { lane: [], heights: [0], faults: [], basins: [], streams: [], dams: [] };
    floor.doors = doors;
    floor.stairs = stairs;
  }
  return model;
}

function record(model: DungeonModel, index = 0, secrets = true): Hand {
  const ctx = new SvgCanvas(1200, 1200);
  const view = { ...DEFAULT_VIEW, secrets, shadow: false };
  const env = createRenderEnv(ctx as unknown as Canvas2D, visibleDungeon(model, view, index), dungeonStyle('parchment'), view, 150);
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: 1200, heightPx: 1200, pxPerCell: 150 }, [], false, false);
  return { scene, surface: vi.fn(), fill: vi.fn(), grain: vi.fn(), line: vi.fn(), edges: vi.fn(), solid: vi.fn(), tone: vi.fn(), water: vi.fn(), lava: vi.fn(), paint: () => ({ fill: '#ddd', ink: '#111' }), weight: () => 0.02 };
}

function draw(part: CaveWayPart, hand: Hand): void {
  expect(CAVE_WAYS[part], part).toBeTypeOf('function');
  CAVE_WAYS[part]!(hand);
}

function operations(hand: Hand): number {
  return [hand.surface, hand.grain, hand.line, hand.edges, hand.solid, hand.tone].reduce((n, fn) => n + vi.mocked(fn).mock.calls.length, 0);
}

/** Sample every recorded path segment, including closure, with its widest ink allowance. */
function pathPoints(path: PathFn): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let previous = { x: 0, y: 0 };
  let first = previous;
  const lineTo = (x: number, y: number): void => {
    const start = previous;
    for (let i = 0; i <= 40; i++) points.push({ x: start.x + (x - start.x) * i / 40, y: start.y + (y - start.y) * i / 40 });
    previous = { x, y };
  };
  const recorder = {
    moveTo: (x: number, y: number): void => { previous = { x, y }; first = previous; }, lineTo,
    closePath: (): void => lineTo(first.x, first.y),
  } as CanvasPath;
  path(recorder);
  return points;
}

describe('cave ways', () => {
  it('draws every way kind it is given and nothing else', () => {
    expect(Object.keys(CAVE_WAYS).sort()).toEqual([...PARTS].sort());
    for (const part of PARTS) {
      const empty = record(modelWith());
      draw(part, empty);
      expect(operations(empty), `${part}: empty floor`).toBe(0);
      const kind = part === 'crawl' ? 'secret' : part === 'scree' ? 'steps' : 'opening';
      const doors: DungeonDoor[] = part === 'pitch' || part === 'aven' ? [] : [{ x: 3, y: 3, dir: DIRS[0]!, kind, from: 0, to: 0 }];
      const stairs = part === 'pitch' || part === 'aven' ? [{ ...STAIR, to: part === 'aven' ? 0 : 1 }] : [];
      const hand = record(modelWith(doors, stairs), part === 'aven' ? 1 : 0);
      draw(part, hand);
      expect(operations(hand), part).toBeGreaterThan(0);
      for (const other of PARTS.filter(p => p !== part)) {
        const wrong = record(modelWith(doors, stairs), part === 'aven' ? 1 : 0);
        draw(other, wrong);
        expect(operations(wrong), `${other} drawing ${part}`).toBe(0);
      }
    }
  });

  it('draws every way as vector paths in both painters', () => {
    for (const look of ['parchment', 'print']) for (const part of PARTS) {
      const model = modelWith();
      const index = part === 'aven' ? 1 : 0;
      const floor = model.floors[index]!;
      if (part === 'narrows' || part === 'crawl') floor.doors.push({ x: 3, y: 3, dir: DIRS[0]!, kind: part === 'crawl' ? 'secret' : 'opening', from: 0, to: 0 });
      else floor.stairs.push({ ...STAIR, way: part === 'scree' ? 'scree' : 'pitch', to: 1 - index });
      const { scene } = record(model, index);
      scene.env.style = dungeonStyle(look);
      const hand = look === 'print' ? engravedHand(scene, pensOf(scene)) : stoneHand(scene, stoneColours(scene.env.palette, false));
      draw(part, hand);
      const ctx = scene.env.ctx as unknown as SvgCanvas;
      expect(ctx.toSvg().match(/<path\b/g)?.length ?? 0, `${look} ${part}`).toBeGreaterThan(0);
      expect(ctx.toSvg()).not.toContain('<text');
    }
  });

  it('keeps the narrows open at full width in every direction, including both wide offsets', () => {
    for (const dir of DIRS) for (const side of [0, -1, 1]) {
      const wide = side ? { x: -dir.y * side, y: dir.x * side } as CellDir : undefined;
      const door: DungeonDoor = { x: 3, y: 3, dir, kind: 'opening', from: 0, to: 0, ...(wide && { wide }) };
      const hand = record(modelWith([door]));
      draw('narrows', hand);
      const paths = vi.mocked(hand.surface).mock.calls.map(([path]) => path);
      expect(paths.length).toBeGreaterThan(0);
      const points = paths.flatMap(pathPoints);
      points.push(...vi.mocked(hand.edges).mock.calls.flatMap(([poly]) => poly));
      points.push(...vi.mocked(hand.line).mock.calls.flatMap(([runs]) => runs.flat()));
      const cx = 3.5 + (wide?.x ?? 0) / 2;
      const cy = 3.5 + (wide?.y ?? 0) / 2;
      const half = side ? 1 : 0.5;
      for (const p of points) {
        const u = (p.x - cx) * -dir.y + (p.y - cy) * dir.x;
        const v = (p.x - cx) * dir.x + (p.y - cy) * dir.y;
        expect(Math.abs(u) - 0.023, 'even the heaviest lip stays outside the full route').toBeGreaterThanOrEqual(half);
        expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('keeps crawls in rock without painting over either mouth wall', () => {
    for (const dir of DIRS) {
      const hand = record(modelWith([{ x: 3, y: 3, dir, kind: 'secret', from: 0, to: 0 }]));
      draw('crawl', hand);
      for (const [path] of vi.mocked(hand.surface).mock.calls) {
        const b = pathBounds(path)!;
        expect(b.minX).toBeGreaterThan(3.03);
        expect(b.minY).toBeGreaterThan(3.03);
        expect(b.maxX).toBeLessThan(3.97);
        expect(b.maxY).toBeLessThan(3.97);
      }
    }
  });

  it('hides a secret wing and never dispatches cave art on a built floor', () => {
    const model = modelWith([{ x: 3, y: 3, dir: DIRS[0]!, kind: 'secret', from: 0, to: 1 }]);
    addRoom(model.floors[0]!, { x: 9, y: 0, w: 3, h: 3, wing: 'secret', parent: 0 });
    const hidden = record(model, 0, false);
    draw('crawl', hidden);
    expect(operations(hidden)).toBe(0);
    delete model.floors[0]!.cave;
    const built = record(model);
    for (const part of PARTS) expect(caveWay(part, built.scene.env)).toBeUndefined();
  });

  it('draws scree on both floors and darkens it towards down or descends', () => {
    for (const dir of DIRS) for (const descends of [true, undefined] as const) {
      const hand = record(modelWith([{ x: 3, y: 3, dir, kind: 'steps', from: 0, to: 0, ...(descends && { descends }) }]));
      draw('scree', hand);
      const solids = vi.mocked(hand.solid).mock.calls;
      expect(solids.length).toBeGreaterThan(0);
      const sign = descends ? 1 : -1;
      for (const [, centre, , strength] of solids) {
        const downhill = (centre.x - 3.5) * dir.x * sign + (centre.y - 3.5) * dir.y * sign;
        expect(strength).toBeCloseTo(0.5 + downhill);
      }
    }
    for (const floor of [0, 1]) {
      const hand = record(modelWith([], [{ ...STAIR, to: 1 - floor, way: 'scree' }]), floor);
      draw('scree', hand);
      expect(operations(hand)).toBeGreaterThan(0);
    }
  });
});
