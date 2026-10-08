import '../setup/obsidianDom';
import { Container, GraphicsContext, Rectangle, Sprite, Texture, WebGLRenderer, type Application, type Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { describe, expect, it, vi } from 'vitest';
import { GridSystem, type GridType } from '../../src/app/grid/GridSystem';
import { drawHexGrid } from '../../src/app/grid/hexGridDrawer';
import { createHexLayout, hexCellExtent, isHexGridType } from '../../src/app/grid/hexGeometry';
import { drawSquareGrid } from '../../src/app/grid/squareGridDrawer';
import type { GridBounds, GridLineType, GridPath } from '../../src/app/grid/gridLineStyle';
import { captureBeforeRender } from '../../src/app/pixi/playerSafeFrame';

const VIEW = 300;
const MAP = 2048;
/** A cell size the freehand tool or the alignment gives: no whole number, so every line has its own phase. */
const SIZE = 68.49;
const OFFSET = 13.3;
const PAN = { x: 37.3, y: 41.7 };

interface Picture {
  data: Uint8ClampedArray;
  /** Device pixels a side. */
  pixels: number;
  /** World point to device pixel. */
  toDevice(x: number, y: number): { x: number; y: number };
}

interface Expected {
  segments: Array<[number, number, number, number]>;
  markers: Array<{ x: number; y: number }>;
}

/** Where the grid's lines and markers lie in the world, from the drawers GridSystem draws with. */
function expectedGrid(type: GridType, lineType: GridLineType): Expected {
  const layout = isHexGridType(type) ? createHexLayout(type, SIZE, OFFSET, OFFSET) : null;
  const padding = layout ? Math.max(hexCellExtent(layout).width, hexCellExtent(layout).height) : SIZE;
  const bounds: GridBounds = { minX: -padding, minY: -padding, maxX: MAP + padding, maxY: MAP + padding };
  const expected: Expected = { segments: [], markers: [] };
  let cursor = { x: 0, y: 0 };
  const recorder: GridPath = {
    moveTo: (x, y) => { cursor = { x: x + bounds.minX, y: y + bounds.minY }; return recorder; },
    lineTo: (x, y) => {
      const next = { x: x + bounds.minX, y: y + bounds.minY };
      expected.segments.push([cursor.x, cursor.y, next.x, next.y]);
      cursor = next;
      return recorder;
    },
    poly: (points) => {
      let x = 0;
      let y = 0;
      for (let i = 0; i < points.length; i += 2) { x += points[i]!; y += points[i + 1]!; }
      expected.markers.push({ x: x / (points.length / 2) + bounds.minX, y: y / (points.length / 2) + bounds.minY });
      return recorder;
    },
  };
  if (layout) drawHexGrid(recorder, bounds, layout, lineType);
  else drawSquareGrid(recorder, bounds, SIZE, OFFSET, OFFSET, lineType);
  return expected;
}

/** Whether a pixel within one device pixel of `at` shows ink on the white map. */
function inked(picture: Picture, at: { x: number; y: number }): boolean | null {
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  if (x < 2 || y < 2 || x > picture.pixels - 3 || y > picture.pixels - 3) return null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (picture.data[((y + dy) * picture.pixels + x + dx) * 4]! < 250) return true;
    }
  }
  return false;
}

/** The darkest red value of a picture of black lines on a white map. */
function darkest({ data }: Picture): number {
  let value = 255;
  for (let i = 0; i < data.length; i += 4) value = Math.min(value, data[i]!);
  return value;
}

const onMap = (x: number, y: number): boolean => x > 1 && y > 1 && x < MAP - 1 && y < MAP - 1;

