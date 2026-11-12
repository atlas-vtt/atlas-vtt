import { Texture, WebGLRenderer, type TextureSource } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS, MEASURE_EFFECT_STARTS } from '../../src/app/measure/measureEffects';
import { MOTION_LOOP } from '../../src/app/pixi/liquids/liquidMotion';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { MeasureEffectMesh } from '../../src/app/pixi/measure/effects/MeasureEffectMesh';
import type { Point } from '../../src/app/types/visionTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { drawnMap, effectShape, meanStep, renderEffects, SHAPE_NAMES } from './measureEffectsHarness';

/**
 * What must hold of every look on every shape: it draws inside its polygon and nowhere else,
 * changes from frame to frame while it moves and not at all while it is held still, takes the
 * colour it is given, moves across the clock's and the drifts' wraps as anywhere else, and leaves
 * nothing behind when it goes. How the looks look is judged by eye (`measureEffectsLook`).
 */

const CELL = 100;
const SIZE = { width: 460, height: 400 };
const CENTRE = { x: SIZE.width / 2, y: SIZE.height / 2 };
const START = 20;

/** Whether screen pixel (x, y) lies in one of `rings`, or within a pixel of it (the edge's own filtering). */
function inRings(rings: readonly Point[][], x: number, y: number): boolean {
  for (const [dx, dy] of [[0.5, 0.5], [-0.6, 0.5], [1.6, 0.5], [0.5, -0.6], [0.5, 1.6]] as const) {
    if (rings.some((ring) => pointInPolygon({ x: x + dx, y: y + dy }, ring))) return true;
  }
  return false;
}

