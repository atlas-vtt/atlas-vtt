import '../setup/obsidianDom';
import { Container, Graphics, GraphicsContext, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { gridMarkerArmLength, type GridBounds, type GridLineType } from '../../src/app/grid/gridLineStyle';
import { applyGridMark, createMarkBacking } from '../../src/app/grid/gridLightingMark';
import { createHexLayout, isHexGridType } from '../../src/app/grid/hexGeometry';
import { drawHexGrid } from '../../src/app/grid/hexGridDrawer';
import { GridMesh } from '../../src/app/grid/shader/GridMesh';
import { drawSquareGrid } from '../../src/app/grid/squareGridDrawer';
import type { GridType } from '../../src/app/grid/GridSystem';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';

/**
 * The grid shader draws what the Graphics drawers draw: the same lines, dashes and markers at the
 * same places, for every grid type and style, at several zooms, and erases the scene's alpha the same
 * way while the lighting marks the grid. The drawers, which grid detection reads the lattice from, are the oracle.
 */

const SIZE = 384;
const CELL = 61.7;
const OFFSET = { x: 9.3, y: 21.1 };
const GRIDS: GridType[] = ['square', 'hex-vertical', 'hex-horizontal'];
const STYLES: GridLineType[] = ['solid', 'dashed', 'dotted'];

interface Picture {
  /** Alpha of each pixel, 0..255, in reading order. */
  alpha: Uint8Array;
}

function alphaOf(renderer: WebGLRenderer, root: Container): Picture {
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  renderer.render({ container: root, target, clear: true, clearColor: [0, 0, 0, 0] });
  const pixels = readRgba(renderer, target);
  target.destroy(true);
  const alpha = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]!;
  return { alpha };
}

/** The world the picture shows: `zoom` map pixels per device pixel, panned so the grid's phase is no whole number of pixels. */
function placed(child: Container, zoom: number): Container {
  const root = new Container();
  child.position.set(-37.3 * zoom, -41.7 * zoom);
  child.scale.set(zoom);
  root.addChild(child);
  return root;
}

const WORLD = 1200;
const bounds: GridBounds = { minX: 0, minY: 0, maxX: WORLD, maxY: WORLD };

/**
 * The oracle: the lattice traced by the drawers grid detection reads it from (`gridTemplate.ts`),
 * stroked or filled as the Graphics grid was drawn before the shader (strokes centred on the
 * lattice, round caps; markers filled).
 */
function graphicsGrid(type: GridType, lineType: GridLineType, lineWidth: number): Container {
  const layout = isHexGridType(type) ? createHexLayout(type, CELL, OFFSET.x, OFFSET.y) : null;
  const arm = gridMarkerArmLength(CELL);
  const context = new GraphicsContext();
  if (layout) drawHexGrid(context, bounds, layout, lineType, lineWidth, arm);
  else drawSquareGrid(context, bounds, CELL, OFFSET.x, OFFSET.y, lineType, lineWidth, arm);
  if (lineType === 'dotted') context.fill({ color: 0xffffff, alpha: 1 });
  else context.stroke({ width: lineWidth, color: 0xffffff, alpha: 1, alignment: 0.5, cap: 'round', join: 'miter' });
  return new Graphics({ context });
}

function shaderGrid(type: GridType, lineType: GridLineType, lineWidth: number): GridMesh {
  return new GridMesh(bounds, { kind: type, cell: CELL, offsetX: OFFSET.x, offsetY: OFFSET.y, lineType, lineWidth, markerArm: gridMarkerArmLength(CELL), color: 0xffffff, alpha: 1 });
}

/** Pixels inked (alpha over `threshold`) in one picture with no inked pixel within a pixel in the other. */
function strays(a: Picture, b: Picture, threshold: number): number {
  let count = 0;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (a.alpha[y * SIZE + x]! <= threshold) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (b.alpha[(y + dy) * SIZE + x + dx]! > threshold) { near = true; break; }
      if (!near) count++;
    }
  }
  return count;
}

