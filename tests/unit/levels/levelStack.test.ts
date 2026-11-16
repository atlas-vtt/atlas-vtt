import { describe, expect, it } from 'vitest';
import { levelStack, levelsShownBelow, shownAt, shownAtCell, stackGrid, VIEWED, VOID, withDrawn, type StackLevel } from '../../../src/app/levels/levelStack';
import { artCells, type ArtAlpha } from '../../../src/app/levels/artRaster';
import { NO_STRETCH } from '../../../src/app/grid/mapStretch';
import { stampClip } from '../../../src/app/levels/stackClip';
import { paintPolygon, polygonTexels } from '../../../src/app/levels/surfaceRaster';
import type { LevelSurface, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { Point } from '../../../src/app/types/visionTypes';
import { pointInPolygon } from '../../../src/app/vision/visibility';

const surface = (id: string, open: boolean, polygon: Point[]): LevelSurface => ({ id, kind: 'level-surface', open, polygon });
const rect = (x: number, y: number, w: number, h: number): Point[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

/** A seeded random number in [0, 1). */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A star-shaped polygon about (cx, cy): simple, so its nonzero and even-odd fills agree. */
function star(rand: () => number, cx: number, cy: number): Point[] {
  const corners = 3 + Math.floor(rand() * 9);
  return Array.from({ length: corners }, (_, i) => {
    const angle = (i / corners) * Math.PI * 2 + rand() * 0.3;
    const reach = 5 + rand() * 40;
    return { x: cx + Math.cos(angle) * reach, y: cy + Math.sin(angle) * reach };
  });
}

const SAMPLES = 9;

describe('polygons on texels', () => {
  it('covers a texel wholly only where every point of it is inside, and touches every texel any point inside lies in', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 60; trial++) {
      const texel = [1, 1.5, 3.7][trial % 3]!;
      const polygon = star(rand, 60 + rand() * 10, 60 + rand() * 10);
      const box = { x: 0, y: 0, columns: Math.ceil(130 / texel), rows: Math.ceil(130 / texel) };
      const { inside, touched } = polygonTexels(polygon, texel, box);
      for (let row = 0; row < box.rows; row++) {
        for (let column = 0; column < box.columns; column++) {
          const i = row * box.columns + column;
          let all = true;
          let some = false;
          for (let sy = 0; sy <= SAMPLES; sy++) {
            for (let sx = 0; sx <= SAMPLES; sx++) {
              const hit = pointInPolygon({ x: (column + sx / SAMPLES) * texel, y: (row + sy / SAMPLES) * texel }, polygon);
              all &&= hit;
              some ||= hit;
            }
          }
          if (inside[i]) expect(all, `texel ${column},${row} of trial ${trial}`).toBe(true);
          if (some) expect(touched[i], `texel ${column},${row} of trial ${trial}`).toBe(1);
        }
      }
    }
  });

  it('paints an opening on the texels it covers wholly and floor on every texel it touches, as polygonTexels reads them', () => {
    const rand = rng(11);
    for (let trial = 0; trial < 60; trial++) {
      const texel = [1, 1.5, 3.7][trial % 3]!;
      const open = trial % 2 === 0;
      const polygon = star(rand, 60 + rand() * 10, 60 + rand() * 10);
      // The target is larger than the part painted, which lies within it off its corner.
      const target = { x: 0, y: 0, columns: Math.ceil(150 / texel), rows: Math.ceil(150 / texel) };
      const area = { x: 2, y: 3, columns: Math.ceil(130 / texel), rows: Math.ceil(130 / texel) };
      const painted = new Uint8Array(target.columns * target.rows).map((_, i) => (i * 7) % 3 === 0 ? 1 : 0);
      const expected = painted.slice();
      const { inside, touched } = polygonTexels(polygon, texel, area);
      for (let row = 0; row < area.rows; row++) {
        for (let column = 0; column < area.columns; column++) {
          const i = row * area.columns + column;
          const at = (area.y + row) * target.columns + area.x + column;
          if (open && inside[i]) expected[at] = 1;
          if (!open && touched[i]) expected[at] = 0;
        }
      }
      paintPolygon(polygon, texel, area, open, painted, target);
      expect(painted, `trial ${trial}`).toEqual(expected);
    }
  });
});

