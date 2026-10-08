import { describe, expect, it } from 'vitest';
import { frozenView, type FrozenFrame, type FrozenView, type Screen, type Size } from '../../src/app/services/frozenPlayerFrame';
import type { PlayerCameraState } from '../../src/app/types/playerCamera';

const CAMERA: PlayerCameraState = { centerX: 1000, centerY: 500, scale: 2 };

function screenOf(width: number, height: number, resolution = 1): Screen {
  return { width, height, resolution };
}

/** The canvas PIXI gives a screen: whole pixels, rounded per side. */
function canvasOf(screen: Screen): Size {
  return { width: Math.round(screen.width * screen.resolution), height: Math.round(screen.height * screen.resolution) };
}

function frozenOn(screen: Screen): FrozenFrame {
  return { camera: CAMERA, screen, pixels: canvasOf(screen) };
}

/** The canvas pixel at which a screen draws the world coordinate `world`, along a side `side` long, through a camera centred on `centre`. */
function pixelOf(world: number, centre: number, scale: number, side: number, resolution: number): number {
  return resolution * (side / 2 + (world - centre) * scale);
}

/** Where in its part, in canvas pixels, a view draws the left and top edge of what players were frozen on. */
function frozenCorner(view: FrozenView, frozen: FrozenFrame, screen: Screen): { x: number; y: number } {
  const left = CAMERA.centerX - frozen.screen.width / 2 / CAMERA.scale;
  const top = CAMERA.centerY - frozen.screen.height / 2 / CAMERA.scale;
  return {
    x: pixelOf(left, view.camera.centerX, view.camera.scale, screen.width, screen.resolution) - view.part.x,
    y: pixelOf(top, view.camera.centerY, view.camera.scale, screen.height, screen.resolution) - view.part.y,
  };
}

/** The world a view shows players, by its camera and the part of the canvas it copies. */
function shownWorld(view: FrozenView, screen: Screen): { left: number; top: number; right: number; bottom: number } {
  const { camera, part } = view;
  const perPixel = 1 / screen.resolution / camera.scale;
  const left = camera.centerX + part.x * perPixel - screen.width / 2 / camera.scale;
  const top = camera.centerY + part.y * perPixel - screen.height / 2 / camera.scale;
  return { left, top, right: left + part.width * perPixel, bottom: top + part.height * perPixel };
}

describe('frozenView', () => {
  it('is the canvas as it is while the screen is the one players were frozen on', () => {
    const screen = screenOf(800, 600);
    expect(frozenView(frozenOn(screen), screen, canvasOf(screen))).toBeUndefined();
  });

  it('copies the middle of a screen that grew, through the same camera', () => {
    const frozen = frozenOn(screenOf(800, 600));
    const screen = screenOf(1000, 700);

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.camera).toBe(CAMERA);
    expect(view.part).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    expect(view.size).toEqual({ width: 800, height: 600 });
  });

  it('counts in the pixels of the canvas', () => {
    const frozen = frozenOn(screenOf(800, 600, 2));
    const screen = screenOf(1000, 600, 2);

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.part).toEqual({ x: 200, y: 0, width: 1600, height: 1200 });
    expect(view.size).toEqual({ width: 1600, height: 1200 });
  });

  it('moves the camera by the half pixel a part cannot lie at', () => {
    const frozen = frozenOn(screenOf(800, 600));
    const screen = screenOf(901, 600);

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.part).toEqual({ x: 51, y: 0, width: 800, height: 600 });
    // The part lies half a pixel right of the middle, which at scale 2 is a quarter of a world pixel
    expect(view.camera).toEqual({ centerX: 999.75, centerY: 500, scale: 2 });
  });

  it('copies as many pixels as players were frozen on where a screen has no whole number of them', () => {
    // 614 points are 767.5 pixels, which PIXI makes 768; 621 are 776.25, which it makes 776
    const frozen = frozenOn(screenOf(614, 437, 1.25));
    const screen = screenOf(621, 437, 1.25);

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.part).toEqual({ x: 4, y: 0, width: 768, height: 546 });
    expect(view.size).toEqual({ width: 768, height: 546 });
  });

  it('copies a screen that only grew pixel for pixel, at every pixel ratio', () => {
    for (const resolution of [1, 1.25, 1.5, 1.75, 2]) {
      for (let width = 600; width < 640; width++) {
        const frozen = frozenOn(screenOf(width, 437, resolution));
        for (let grown = 1; grown <= 40; grown++) {
          const screen = screenOf(width + grown, 437 + grown % 7, resolution);
          const view = frozenView(frozen, screen, canvasOf(screen))!;
          const where = `${width} to ${screen.width} × ${screen.height} at ${resolution}`;

          // No pixel is stretched: the part is as large as the players' canvas
          expect({ width: view.part.width, height: view.part.height }, where).toEqual(frozen.pixels);
          // No pixel is shifted: the frozen frame begins on the part's first pixel
          const corner = frozenCorner(view, frozen, screen);
          expect(Math.abs(corner.x), where).toBeLessThan(1e-9);
          expect(Math.abs(corner.y), where).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('zooms out on a screen that became too small, and copies what was frozen from it', () => {
    const frozen = frozenOn(screenOf(800, 600));
    const screen = screenOf(400, 600);

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.camera).toEqual({ centerX: 1000, centerY: 500, scale: 1 });
    expect(view.part).toEqual({ x: 0, y: 150, width: 400, height: 300 });
    expect(view.size).toEqual({ width: 800, height: 600 });
  });

  it('shows the same world on every screen', () => {
    const world = { left: 800, top: 350, right: 1200, bottom: 650 };
    const sizes: [number, number][] = [[1000, 600], [801, 600], [800, 933], [1777, 1111], [640, 600], [800, 211], [333, 977], [123, 77]];

    for (const resolution of [1, 1.25, 2]) {
      const frozen = frozenOn(screenOf(800, 600, resolution));
      for (const [width, height] of sizes) {
        const screen = screenOf(width, height, resolution);
        const shown = shownWorld(frozenView(frozen, screen, canvasOf(screen))!, screen);
        // Within a pixel of the smaller of the two canvases
        const tolerance = Math.max(frozen.screen.width / width, frozen.screen.height / height, 1) / resolution / CAMERA.scale;
        for (const side of ['left', 'top', 'right', 'bottom'] as const) {
          expect(Math.abs(shown[side] - world[side]), `${side} at ${width} × ${height}, resolution ${resolution}`).toBeLessThanOrEqual(tolerance);
        }
      }
    }
  });
});
