import { Application, Graphics, RenderTexture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { fillWithHoles } from '../../src/app/pixi/utils/fillWithHoles';

/**
 * Two areas in one Graphics, the second with two holes: every pixel is filled exactly where an area
 * is and its holes are not. A second `cut()` of the second area also cut its hole out of the first,
 * and earcut filled a wedge between the two (the rooms mode showed rock between rooms as floor).
 */

const [WIDTH, HEIGHT] = [640, 320];
const square = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];
const FIRST = square(10, 10, 110, 310);
const SECOND = square(300, 10, 630, 310);
const HOLES = [square(340, 40, 400, 100), square(450, 150, 600, 280)];
const inside = (x: number, y: number, [x0, y0, x1, , , y1]: number[]): boolean => x > x0! && x < x1! && y > y0! && y < y1!;
const expected = (x: number, y: number): boolean => inside(x, y, FIRST) || (inside(x, y, SECOND) && !HOLES.some((hole) => inside(x, y, hole)));

let app: Application | undefined;
afterEach(() => app?.destroy(true, { children: true }));

async function wrongPixels(draw: (graphics: Graphics) => void): Promise<number> {
  app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000 });
  const graphics = new Graphics();
  draw(graphics);
  app.stage.addChild(graphics);
  const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
  app.renderer.render({ container: app.stage, target, clear: true });
  const { pixels } = app.renderer.extract.pixels({ target });
  target.destroy(true);
  let wrong = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      // A pixel's centre, away from the edges, where rasterising may go either way.
      const [cx, cy] = [x + 0.5, y + 0.5];
      const near = [FIRST, SECOND, ...HOLES].some(([x0, y0, x1, , , y1]) => Math.min(Math.abs(cx - x0!), Math.abs(cx - x1!), Math.abs(cy - y0!), Math.abs(cy - y1!)) < 1.5);
      if (!near && (pixels[(y * WIDTH + x) * 4]! > 128) !== expected(cx, cy)) wrong++;
    }
  }
  return wrong;
}

describe('fillWithHoles', () => {
  it('cuts the holes out of their own area alone', async () => {
    expect(await wrongPixels((graphics) => {
      fillWithHoles(graphics, FIRST, [], { color: 0xffffff });
      fillWithHoles(graphics, SECOND, HOLES, { color: 0xffffff });
    })).toBe(0);
  });

  it('(control) a cut of each hole of its own fills more than the areas', async () => {
    expect(await wrongPixels((graphics) => {
      graphics.poly(FIRST).fill({ color: 0xffffff });
      graphics.poly(SECOND).fill({ color: 0xffffff });
      for (const hole of HOLES) graphics.poly(hole).cut();
    })).toBeGreaterThan(0);
  });
});