describe('the level stack', () => {
  const grid = stackGrid({ width: 200, height: 200 });
  const below = (id: string, surfaces: LevelSurface[] = [], art?: StackLevel['art']): StackLevel => ({ id, surfaces, art });
  /** A map of `width` × `height` world pixels, holding art except where `clear` says. */
  const mapArt = (width: number, height: number, clear: (x: number, y: number) => boolean = () => false, on = grid): StackLevel['art'] => {
    const opaque = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) opaque[y * width + x] = clear(x, y) ? 0 : 1;
    const alpha: ArtAlpha = { width, height, opaque };
    return artCells({ width, height, alpha }, NO_STRETCH, true, on);
  };

  it('shows only the viewed level without an opening, and needs no cells for it', () => {
    const stack = levelStack(below('upper', [surface('floor', false, rect(0, 0, 50, 50))]), [below('ground')], ['ground'], grid);
    expect(stack.box).toBeNull();
    expect(shownAt(stack, { x: 10, y: 10 })).toBe(VIEWED);
  });

  it('shows the level below through an opening, shrunk to whole texels, and a later floor closes it again', () => {
    const viewed = below('upper', [surface('hole', true, rect(10.5, 10.5, 40, 40)), surface('plank', false, rect(29.5, 0, 1, 200))]);
    const stack = levelStack(viewed, [below('ground')], ['ground'], grid);
    expect(shownAt(stack, { x: 20, y: 20 })).toBe(1);
    // The texel the opening's edge cuts shows the viewed level.
    expect(shownAtCell(stack, 10, 20)).toBe(VIEWED);
    expect(shownAtCell(stack, 11, 20)).toBe(1);
    // The floor touches texels 29 and 30.
    expect(shownAtCell(stack, 29, 20)).toBe(VIEWED);
    expect(shownAtCell(stack, 30, 20)).toBe(VIEWED);
    expect(shownAtCell(stack, 31, 20)).toBe(1);
  });

  it('reads a level below that is not drawn as nothing, where its floor stops the view', () => {
    const viewed = below('upper', [surface('hole', true, rect(0, 0, 100, 100))]);
    const stack = levelStack(viewed, [below('ground', [surface('pit', true, rect(0, 0, 50, 50))]), below('cellar')], ['ground'], grid);
    expect(shownAt(stack, { x: 70, y: 70 })).toBe(1);
    // Through the ground floor's pit the cellar has floor, and the view draws only one level below.
    expect(shownAt(stack, { x: 20, y: 20 })).toBe(VOID);
  });

  it('reads a chasm, where no level below has floor, as nothing', () => {
    const stack = levelStack(below('ground', [surface('hole', true, rect(0, 0, 100, 100))]), [below('cellar', [surface('pit', true, rect(0, 0, 100, 100))])], ['cellar'], grid);
    expect(shownAt(stack, { x: 50, y: 50 })).toBe(VOID);
  });

  it('reads a level below whose picture is not ready, or that it does not see, as nothing', () => {
    const viewed = below('upper', [surface('hole', true, rect(0, 0, 100, 100))]);
    expect(shownAt(levelStack(viewed, [below('ground')], [], grid), { x: 50, y: 50 })).toBe(VOID);
  });

  it('shows a level below on every texel its map touches, and looks past it beyond', () => {
    const viewed = below('upper', [surface('hole', true, rect(0, 0, 200, 200))]);
    const ground = artCells({ width: 805, height: 2000, alpha: null }, { x: 0.1, y: 0.1 }, true, grid);
    const stack = levelStack(viewed, [below('ground', [], ground)], ['ground'], grid);
    expect(shownAtCell(stack, 80, 10)).toBe(1);
    expect(shownAtCell(stack, 81, 10)).toBe(VOID);
  });

  it('opens the viewed level where its map is transparent, and shows two levels below, nearest first', () => {
    const viewed = below('upper', [], mapArt(200, 200, (x, y) => x >= 20 && x < 120 && y >= 20 && y < 120));
    // The ground floor is transparent on its left half, the cellar holds art everywhere.
    const stack = levelStack(viewed, [below('ground', [], mapArt(200, 200, (x) => x < 60)), below('cellar', [], mapArt(200, 200))], ['ground', 'cellar'], grid);
    expect(shownAtCell(stack, 10, 50)).toBe(VIEWED);
    expect(shownAtCell(stack, 40, 50)).toBe(2);
    expect(shownAtCell(stack, 100, 50)).toBe(1);
    // One texel of the ground floor's art along the edge of its transparent part, and one texel of the upper level's.
    expect(shownAtCell(stack, 57, 50)).toBe(2);
    expect(shownAtCell(stack, 58, 50)).toBe(1);
    expect(shownAtCell(stack, 21, 50)).toBe(VIEWED);
    expect(shownAtCell(stack, 22, 50)).toBe(2);
  });

  it('reads a level not yet ready as nothing, and stays the same stack while every level is', () => {
    const viewed = below('upper', [surface('hole', true, rect(0, 0, 100, 100))]);
    const stack = levelStack(viewed, [below('ground', [], mapArt(200, 200, (x) => x < 50)), below('cellar')], ['ground', 'cellar'], grid);
    expect([shownAt(stack, { x: 20, y: 20 }), shownAt(stack, { x: 80, y: 20 })]).toEqual([2, 1]);
    const cellarOnly = withDrawn(stack, (index) => index === 2);
    expect([shownAt(cellarOnly, { x: 20, y: 20 }), shownAt(cellarOnly, { x: 80, y: 20 })]).toEqual([2, VOID]);
    expect(withDrawn(stack, () => true)).toBe(stack);
  });

  it('reads a level below it does not see as floor: nothing shows past it', () => {
    const viewed = below('upper', [surface('hole', true, rect(0, 0, 100, 100))]);
    const stack = levelStack(viewed, [below('ground', [], mapArt(200, 200, (x) => x < 50)), below('cellar')], ['cellar'], grid);
    expect(shownAt(stack, { x: 20, y: 20 })).toBe(1);
    expect(shownAt(stack, { x: 80, y: 20 })).toBe(VOID);
  });

  it('reads outside its grid as nothing, and holds a large map at 2,048 texels a side', () => {
    const large = stackGrid({ width: 8192, height: 4096 });
    expect([large.texel, large.columns, large.rows]).toEqual([4, 2048, 1024]);
    const stack = levelStack(below('upper', [surface('hole', true, rect(0, 0, 400, 400))]), [below('ground')], ['ground'], large);
    expect(shownAt(stack, { x: -1, y: 10 })).toBe(VOID);
    expect(shownAt(stack, { x: 8192, y: 10 })).toBe(VOID);
    expect(shownAt(stack, { x: 200, y: 200 })).toBe(1);
  });

  it('draws the levels below that a level sees, nearest first, two of them', () => {
    const levels: SceneLevel[] = ['vault', 'cellar', 'ground', 'upper'].map((id) => ({ id, name: id, elevation: { bottom: 0, top: 1 }, background: null }));
    expect(levelsShownBelow(levels, 'upper')).toEqual(['ground', 'cellar']);
    expect(levelsShownBelow(levels.map((level) => (level.id === 'upper' ? { ...level, sees: ['vault', 'cellar'] } : level)), 'upper')).toEqual(['cellar', 'vault']);
    expect(levelsShownBelow(levels, 'cellar')).toEqual(['vault']);
    expect(levelsShownBelow(levels, 'vault')).toEqual([]);
  });
});