describe('area effects on the map', () => {
  let renderer: WebGLRenderer;
  let map: Texture;
  let grey: Texture;
  const picture = (meshes: readonly MeasureEffectMesh[], under: Texture | null = map): Uint8ClampedArray => renderEffects(renderer, { ...SIZE, map: under, meshes });
  const mesh = (effect: (typeof MEASURE_EFFECTS)[number], shape: ReturnType<typeof effectShape>, color = MEASURE_EFFECT_STARTS[effect].color): MeasureEffectMesh =>
    new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color, detail: 2, cell: CELL, seed: shape.name });

  beforeAll(async () => {
    renderer = new WebGLRenderer();
    await renderer.init({ width: 64, height: 64, antialias: false });
    map = Texture.from(drawnMap('dark', SIZE.width, SIZE.height, CELL));
    const flat = new OffscreenCanvas(SIZE.width, SIZE.height);
    const ctx = flat.getContext('2d')!;
    ctx.fillStyle = 'rgb(128, 128, 128)';
    ctx.fillRect(0, 0, flat.width, flat.height);
    grey = Texture.from(flat);
  });
  afterAll(() => {
    map.destroy(true);
    grey.destroy(true);
    renderer.destroy();
  });

  for (const effect of MEASURE_EFFECTS) {
    for (const name of SHAPE_NAMES) {
      it(`${effect} on a ${name}: inside its polygon only, moving while it plays, the same while it is still`, () => {
        const shape = effectShape(name, CELL, CENTRE);
        const drawn = mesh(effect, shape);
        try {
          const bare = picture([]);
          drawn.setTime(START);
          const first = picture([drawn]);
          let inside = 0;
          let outside = 0;
          for (let y = 0; y < SIZE.height; y++) {
            for (let x = 0; x < SIZE.width; x++) {
              const at = (y * SIZE.width + x) * 4;
              if (first[at] === bare[at] && first[at + 1] === bare[at + 1] && first[at + 2] === bare[at + 2]) continue;
              if (inRings(shape.rings, x, y)) inside++;
              else outside++;
            }
          }
          expect(outside, 'pixels drawn outside the polygon').toBe(0);
          expect(inside, 'pixels drawn inside it').toBeGreaterThan(500);

          drawn.setTime(START + 1 / 30);
          expect(meanStep(first, picture([drawn])), 'a frame on, it has moved').toBeGreaterThan(0);

          drawn.setStill(true);
          const still = picture([drawn]);
          expect(meanStep(bare, still), 'still, it is drawn').toBeGreaterThan(0);
          drawn.setTime(START + 7);
          expect(picture([drawn]), 'still, the clock moves nothing').toEqual(still);
          drawn.setStill(false);
          drawn.setTime(START);
          expect(picture([drawn]), 'moving again, it is where its clock is').toEqual(first);
        } finally {
          drawn.destroy();
        }
      });
    }

    it(`${effect} takes the colour it is given`, () => {
      const shape = effectShape('circle', CELL, CENTRE);
      const bare = picture([], grey);
      /** The mean of red less blue the effect adds to a grey floor. */
      const warmth = (color: string): number => {
        const drawn = mesh(effect, shape, color);
        drawn.setTime(START);
        const shown = picture([drawn], grey);
        drawn.destroy();
        let sum = 0;
        let count = 0;
        for (let at = 0; at < shown.length; at += 4) {
          if (shown[at] === bare[at] && shown[at + 2] === bare[at + 2]) continue;
          sum += shown[at]! - shown[at + 2]!;
          count++;
        }
        return sum / Math.max(1, count);
      };
      const red = warmth('#e93147');
      const blue = warmth('#086ddd');
      expect(red, 'in red it is redder than the floor').toBeGreaterThan(1);
      expect(blue, 'in blue it is bluer than the floor').toBeLessThan(-1);
    });

    it(`${effect} moves across the wraps of its clock and drifts as anywhere else`, () => {
      const drawn = mesh(effect, effectShape('circle', CELL, CENTRE));
      try {
        const step = (seconds: number): number => {
          drawn.setTime(seconds - 1 / 60);
          const before = picture([drawn], grey);
          drawn.setTime(seconds + 1 / 60);
          return meanStep(before, picture([drawn], grey));
        };
        // Its ordinary steps, away from every wrap: lightning's arcs jump, so its largest counts.
        const ordinary = Math.max(...Array.from({ length: 24 }, (_, index) => step(1000.37 + index * 13.71)));
        for (const seconds of [MOTION_LOOP, MOTION_LOOP * 3, 64 / 0.32, 64 / 0.66, 64 / 0.085, 64 / 0.06, 64 / 0.022, 1e7]) {
          expect(step(seconds), `at ${seconds} s`).toBeLessThanOrEqual(ordinary * 1.5 + 0.1);
        }
      } finally {
        drawn.destroy();
      }
    });
  }

  it('turns radiance through a whole turn without a seam', () => {
    const drawn = mesh('radiance', effectShape('circle', CELL, CENTRE));
    drawn.setTime(START);
    const shown = picture([drawn], grey);
    drawn.destroy();
    // The row above and the row below the line the angle wraps on, left of the origin, against two rows a little higher.
    const rowStep = (y: number): number => {
      let sum = 0;
      for (let x = CENTRE.x - 180; x < CENTRE.x - 30; x++) {
        const above = ((y - 1) * SIZE.width + x) * 4;
        const below = ((y + 1) * SIZE.width + x) * 4;
        sum += Math.abs(shown[above]! - shown[below]!) + Math.abs(shown[above + 2]! - shown[below + 2]!);
      }
      return sum / 150;
    };
    const elsewhere = Math.max(rowStep(CENTRE.y - 40), rowStep(CENTRE.y + 40), rowStep(CENTRE.y - 90));
    expect(rowStep(CENTRE.y)).toBeLessThanOrEqual(elsewhere * 2 + 2);
  });

  it('draws every look without a WebGL error', () => {
    const watch = watchGl(renderer.gl as WebGL2RenderingContext);
    try {
      for (const effect of MEASURE_EFFECTS) {
        for (const detail of [2, 1, 0] as const) {
          const drawn = mesh(effect, effectShape('notched', CELL, CENTRE));
          drawn.update({ detail });
          drawn.setTime(START);
          picture([drawn]);
          drawn.setStill(true);
          picture([drawn]);
          drawn.destroy();
        }
      }
      expect(watch.findings).toEqual([]);
      expect(watch.draws()).toBeGreaterThan(0);
    } finally {
      watch.stop();
    }
  });

  it('draws each quality differently, each piece of rings walls cut apart, and nothing in a hole', () => {
    const circle = effectShape('circle', CELL, CENTRE);
    const drawn = mesh('mist', circle);
    drawn.setTime(START);
    const high = picture([drawn]);
    drawn.update({ detail: 0 });
    expect(meanStep(high, picture([drawn]))).toBeGreaterThan(0);
    drawn.destroy();

    const square = (x: number, y: number, half: number): Point[] => [{ x: x - half, y: y - half }, { x: x + half, y: y - half }, { x: x + half, y: y + half }, { x: x - half, y: y + half }];
    const rings = [square(110, 200, 90), square(340, 200, 100), square(340, 200, 40)];
    const pieces = new MeasureEffectMesh({ rings, effect: 'fire', color: '#ec7500', detail: 2, cell: CELL });
    try {
      expect(pieces.view.children).toHaveLength(2);
      expect(pieces.bounds).toEqual({ minX: 20, minY: 100, maxX: 440, maxY: 300 });
      const bare = picture([]);
      const shown = picture([pieces]);
      const changed = (x: number, y: number): boolean => shown[(y * SIZE.width + x) * 4] !== bare[(y * SIZE.width + x) * 4] || shown[(y * SIZE.width + x) * 4 + 1] !== bare[(y * SIZE.width + x) * 4 + 1];
      let inHole = 0;
      let inLeft = 0;
      let inRight = 0;
      for (let y = 165; y < 235; y++) for (let x = 305; x < 375; x++) if (changed(x, y)) inHole++;
      for (let y = 120; y < 280; y++) for (let x = 30; x < 190; x++) if (changed(x, y)) inLeft++;
      for (let y = 110; y < 290; y++) for (let x = 250; x < 290; x++) if (changed(x, y)) inRight++;
      expect(inHole).toBe(0);
      expect(inLeft).toBeGreaterThan(500);
      expect(inRight).toBeGreaterThan(200);
    } finally {
      pieces.destroy();
    }
  });

  it('moves with rings that only moved, builds anew for another shape, and leaves no texture behind', () => {
    const managed = (): number => (renderer.texture as unknown as { managedTextures: (TextureSource | null)[] }).managedTextures.filter(Boolean).length;
    picture([]);
    const before = managed();
    const circle = effectShape('circle', CELL, CENTRE, 2);
    const drawn = mesh('frost', circle);
    drawn.setTime(START);
    const first = picture([drawn], grey);
    expect(managed()).toBe(before + 1);
    const piece = drawn.view.children[0];

    // An aura that went with its token: the same picture 60 px to the right, on the same geometry.
    const moved = circle.rings.map((ring) => ring.map(({ x, y }) => ({ x: x + 60, y })));
    drawn.update({ rings: moved, origin: { x: circle.origin.x + 60, y: circle.origin.y } });
    expect(drawn.view.children[0]).toBe(piece);
    expect(drawn.bounds.minX).toBeCloseTo(CENTRE.x - CELL + 60, 6);
    const shifted = picture([drawn], grey);
    let differing = 0;
    for (let y = 0; y < SIZE.height; y++) {
      for (let x = 60; x < SIZE.width; x++) {
        const to = (y * SIZE.width + x) * 4;
        const from = (y * SIZE.width + x - 60) * 4;
        // A pixel on the outline may round the other way at its new place; none may differ by more than that.
        if (Math.abs(shifted[to]! - first[from]!) > 3 || Math.abs(shifted[to + 1]! - first[from + 1]!) > 3 || Math.abs(shifted[to + 2]! - first[from + 2]!) > 3) differing++;
      }
    }
    expect(differing).toBe(0);

    drawn.update({ rings: effectShape('cone', CELL, CENTRE).rings });
    expect(drawn.view.children[0]).not.toBe(piece);
    picture([drawn], grey);
    expect(managed()).toBe(before + 1);

    drawn.update({ color: '#e93147', effect: 'shadow' });
    expect(drawn.view.children).toHaveLength(1);
    drawn.destroy();
    expect(drawn.view.destroyed).toBe(true);
    expect(managed()).toBe(before);
  });
});
