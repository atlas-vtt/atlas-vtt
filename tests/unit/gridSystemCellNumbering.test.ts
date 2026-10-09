import { afterEach, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { fakeMapImageView, settleGridColor } from '../helpers/fakeMapImageView';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

it('builds a cell-numbers container with one label per cell on a square grid', async () => {
  restoreGraphics = stubJsdomGraphics();
  const viewport = new Container();
  const map = fakeMapImageView(200, 200);
  viewport.addChild(map.layer);
  const app = { renderer: { resolution: 1 } } as never;
  const grid = new GridSystem(app, viewport as never, map, {
    type: 'square',
    size: 100,
    cellNumbers: { format: 'column-row', opacity: 0.8 },
  });
  try {
    await settleGridColor();
    const sprite = grid.getGridSprite();
    const numbers = sprite!.children.find((child) => child.label === 'cell-numbers');
    expect(numbers).toBeDefined();
    expect(numbers!.children).toHaveLength(4);
  } finally { grid.destroy(); }
});