describe('what a memory below records through openings', () => {
  it('never takes in a memory texel that touches a texel of the stack showing anything else', () => {
    const rand = rng(3);
    let checked = 0;
    const wrong: string[] = [];
    for (let trial = 0; trial < 24; trial++) {
      const size = [300, 2600, 5000][trial % 3]!;
      const grid = stackGrid({ width: size, height: size * 0.8 });
      const scale = Math.min(1, 2048 / size);
      const memory = { columns: Math.ceil(size * scale), rows: Math.ceil(size * 0.8 * scale), mapWidth: size, mapHeight: size * 0.8, scale };
      const holes = Array.from({ length: 3 }, () => surface('h', true, star(rand, size * (0.2 + rand() * 0.6), size * 0.4).map((p) => ({ x: p.x * (size / 120), y: p.y * (size / 300) }))));
      const stack = levelStack({ id: 'upper', surfaces: holes }, [{ id: 'ground', surfaces: [surface('pit', true, rect(size * 0.4, 0, size * 0.05, size))] }], ['ground'], grid);
      const clip = stampClip(stack, 1, memory);
      if (!clip) continue;
      for (let row = 0; row < clip.rows; row++) {
        for (let column = 0; column < clip.columns; column++) {
          if (!clip.allowed[row * clip.columns + column]) continue;
          const mx = clip.x + column;
          const my = clip.y + row;
          // Every stack texel any point of the memory texel lies in, read either way it is mapped.
          for (const [kx, ky] of [[1 / scale, 1 / scale], [size / memory.columns, (size * 0.8) / memory.rows]] as const) {
            for (let s = 0; s <= 4; s++) {
              for (let t = 0; t <= 4; t++) {
                const p = { x: (mx + s / 4) * kx, y: (my + t / 4) * ky };
                if (shownAt(stack, p) !== 1) wrong.push(`${trial}: ${mx},${my}`);
              }
            }
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });
});
