// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { CellNumberLabels, type CellNumberView } from '../../src/app/grid/cellNumberLabels';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
});

const MAP = { x: 0, y: 0, width: 100_000, height: 100_000 };

/** Labels for a 100,000 px map of 100 px cells (a million cells), drawn with the map at the grid container's origin. */
function labels(view: CellNumberView): CellNumberLabels {
  restoreGraphics = stubJsdomGraphics();
  return new CellNumberLabels({ lattice: squareLattice(100, 0, 0), map: MAP, format: 'sequential' }, { x: 0, y: 0 }, { color: 0xffffff, opacity: 1 }, view);
}

function shown(numbers: CellNumberLabels): readonly string[] {
  return numbers.labels;
}

const view = (x: number, y: number, zoom = 1): CellNumberView => ({ zoom, pixelRatio: 1, world: { x, y, width: 1000, height: 500 } });

it('labels only the cells in the view and a margin of its longer side around it, numbered as on the whole map', () => {
  const numbers = labels(view(50_000, 50_000));
  // 3,000 × 2,500 world pixels around the view: 30 × 25 cells of the map's million.
  expect(shown(numbers)).toHaveLength(30 * 25);
  // Cell (490, 490) is the 490,491st in reading order of a map 1,000 cells wide.
  expect(shown(numbers)).toContain('490491');
});

it('keeps the labels while the view stays inside what they were made for, and lays them out again past it', () => {
  const numbers = labels(view(50_000, 50_000));
  const first = shown(numbers);
  numbers.setView(view(50_400, 50_300));
  expect(shown(numbers)).toEqual(first);

  numbers.setView(view(52_500, 50_000));
  // Half of the cells stayed in reach; all are drawn as one mesh of glyph quads.
  expect(shown(numbers)).toHaveLength(30 * 25);
  expect(numbers.container.children).toHaveLength(1);
  expect(shown(numbers).filter((label) => first.includes(label)).length).toBeGreaterThan(0);
});

it('shows none while the numbers are too small to read, and again once zoomed in', () => {
  const numbers = labels(view(50_000, 50_000));
  numbers.setView(view(50_000, 50_000, 0.3));
  expect(shown(numbers)).toEqual([]);
  numbers.setView(view(50_000, 50_000));
  expect(shown(numbers)).toHaveLength(30 * 25);
});

it('shows none where the view alone holds more cells than it may label, and narrows the margin before that', () => {
  const numbers = labels({ zoom: 1, pixelRatio: 1, world: { x: 0, y: 0, width: 20_000, height: 20_000 } });
  expect(shown(numbers)).toEqual([]);
  // 80 × 80 cells in view: no room for a margin of the view's side, a quarter of it fits.
  numbers.setView({ zoom: 1, pixelRatio: 1, world: { x: 40_000, y: 40_000, width: 8_000, height: 8_000 } });
  expect(shown(numbers)).toHaveLength(120 * 120);
});
