import '../setup/obsidianDom';
import { BitmapText, Container, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, expect, it } from 'vitest';
import { CellNumberLabels, cellNumberFontFamilyForTest, type CellNumberView } from '../../src/app/grid/cellNumberLabels';
import { cellNumberAnchor, cellNumberFontSize } from '../../src/app/grid/cellNumbering';
import { numberCellsInRect } from '../../src/app/grid/cellNumbersInRect';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';

/**
 * What the frame costs in which a numbered grid's labels first appear: the readable threshold is the
 * zoom at which the view holds the most cells, and every label of the view and its margin is made then.
 * Prints the cost; holds it to one frame.
 */

let renderer: WebGLRenderer | undefined;
afterEach(() => { renderer?.destroy(); renderer = undefined; });

const CELL = 70;
const MAP = { x: 0, y: 0, width: 20_000, height: 20_000 };
/** The zoom at which 11.2 px numbers reach 7 CSS px: the threshold. */
const ZOOM = 7.2 / (0.16 * CELL);

function view(width: number, height: number): CellNumberView {
  return { zoom: ZOOM, pixelRatio: 2, world: { x: 5000, y: 5000, width: width / ZOOM, height: height / ZOOM } };
}

it('the frame in which the numbers of a 2560 × 1440 view appear stays under a frame', async () => {
  renderer = await createTestRenderer(256, 1);
  const root = new Container();
  const target = RenderTexture.create({ width: 256, height: 256 });
  // Warm PIXI's pipes and the digit atlas with a tiny view, as a map open for a while has.
  const warm = new CellNumberLabels({ lattice: squareLattice(CELL, 0, 0), map: MAP, format: 'column-row' }, { x: 0, y: 0 }, { color: 0xffffff, opacity: 1 }, view(200, 100));
  root.addChild(warm.container);
  renderer.render({ container: root, target });
  root.removeChild(warm.container);

  const t0 = performance.now();
  const numbers = new CellNumberLabels({ lattice: squareLattice(CELL, 0, 0), map: MAP, format: 'column-row' }, { x: 0, y: 0 }, { color: 0xffffff, opacity: 1 }, view(2560, 1440));
  const t1 = performance.now();
  root.addChild(numbers.container);
  renderer.render({ container: root, target });
  const t2 = performance.now();
  renderer.render({ container: root, target });
  const t3 = performance.now();
  const shown = numbers.labels.length;
  const report = `${shown} labels, lay out ${(t1 - t0).toFixed(1)} ms, first render ${(t2 - t1).toFixed(1)} ms, next render ${(t3 - t2).toFixed(1)} ms`;
  expect(t1 - t0 + (t2 - t1), report).toBeLessThan(16);
});

it('draws each label where a BitmapText with its anchor at the centre draws it', async () => {
  renderer = await createTestRenderer(256, 1);
  const target = RenderTexture.create({ width: 256, height: 256 });
  const lattice = squareLattice(CELL, 0, 0);
  const map = { x: 0, y: 0, width: 4 * CELL, height: 3 * CELL };
  const look: CellNumberView = { zoom: 1, pixelRatio: 1, world: { x: 0, y: 0, width: map.width, height: map.height } };
  const numbers = new CellNumberLabels({ lattice, map, format: 'letter-number' }, { x: 0, y: 0 }, { color: 0xffffff, opacity: 1 }, look);
  const mesh = new Container();
  mesh.addChild(numbers.container);
  renderer.render({ container: mesh, target, clear: true, clearColor: [0, 0, 0, 1] });
  const drawn = readRgba(renderer, target);

  // The oracle: PIXI's own text objects, in the same font, at the same anchors.
  const fontFamily = cellNumberFontFamilyForTest(numbers.rasterSizeForTest);
  const texts = new Container();
  for (const cell of numberCellsInRect(lattice, map, map, 'letter-number')) {
    const anchor = cellNumberAnchor(CELL, cell.center);
    const text = new BitmapText({ text: cell.label, style: { fontFamily, fontSize: cellNumberFontSize(CELL) } });
    text.anchor.set(0.5);
    text.position.set(anchor.x, anchor.y);
    texts.addChild(text);
  }
  renderer.render({ container: texts, target, clear: true, clearColor: [0, 0, 0, 1] });
  const expected = readRgba(renderer, target);
  let differing = 0;
  let lit = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    if (expected[i]! > 64) lit++;
    if (Math.abs(drawn[i]! - expected[i]!) > 8) differing++;
  }
  expect(lit).toBeGreaterThan(200);
  expect(differing, `${differing} of ${lit} lit pixels differ`).toBe(0);
  target.destroy(true);
});
