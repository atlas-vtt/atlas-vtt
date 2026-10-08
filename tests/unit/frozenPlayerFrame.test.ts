import { describe, expect, it } from 'vitest';
import { frozenView, type FrozenFrame, type FrozenView, type Size } from '../../src/app/services/frozenPlayerFrame';
import type { PlayerCameraState } from '../../src/app/types/playerCamera';

const CAMERA: PlayerCameraState = { centerX: 1000, centerY: 500, scale: 2 };

function frozenOn(screen: Size, resolution = 1): FrozenFrame {
  return { camera: CAMERA, screen, pixels: canvasOf(screen, resolution) };
}

function canvasOf(screen: Size, resolution = 1): Size {
  return { width: Math.round(screen.width * resolution), height: Math.round(screen.height * resolution) };
}

/** The world a view shows players, by its camera and the part of the canvas it copies. */
function shownWorld(view: FrozenView, screen: Size, canvas: Size): { left: number; top: number; right: number; bottom: number } {
  const { camera, part } = view;
  const perPixelX = screen.width / canvas.width / camera.scale;
  const perPixelY = screen.height / canvas.height / camera.scale;
  const left = camera.centerX + (part.x - canvas.width / 2) * perPixelX;
  const top = camera.centerY + (part.y - canvas.height / 2) * perPixelY;
  return { left, top, right: left + part.width * perPixelX, bottom: top + part.height * perPixelY };
}

describe('frozenView', () => {
  it('is the canvas as it is while the screen is the one players were frozen on', () => {
    const screen = { width: 800, height: 600 };
    expect(frozenView(frozenOn(screen), screen, canvasOf(screen))).toBeUndefined();
  });

  it('copies the middle of a screen that grew, through the same camera', () => {
    const frozen = frozenOn({ width: 800, height: 600 });
    const screen = { width: 1000, height: 700 };

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.camera).toBe(CAMERA);
    expect(view.part).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    expect(view.size).toEqual({ width: 800, height: 600 });
  });

  it('counts in the pixels of the canvas', () => {
    const frozen = frozenOn({ width: 800, height: 600 }, 2);
    const screen = { width: 1000, height: 600 };

    const view = frozenView(frozen, screen, canvasOf(screen, 2))!;

    expect(view.part).toEqual({ x: 200, y: 0, width: 1600, height: 1200 });
    expect(view.size).toEqual({ width: 1600, height: 1200 });
  });

  it('moves the camera by the half pixel a part cannot lie at', () => {
    const frozen = frozenOn({ width: 800, height: 600 });
    const screen = { width: 901, height: 600 };

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.part).toEqual({ x: 51, y: 0, width: 800, height: 600 });
    // The part lies half a pixel right of the middle, which at scale 2 is a quarter of a world pixel
    expect(view.camera).toEqual({ centerX: 999.75, centerY: 500, scale: 2 });
  });

  it('zooms out on a screen that became too small, and copies what was frozen from it', () => {
    const frozen = frozenOn({ width: 800, height: 600 });
    const screen = { width: 400, height: 600 };

    const view = frozenView(frozen, screen, canvasOf(screen))!;

    expect(view.camera).toEqual({ centerX: 1000, centerY: 500, scale: 1 });
    expect(view.part).toEqual({ x: 0, y: 150, width: 400, height: 300 });
    expect(view.size).toEqual({ width: 800, height: 600 });
  });

  it('shows the same world on every screen', () => {
    const screen = { width: 800, height: 600 };
    const world = { left: 800, top: 350, right: 1200, bottom: 650 };
    const sizes: [number, number][] = [[1000, 600], [801, 600], [800, 933], [1777, 1111], [640, 600], [800, 211], [333, 977], [123, 77]];

    for (const resolution of [1, 1.25, 2]) {
      for (const [width, height] of sizes) {
        const next = { width, height };
        const canvas = canvasOf(next, resolution);
        const shown = shownWorld(frozenView(frozenOn(screen, resolution), next, canvas)!, next, canvas);
        // Within a pixel of the smaller of the two canvases
        const tolerance = Math.max(screen.width / next.width, screen.height / next.height, 1) / resolution / CAMERA.scale;
        for (const side of ['left', 'top', 'right', 'bottom'] as const) {
          expect(Math.abs(shown[side] - world[side]), `${side} at ${width} × ${height}, resolution ${resolution}`).toBeLessThanOrEqual(tolerance);
        }
      }
    }
  });
});