/** Places along the expected lines (every device pixel, away from their ends) and markers that show no ink. */
function gaps(picture: Picture, expected: Expected): string[] {
  const found: string[] = [];
  for (const [x1, y1, x2, y2] of expected.segments) {
    const a = picture.toDevice(x1, y1);
    const b = picture.toDevice(x2, y2);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let along = 1.5; along <= length - 1.5; along++) {
      const t = along / length;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (onMap(x, y) && inked(picture, picture.toDevice(x, y)) === false) found.push(`line at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
  }
  for (const { x, y } of expected.markers) {
    if (onMap(x, y) && inked(picture, picture.toDevice(x, y)) === false) found.push(`marker at (${x.toFixed(1)}, ${y.toFixed(1)})`);
  }
  return found;
}

function plainMap(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, MAP, MAP);
  return Texture.from(canvas);
}

interface Scene {
  renderer: WebGLRenderer;
  stage: Container;
  viewport: Viewport;
  grid: GridSystem;
  lines(): Graphics;
  /** Renders the stage onto the canvas, as the map view does, and reads it back. */
  render(): Picture;
  destroy(): void;
}

/** A map view without samples, as the plain back buffer at resolution 2 or a device without MSAA renders. */
async function scene(resolution: number, type: GridType, lineType: GridLineType): Promise<Scene> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: VIEW, height: VIEW, antialias: false, background: 0xffffff, resolution, preserveDrawingBuffer: true });
  const stage = new Container();
  const viewport = stage.addChild(new Viewport({ screenWidth: VIEW, screenHeight: VIEW, worldWidth: MAP, worldHeight: MAP, events: renderer.events }));
  const map = viewport.addChild(new Sprite(plainMap()));
  const grid = new GridSystem({ renderer } as unknown as Application, viewport, map, {
    type, size: SIZE, offsetX: OFFSET, offsetY: OFFSET, color: 0x000000, alpha: 1, lineWidth: 1, lineType,
  });
  return {
    renderer, stage, viewport, grid,
    lines: () => grid.getGridSprite()!.getChildByLabel('grid-lines') as Graphics,
    render: () => {
      renderer.render(stage);
      const { resolution } = renderer;
      const pixels = Math.round(VIEW * resolution);
      const context = new OffscreenCanvas(pixels, pixels).getContext('2d')!;
      context.drawImage(renderer.canvas, 0, 0);
      const { x, y } = viewport.position;
      const scale = viewport.scale.x;
      return {
        data: context.getImageData(0, 0, pixels, pixels).data,
        pixels,
        toDevice: (worldX, worldY) => ({ x: (worldX * scale + x) * resolution, y: (worldY * scale + y) * resolution }),
      };
    },
    destroy: () => {
      grid.destroy();
      viewport.destroy();
      renderer.destroy();
    },
  };
}

/** Sets the zoom the way pixi-viewport's `setZoom` does: no `zoomed` event. */
function zoomTo(viewport: Viewport, scale: number): void {
  viewport.setZoom(scale);
  viewport.position.set(-PAN.x * scale, -PAN.y * scale);
}

/**
 * A grid line one map pixel wide is thinner than a device pixel once the map is zoomed out.
 * Drawn without samples such a line fell between pixel centres, and with a cell size that is no
 * whole number some lines vanished at one zoom and others at the next.
 */
describe('grid lines thinner than a pixel', () => {
  const grids: GridType[] = ['square', 'hex-vertical', 'hex-horizontal'];
  const styles: GridLineType[] = ['solid', 'dashed', 'dotted'];
  for (const type of grids) {
    for (const lineType of styles) {
      for (const resolution of [1, 1.5, 2]) {
        it(`show along their whole length at every zoom: ${type}, ${lineType}, resolution ${resolution}`, async () => {
          const view = await scene(resolution, type, lineType);
          const expected = expectedGrid(type, lineType);
          const zoomed = vi.fn();
          view.viewport.on('zoomed', zoomed);
          const found: string[] = [];
          try {
            for (let scale = 0.25; scale <= 3; scale += 0.0731) {
              zoomTo(view.viewport, scale);
              const missing = gaps(view.render(), expected);
              if (missing.length > 0) found.push(`zoom ${scale.toFixed(3)}: ${missing.length} gaps, first ${missing[0]}`);
            }
            expect(zoomed).not.toHaveBeenCalled();
            expect(found).toEqual([]);
          } finally {
            view.destroy();
          }
        });
      }
    }
  }

  it('are drawn once while the map is zoomed out, frame by frame', async () => {
    const stroke = vi.spyOn(GraphicsContext.prototype, 'stroke');
    const fill = vi.spyOn(GraphicsContext.prototype, 'fill');
    try {
      for (const lineType of ['solid', 'dotted'] as const) {
        const view = await scene(2, 'hex-vertical', lineType);
        try {
          zoomTo(view.viewport, 0.5);
          view.render();
          stroke.mockClear();
          fill.mockClear();
          const contexts = new Set([view.lines().context]);
          for (let scale = 0.5; scale > 0.1; scale *= 0.973) {
            zoomTo(view.viewport, scale);
            view.renderer.render(view.stage);
            contexts.add(view.lines().context);
          }
          // From one device pixel to a fifth: one hairline drawing, or markers 2, 4 and 8 map pixels thick
          const drawings = lineType === 'solid' ? 1 : 3;
          expect(stroke.mock.calls.length + fill.mock.calls.length).toBe(drawings);
          expect(contexts.size).toBe(drawings + 1);
        } finally {
          view.destroy();
        }
      }
    } finally {
      stroke.mockRestore();
      fill.mockRestore();
    }
  });

  it('are drawn for the player frame from its own camera, and for the GM from theirs', async () => {
    const view = await scene(2, 'square', 'solid');
    const expected = expectedGrid('square', 'solid');
    try {
      zoomTo(view.viewport, 0.1);
      view.render();
      const camera = { centerX: 600, centerY: 500, scale: 1 };
      const players: Picture[] = [];
      captureBeforeRender([], () => undefined, () => players.push(view.render()), { target: view.viewport, camera, screen: { width: VIEW, height: VIEW } });
      const gm = view.render();

      // The players see the lines at their zoom: two device pixels of full black
      expect(gaps(players[0]!, expected)).toEqual([]);
      expect(darkest(players[0]!)).toBeLessThan(10);
      // The GM, zoomed far out, sees one device pixel a fifth as dark (two where lines cross)
      expect(gaps(gm, expected)).toEqual([]);
      expect(darkest(gm)).toBeGreaterThan(150);
      expect(darkest(gm)).toBeLessThan(230);
    } finally {
      view.destroy();
    }
  });

  it('follow a change of the display pixel ratio', async () => {
    const view = await scene(1, 'square', 'solid');
    const expected = expectedGrid('square', 'solid');
    try {
      zoomTo(view.viewport, 0.4);
      view.render();
      expect(view.lines().alpha).toBeCloseTo(0.4);
      view.renderer.resize(VIEW, VIEW, 2);
      expect(gaps(view.render(), expected)).toEqual([]);
      expect(view.lines().alpha).toBeCloseTo(0.8);
    } finally {
      view.destroy();
    }
  });

  it('show in a thumbnail rendered at a fraction of the map size, whatever the GM zoom', async () => {
    const view = await scene(2, 'hex-horizontal', 'solid');
    const expected = expectedGrid('hex-horizontal', 'solid');
    try {
      zoomTo(view.viewport, 2);
      view.render();
      const resolution = 0.25;
      const texture = view.renderer.generateTexture({ target: view.viewport, frame: new Rectangle(0, 0, MAP, MAP), resolution });
      const { pixels } = view.renderer.extract.pixels({ target: texture });
      const side = MAP * resolution;
      const thumbnail: Picture = { data: pixels, pixels: side, toDevice: (x, y) => ({ x: x * resolution, y: y * resolution }) };
      expect(gaps(thumbnail, expected)).toEqual([]);
      // As faint as the map is small: a quarter of the line's ink (two where edges meet), not full black
      expect(darkest(thumbnail)).toBeGreaterThan(120);
      texture.destroy(true);
    } finally {
      view.destroy();
    }
  });
});
