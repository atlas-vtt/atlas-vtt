import { afterEach, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';

/** Settings an older Atlas saved, with its own grid switch for players: no longer read. */
const OLD_SETTINGS = { showGrid: true, showTokenNameplates: true } as never;

const grids: GridSystem[] = [];
afterEach(() => {
  grids.splice(0).forEach((grid) => grid.destroy());
  vi.useRealTimers();
});

/** A map with its grid, and the orchestrator with only what a player frame reads. */
function mapWithGrid(enabled: boolean): { grid: GridSystem; renderer: PixiRendererOrchestrator } {
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE); background.width = 500; background.height = 500;
  viewport.addChild(background);
  const grid = new GridSystem({ renderer: { resolution: 1 } } as never, viewport as never, background, { size: 70, enabled, color: 0xff0000 });
  grids.push(grid);
  const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: () => null },
    gridSystem: grid,
    tokenRenderer: { getPlayerViewLayers: () => [] },
    dmScreenOverlays: new Set(),
  });
  return { grid, renderer };
}

/** Whether the players' frame shows the grid, and the grid it shows. */
function playersSee(renderer: PixiRendererOrchestrator, grid: GridSystem, settings = OLD_SETTINGS): { shown: boolean; sprite: Container | null } {
  let seen = { shown: false, sprite: null as Container | null };
  renderer.withPlayerSafeFrame(() => {
    const sprite = grid.getGridSprite();
    seen = { shown: sprite?.visible === true, sprite };
  }, settings);
  return seen;
}

it('shows players no grid while the GM hides it, whatever an older player view switch says', () => {
  const { grid, renderer } = mapWithGrid(false);
  expect(playersSee(renderer, grid).shown).toBe(false);
  expect(grid.getGridSprite()?.visible).toBe(false);
});

it('shows players the grid while the GM shows it, also where an older switch hid it for them', () => {
  const { grid, renderer } = mapWithGrid(true);
  expect(playersSee(renderer, grid, { showGrid: false, showTokenNameplates: true } as never).shown).toBe(true);
});

it('follows the GM switching the grid and changing its look', () => {
  vi.useFakeTimers();
  const { grid, renderer } = mapWithGrid(true);
  grid.setEnabled(false);
  expect(playersSee(renderer, grid).shown).toBe(false);

  grid.setEnabled(true);
  grid.updateOptions({ color: 0x00ff00, alpha: 0.4, lineType: 'dashed' });
  vi.runAllTimers();
  const { shown, sprite } = playersSee(renderer, grid);
  expect(shown).toBe(true);
  // The players' frame draws the GM's own grid, so it has the GM's look
  expect(sprite).toBe(grid.getGridSprite());
  expect(grid.getOptions()).toMatchObject({ color: 0x00ff00, alpha: 0.4, lineType: 'dashed' });
});
