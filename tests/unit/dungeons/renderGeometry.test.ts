import { describe, expect, it } from 'vitest';
import { doorShape, doorShapes, rotundaRadius, roomShape, shapeDistance, signedArea2, shapePolygon } from '../../../src/app/dungeons/render/geometry';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { insetRuns } from '../../../src/app/dungeons/render/shore';
import { taperedOutline } from '../../../src/app/dungeons/render/debris';
import { paletteOf } from '../../../src/app/dungeons/render/palette';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { smallDungeon } from '../../fixtures/dungeonModels';
import { pool } from '../../fixtures/dungeonModelBuilder';
import { rngFrom } from '../../../src/app/dungeons/rng';
import { pointInPolygon } from '../../../src/app/dungeons/render/geometry';
import { holeRings } from '../../../src/app/dungeons/render/terrain/holes';
import { cutsHoles } from '../../../src/app/dungeons/render/terrain/pieces';
import { stairwellEnd } from '../../../src/app/dungeons/render/art/passages';
import type { RenderEnv } from '../../../src/app/dungeons/render/renderEnv';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { draft } from '../../../src/app/dungeons/terrain/catalog';

describe('dungeon render geometry', () => {
  it('draws a rotunda through the inner corners of its cardinal door cells', () => {
    const room = smallDungeon().floors[0]!.rooms.find(r => r.rotunda)!;
    const circle = roomShape(room);
    expect(circle.kind).toBe('circle');
    expect(rotundaRadius(room)).toBeCloseTo(Math.sqrt(26) / 2);
    // The south door cell's inner edge runs along the floor's bottom row.
    expect(shapeDistance(circle, room.x + room.w / 2 - 0.5, room.y + room.h)).toBeCloseTo(0, 9);
  });

  it('measures signed distance to a rectangle, negative inside', () => {
    const cell = doorShape({ x: 2, y: 3 });
    expect(shapeDistance(cell, 2.5, 3.5)).toBeCloseTo(-0.5);
    expect(shapeDistance(cell, 4, 3.5)).toBeCloseTo(1);
    expect(shapeDistance(cell, 4, 5)).toBeCloseTo(Math.SQRT2);
  });

  it('narrows a narrow opening with wall jambs and leaves any other door cell whole', () => {
    const across = { x: 2, y: 3, dir: { x: 1, y: 0 } as const };
    expect(doorShapes(across, false)).toEqual([doorShape(across)]);
    const pieces = doorShapes(across, true);
    const floor = (x: number, y: number): boolean => pieces.some(shape => shapeDistance(shape, x, y) < 0);
    // Full width where it meets the rooms, 0.6 of a cell between the jambs.
    expect(floor(2.1, 3.05)).toBe(true);
    expect(floor(2.5, 3.5)).toBe(true);
    expect(floor(2.5, 3.1)).toBe(false);
    expect(floor(2.5, 3.9)).toBe(false);
    expect(floor(2.5, 3.25)).toBe(true);
  });

  it('keeps every polygon clockwise on screen, so a nonzero fill is a union', () => {
    for (const shape of visibleDungeon(smallDungeon(), DEFAULT_VIEW).floors) {
      expect(signedArea2(shapePolygon(shape))).toBeGreaterThan(0);
    }
  });

  it('turns a secret door into wall and hides the secret wing with its doors when asked', () => {
    const model = smallDungeon();
    const shown = visibleDungeon(model, DEFAULT_VIEW);
    const secretDoor = model.floors[0]!.doors.find(d => d.kind === 'secret')!;
    expect(shown.doors).toContain(secretDoor);
    expect(shown.field.distance(secretDoor.x + 0.5, secretDoor.y + 0.5)).toBeGreaterThan(0);
    const hidden = visibleDungeon(model, { secrets: false });
    expect(hidden.rooms.some(r => r.wing === 'secret')).toBe(false);
    expect(hidden.doors).not.toContain(secretDoor);
  });

  it('narrows an opening into a room or from outside, and lets corridors run on through one', () => {
    const dungeon = visibleDungeon(smallDungeon(), DEFAULT_VIEW);
    const openings = dungeon.doors.filter(d => d.kind === 'opening');
    expect(openings.filter(d => dungeon.wide.has(d)).map(d => [d.x, d.y])).toEqual([[8, -3]]);
  });

  it('answers the floor field as the union of the floors', () => {
    const dungeon = visibleDungeon(smallDungeon(), DEFAULT_VIEW);
    expect(dungeon.field.distance(0.5, -2.5)).toBeLessThan(0);
    // The door cell between the hall and the rotunda is floor.
    expect(dungeon.field.distance(0.5, -5.5)).toBeLessThan(0);
    expect(dungeon.field.distance(-20, -20)).toBeGreaterThan(1);
  });
});

