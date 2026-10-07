import { describe, expect, it } from 'vitest';
import { LIMITED_WALLS } from '../../featureFlags';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { SceneModelBuilder } from '../../vision/sceneModel';
import { hasKindLook } from '../../pixi/vision/wallKindLook';
import type { WallSegment } from '../../types/wallTypes';
import { wallList } from '../../vision/wallList';
import { readWall } from '../lightingObjects';
import { splitBlocking } from '../segments';

const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] } as unknown as MeasurementSettings;
const bounds = { width: 1024, height: 1024 };

/** A room with a token and a torch on one side of two walls across it; `extra` is what the file says of those two walls. */
function sceneWith(extra: Partial<WallSegment>): Parameters<SceneModelBuilder['update']>[0] {
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number, more: Partial<WallSegment> = {}): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...more });
  const walls = [
    wall('n', 100, 100, 900, 100), wall('e', 900, 100, 900, 900), wall('s', 900, 900, 100, 900), wall('w', 100, 900, 100, 100),
    // Two walls across the room, the second with an end six pixels short of the room's wall: the sealing bridges it.
    wall('first', 400, 100, 400, 900, extra), wall('second', 600, 106, 600, 900, extra),
  ];
  return {
    objects: {
      walls: Object.fromEntries(walls.map((w) => [w.id, w])),
      lights: { torch: { id: 'torch', kind: 'light', x: 250, y: 500, emission: { bright: 40, dim: 80, color: '#ffd9a0', intensity: 1, animation: 'none' } } },
      tokens: { v: { id: 'v', kind: 'token', imagePath: 'v.png', x: 200, y: 400, size: 1, vision: { enabled: true } } },
    },
    lighting: { enabled: true, ambient: 0 }, grid: null, heldTokens: {},
  } as unknown as Parameters<SceneModelBuilder['update']>[0];
}

const modelOf = (extra: Partial<WallSegment>): ReturnType<SceneModelBuilder['update']>['model'] => new SceneModelBuilder().update(sceneWith(extra), bounds, () => FEET).model;

describe('limited walls switched off (the release)', () => {
  it('is how the release is built', () => {
    expect(LIMITED_WALLS).toBe(false);
  });

  it('reads a wall whose file says it is limited as a wall like any other, and leaves the file\'s record as it is', () => {
    const record = { id: 'h', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, limited: true, blocks: 'sight' };
    const read = readWall(record)!;
    expect(read.limited).toBeUndefined();
    expect(read.blocks).toBe('sight');
    expect(record.limited).toBe(true);
    expect(readWall(record)).toBe(read);
    // Nothing that looks at walls finds a limited one: no count, no mask, no field, no dots.
    const list = wallList({ h: record as unknown as WallSegment });
    expect(splitBlocking(list, 'light').limited).toEqual([]);
    expect(splitBlocking(list, 'sight').limited).toEqual([]);
    expect(hasKindLook(readWall({ ...record, blocks: undefined })!)).toBe(false);
  });

  it('builds for a scene with limited walls exactly what it builds for the same scene with solid ones: bridges, sight and light', () => {
    const limited = modelOf({ limited: true }), solid = modelOf({});
    expect(limited.walls.length).toBeGreaterThan(6);
    expect(limited.walls.map(({ id, p1, p2, limited: isLimited, blocks }) => ({ id, p1, p2, isLimited, blocks }))).toEqual(solid.walls.map(({ id, p1, p2, limited: isLimited, blocks }) => ({ id, p1, p2, isLimited, blocks })));
    expect(limited.walls.some((wall) => wall.limited)).toBe(false);
    expect(limited.sight.regions.map((region) => region.polygon)).toEqual(solid.sight.regions.map((region) => region.polygon));
    expect(limited.sight.regions[0]!.polygon!.length).toBeGreaterThan(60);
    expect(limited.reaches.map((reach) => reach.polygon)).toEqual(solid.reaches.map((reach) => reach.polygon));
    // The token and the torch stand west of the first wall: nothing of theirs lies east of it.
    expect(Math.max(...limited.sight.regions[0]!.polygon!.map((corner) => corner.x))).toBeLessThanOrEqual(400.001);
    expect(Math.max(...limited.reaches[0]!.polygon.map((corner) => corner.x))).toBeLessThanOrEqual(400.001);
  });
});