function inkOf(picture: Picture): number {
  let sum = 0;
  for (const a of picture.alpha) sum += a;
  return sum / 255;
}

describe('the grid shader against the Graphics drawers', () => {
  let renderer: WebGLRenderer;
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<void> {
    renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
  }

  for (const type of GRIDS) {
    for (const lineType of STYLES) {
      it(`draws the same ${lineType} ${type} grid, at every zoom`, async () => {
        await setup();
        for (const zoom of [0.5, 1, 2.3]) {
          // Two map pixels wide: wider than a device pixel at every zoom here, so both draw the lines as set.
          const graphics = alphaOf(renderer, placed(graphicsGrid(type, lineType, 2), zoom));
          const mesh = shaderGrid(type, lineType, 2);
          const shader = alphaOf(renderer, placed(mesh.view, zoom));
          mesh.destroy();
          // Every inked pixel of one has ink within a pixel in the other
          expect({ zoom, strays: strays(shader, graphics, 64) + strays(graphics, shader, 64) }).toEqual({ zoom, strays: 0 });
          // and they lay down about the same ink: the drawers' corners and caps differ from the shader's by a pixel here and there.
          const ratio = inkOf(shader) / inkOf(graphics);
          expect({ zoom, ratio }).toEqual({ zoom, ratio: expect.closeTo(1, 0) });
          expect(ratio).toBeGreaterThan(0.85);
          expect(ratio).toBeLessThan(1.15);
        }
      });
    }
  }

  it('draws a line thinner than a device pixel one pixel wide and as much fainter', async () => {
    await setup();
    const mesh = shaderGrid('square', 'solid', 1);
    const picture = alphaOf(renderer, placed(mesh.view, 0.25));
    mesh.destroy();
    // A quarter pixel wide: a quarter of the ink, spread over a pixel or two
    let max = 0;
    let inked = 0;
    for (const a of picture.alpha) {
      max = Math.max(max, a);
      if (a > 8) inked++;
    }
    expect(max).toBeGreaterThan(255 * 0.25 - 4);
    // Where two lines cross the ink adds up, never past half
    expect(max).toBeLessThan(255 * 0.5 + 4);
    // Lines a quarter cell apart on screen: about 2 × (384 / 15.4) lines of 384 pixels, each one or two pixels wide
    expect(inked).toBeGreaterThan(2 * 24 * SIZE * 0.9);
    expect(inked).toBeLessThan(2 * 24 * SIZE * 2.2);
  });

  it('erases the alpha under its lines while the lighting marks the grid, as the Graphics grid does', async () => {
    await setup();
    for (const lineType of STYLES) {
      const pictures = [graphicsGrid('hex-vertical', lineType, 2), shaderGrid('hex-vertical', lineType, 2).view].map((lines) => {
        const grid = new Container({ label: 'grid' });
        const backing = createMarkBacking(0, 0, WORLD, WORLD);
        grid.addChild(backing, lines);
        applyGridMark(grid, backing, true);
        const floor = new Graphics().rect(0, 0, SIZE, SIZE).fill({ color: 0x808080, alpha: 1 });
        const root = new Container();
        root.addChild(floor, placed(grid, 1));
        return alphaOf(renderer, root);
      });
      const [graphics, shader] = pictures as [Picture, Picture];
      // Alpha is missing exactly under the lines, in both
      const missing = (p: Picture): number => p.alpha.reduce((n, a) => n + (a < 128 ? 1 : 0), 0);
      expect(missing(shader)).toBeGreaterThan(SIZE * 4);
      const erased = (p: Picture): Picture => ({ alpha: p.alpha.map((a) => 255 - a) });
      expect({ lineType, strays: strays(erased(shader), erased(graphics), 64) + strays(erased(graphics), erased(shader), 64) }).toEqual({ lineType, strays: 0 });
    }
  });
});