describe('the picture of each floor of a stack', () => {
  const fortress = generateDungeon({ seed: 23, theme: 'fortress', tags: [], floors: 3 });
  const cavern = generateDungeon({ seed: 23, theme: 'cavern', tags: [], floors: 3 });
  const envOf = (model: typeof fortress, index: number): RenderEnv => ({ openings: 'cut', dungeon: { model, index } }) as unknown as RenderEnv;

  it('cuts holes on every floor of a Fortress but the entrance floor', () => {
    expect([0, 1, 2].map((index) => cutsHoles(envOf(fortress, index)))).toEqual([false, true, true]);
    expect([0, 1, 2].map((index) => cutsHoles(envOf(cavern, index)))).toEqual([true, true, false]);
  });

  it('draws the stairwell going down on the floor above', () => {
    const up = fortress.floors[1]!.stairs.find((s) => s.to === 0)!;
    expect(stairwellEnd({ model: fortress, index: 1 }, up)).toBe('upper');
    expect(stairwellEnd({ model: fortress, index: 0 }, fortress.floors[0]!.stairs[0]!)).toBe('lower');
    expect(stairwellEnd({ model: cavern, index: 0 }, cavern.floors[0]!.stairs[0]!)).toBe('upper');
  });
});

describe('openings in the floor', () => {
  it('cuts a murder hole as a small square in the middle of its cell and a gallery along its cells', () => {
    const hole = { ...draft('murder-hole', 0, [{ x: 3, y: 5 }]), id: 0, opening: { bottom: 0, link: 0 } };
    expect(holeRings(hole)).toEqual([[{ x: 3.3, y: 5.3 }, { x: 3.7, y: 5.3 }, { x: 3.7, y: 5.7 }, { x: 3.3, y: 5.7 }]]);
    const gallery = { ...draft('gallery', 0, [{ x: 0, y: 0 }, { x: 1, y: 0 }]), id: 1, opening: { bottom: 0, link: 1 } };
    const xs = holeRings(gallery).flat().map((p) => p.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 2]);
  });
});

describe('dungeon render details', () => {
  it('lays ripples a full inset inside their pool', () => {
    const water = pool(rngFrom(3), 0, 0, 2, 1.5);
    const runs = insetRuns(water.outline, 0.3);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) for (const p of run) expect(pointInPolygon(water.outline, p.x, p.y)).toBe(true);
  });

  it('tapers a crack from its width to a point', () => {
    const outline = taperedOutline({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], width: 0.2 });
    expect(outline).toHaveLength(6);
    expect(Math.abs(outline[0]!.y - outline[5]!.y)).toBeCloseTo(0.2);
    expect(outline[2]!.y).toBeCloseTo(outline[3]!.y);
  });

  it('snaps colours to ink or paper in monochrome and casts shadows in the ink', () => {
    const style = dungeonStyle('parchment');
    const mono = paletteOf(style, { monochrome: true, shadow: true });
    expect([style.colors.ink, style.colors.paper]).toContain(mono.floor);
    expect([style.colors.ink, style.colors.paper]).toContain(mono.water);
    expect(mono.shadow).toBe(style.colors.ink);
    expect(paletteOf(style, { monochrome: true, shadow: false }).shadow).toBeNull();
    expect(paletteOf(style, { monochrome: false, shadow: true }).shadow).toBe(style.shadow.color);
  });
});
