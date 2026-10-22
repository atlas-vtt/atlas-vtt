// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Viewport } from 'pixi-viewport';
import type { EventSystem } from 'pixi.js';
import { READABLE_TOKEN_PX, focusToken, panToToken } from '../../src/app/pixi/tokenFocus';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';

const viewports: Viewport[] = [];

function createViewport(width = 1200, height = 800, worldSize = 4000): Viewport {
  const viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth: worldSize,
    worldHeight: worldSize,
    noTicker: true,
    events: { domElement: createEl('canvas') } as EventSystem,
  });
  viewport.decelerate().clampZoom({ minScale: 0.1, maxScale: 5 });
  viewports.push(viewport);
  return viewport;
}

function finishAnimation(viewport: Viewport): void {
  for (let i = 0; i < 40; i++) viewport.update(16);
}

afterEach(() => {
  viewports.splice(0).forEach(viewport => viewport.destroy());
});

describe('focusToken', () => {
  it.each([
    [1200, 800, 1000, 20, 1],
    [800, 600, 4000, 70, 1],
    [2560, 1440, 16000, 280, 1],
    [800, 600, 16000, 280, 4],
  ])('uses a readable screen size at %ix%i on a %ipx map with grid %i and size %i', (width, height, worldSize, gridSize, size) => {
    const viewport = createViewport(width, height, worldSize);
    const token = { x: worldSize - 10, y: 10, size };
    focusToken(viewport, token, gridSize);
    finishAnimation(viewport);

    expect(computeTokenPixelSize(gridSize, size) * viewport.scale.x).toBeCloseTo(160);
    expect(viewport.center.x).toBeCloseTo(token.x);
    expect(viewport.center.y).toBeCloseTo(token.y);
    // A later resize/zoom clamp must not undo focus outside the original limits.
    viewport.resize(width, height);
    viewport.setZoom(viewport.scale.x);
    expect(computeTokenPixelSize(gridSize, size) * viewport.scale.x).toBeCloseTo(160);
  });

  it.each([[300, 800], [800, 300]])('leaves context around the token in a tiny %ix%i pane', (width, height) => {
    const viewport = createViewport(width, height);
    focusToken(viewport, { x: 500, y: 600, size: 1 }, 70);
    finishAnimation(viewport);
    expect(computeTokenPixelSize(70, 1) * viewport.scale.x).toBeCloseTo(100);
  });

  it('recomputes after resize and gives the same result from different starting zooms', () => {
    const viewport = createViewport();
    const token = { x: 500, y: 600, size: 1 };
    for (const scale of [0.1, 5, 1]) {
      viewport.setZoom(scale);
      focusToken(viewport, token, 70);
      finishAnimation(viewport);
      expect(computeTokenPixelSize(70, 1) * viewport.scale.x).toBeCloseTo(160);
    }
    viewport.resize(300, 800);
    focusToken(viewport, token, 70);
    finishAnimation(viewport);
    expect(computeTokenPixelSize(70, 1) * viewport.scale.x).toBeCloseTo(100);
  });

  it.each([0, -10, NaN, Infinity])('ignores invalid token geometry (%s)', gridSize => {
    const viewport = createViewport();
    focusToken(viewport, { x: 500, y: 600, size: 1 }, gridSize);
    finishAnimation(viewport);
    expect(viewport.scale.x).toBe(1);
  });
});

describe('panToToken, for a click on an initiative card', () => {
  it('brings the token to the middle at the zoom the GM chose', () => {
    const viewport = createViewport();
    viewport.setZoom(0.8);
    panToToken(viewport, { x: 1500, y: 900, size: 1 }, 70);
    finishAnimation(viewport);

    expect(viewport.scale.x).toBeCloseTo(0.8);
    expect(viewport.center.x).toBeCloseTo(1500);
    expect(viewport.center.y).toBeCloseTo(900);
  });

  it('never zooms out of a close look', () => {
    const viewport = createViewport();
    viewport.setZoom(4);
    panToToken(viewport, { x: 500, y: 600, size: 1 }, 70);
    finishAnimation(viewport);
    expect(viewport.scale.x).toBeCloseTo(4);
  });

  it('zooms in only so far that a token too small to make out is shown readable', () => {
    const viewport = createViewport();
    viewport.setZoom(0.1);
    panToToken(viewport, { x: 500, y: 600, size: 1 }, 70);
    finishAnimation(viewport);
    expect(computeTokenPixelSize(70, 1) * viewport.scale.x).toBeCloseTo(READABLE_TOKEN_PX);
  });

  it.each([0, NaN])('keeps the zoom for invalid token geometry (%s)', (gridSize) => {
    const viewport = createViewport();
    viewport.setZoom(0.5);
    panToToken(viewport, { x: 500, y: 600, size: 1 }, gridSize);
    finishAnimation(viewport);
    expect(viewport.scale.x).toBeCloseTo(0.5);
  });
});
