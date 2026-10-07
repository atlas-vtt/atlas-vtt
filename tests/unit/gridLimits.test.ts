import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { gridProblem, isDrawableGrid, MAX_GRID_CELLS_PER_SIDE, MIN_GRID_CELL_SIZE } from '../../src/app/grid/gridLimits';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

// The drawers step one cell at a time: with a size of 0 or less they never return. Counting calls instead of drawing
// makes a missing guard fail the test rather than hang it.
const drawn = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/app/grid/squareGridDrawer', () => ({ drawSquareGrid: (): void => { drawn.calls++; } }));
vi.mock('../../src/app/grid/hexGridDrawer', () => ({ drawHexGrid: (): void => { drawn.calls++; } }));

const { GridSystem } = await import('../../src/app/grid/GridSystem');

const grid = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({ enabled: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, ...fields });

let restoreGraphics: (() => void) | undefined;
afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  drawn.calls = 0;
  vi.restoreAllMocks();
});

describe('the limits of a drawable grid', () => {
  it('takes a well-formed grid', () => {
    expect(gridProblem(grid(), { width: 1000, height: 800 })).toBeNull();
    expect(gridProblem(grid({ type: 'hex-vertical', lineType: 'dotted', unitDistanceOverride: 10 }), null)).toBeNull();
    // As Atlas itself saves grids: a collection's own unit, and fields an older file left out.
    expect(gridProblem({ enabled: true, size: 70, unitType: 'custom', measurementType: 'daggerheart' }, { width: 1000, height: 800 })).toBeNull();
  });

  it('refuses sizes that never finish or take millions of steps, unknown kinds, and numbers that are not finite', () => {
    const map = { width: 100_000, height: 1000 };
    const bad = [
      grid({ size: -1 }), grid({ size: 0 }), grid({ size: 0.0001 }), grid({ size: Number.NaN }), grid({ size: Infinity }), grid({ size: '70' }),
      grid({ size: MIN_GRID_CELL_SIZE - 0.5 }), grid({ size: 1 }), grid({ size: 49 }),
      grid({ offsetX: Number.NaN }), grid({ opacity: Infinity }), grid({ lineWidth: Number.NaN }),
      grid({ type: 'triangle' }), grid({ lineType: 'wavy' }), null, [],
      grid({ offsetX: 5.53816e87 }), grid({ offsetY: -100_001 }),
    ];
    for (const value of bad) expect(gridProblem(value, map)).toMatch(/grid/);
    expect(gridProblem(grid({ size: 50 }), map)).toBeNull();
    expect(gridProblem(grid({ size: 50, offsetX: -100_000, offsetY: 100_000 }), map)).toBeNull();
  });

  it(`allows at most ${MAX_GRID_CELLS_PER_SIDE} cells along a side`, () => {
    expect(isDrawableGrid(50, 100_000, 10)).toBe(true);
    expect(isDrawableGrid(49, 100_000, 10)).toBe(false);
    expect(isDrawableGrid(0, 10, 10)).toBe(false);
    expect(isDrawableGrid(-1, 10, 10)).toBe(false);
    expect(isDrawableGrid(Number.NaN, 10, 10)).toBe(false);
  });
});

describe('the grid system with a grid it cannot draw', () => {
  function gridSystem(size: number, type: 'square' | 'hex-vertical' = 'square', side = 1000): { destroy: () => void; sprite: unknown } {
    restoreGraphics = stubJsdomGraphics();
    const viewport = new Container();
    const background = new Sprite(Texture.WHITE);
    background.width = side;
    background.height = side;
    viewport.addChild(background);
    const system = new GridSystem({ renderer: { resolution: 1 } } as never, viewport as never, background, { type, size, lineType: 'dotted' });
    const sprite = system.getGridSprite();
    // The lines are drawn when a render first shows them.
    const lines = sprite?.children.find((child) => child.label === 'grid-lines');
    lines?.onRender?.({ name: 'canvas' } as never);
    return { destroy: () => system.destroy(), sprite };
  }

  it('draws no grid for a size of 0 or less, not a number, or more cells than the limit, instead of hanging', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const [size, type, side] of [[-1, 'square', 1000], [0, 'square', 1000], [Number.NaN, 'hex-vertical', 1000], [0.0001, 'square', 1000], [1, 'square', 100_000]] as const) {
      const system = gridSystem(size, type, side);
      try {
        expect(drawn.calls).toBe(0);
        expect(system.sprite).toBeNull();
      } finally { system.destroy(); }
    }
  });

  it('still draws a grid within the limits', () => {
    const system = gridSystem(70);
    try {
      expect(drawn.calls).toBeGreaterThan(0);
      expect(system.sprite).not.toBeNull();
    } finally { system.destroy(); }
  });
});
