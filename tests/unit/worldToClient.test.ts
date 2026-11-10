import { expect, it } from 'vitest';
import type { Viewport } from 'pixi-viewport';
import { viewCentreInClient, worldToClient } from '../../src/app/pixi/utils/worldToClient';

/** A view at zoom 2 whose canvas starts 300 px into the window, as beside an open sidebar. */
const viewport = {
  screenWidth: 800,
  screenHeight: 600,
  toScreen: (x: number, y: number) => ({ x: x * 2, y: y * 2 }),
} as unknown as Viewport;
const canvas = { getBoundingClientRect: () => ({ left: 300, top: 40 }) } as HTMLCanvasElement;

it('places a world point in the window by where its canvas lies', () => {
  expect(worldToClient(viewport, canvas, 50, 100)).toEqual({ x: 400, y: 240 });
});

it('places the middle of the view in the window by where its canvas lies', () => {
  expect(viewCentreInClient(viewport, canvas)).toEqual({ x: 700, y: 340 });
});

it('takes the canvas for the window\'s corner while there is none', () => {
  expect(worldToClient(viewport, null, 50, 100)).toEqual({ x: 100, y: 200 });
});
