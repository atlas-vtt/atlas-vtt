import '../setup/obsidianDom';
import { Application, EventBoundary, FederatedPointerEvent, RenderTexture, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import type { DrawToolChoices } from '../../src/app/annotations/annotationTypes';
import { CELL_FILL_OPACITY } from '../../src/app/annotations/cellFill';
import { cellGrid } from '../../src/app/annotations/cellGrid';
import { GridSystem, type GridOptions } from '../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout } from '../../src/app/grid/hexGeometry';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { MAP_LAYER_Z } from '../../src/app/pixi/mapLayerOrder';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { DrawingStroke } from '../../src/app/types';
import { mapImageViewOf } from '../helpers/fakeMapImageView';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('events', async () => import('eventemitter3'));

const WIDTH = 560;
const HEIGHT = 420;
const CELL = 70;
/** Set to write pictures of stamps and cell fills under `tests/gpu/out/draw-3-looks/`, to be looked at. */
const LOOKS = Boolean(import.meta.env.VITE_DRAW_LOOKS);
const RED = '#e93147';
const BLUE = '#086ddd';
const YELLOW = '#e0ac00';

type Rgb = [number, number, number];
type GridType = NonNullable<GridOptions['type']>;

interface Scene {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  annotations: AnnotationsRenderer;
  grid: GridSystem;
  tool(choices: Partial<DrawToolChoices>): void;
  drag(path: readonly (readonly [number, number])[]): void;
  /** The pointer over the map at a screen point, as the viewport's dispatch tells the drawings of every move: the cursor they answer. */
  hover(x: number, y: number, alt?: boolean): string | null;
  /** The stage as the GM sees it. */
  picture(): Uint8ClampedArray;
}

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

/** A map-like ground: a paper or stone tone with blotches, walls and hatching drawn on it, so what reads through a fill can be judged. */
function ground(dark: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dark ? '#2b2a2e' : '#e9dfc7';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  let seed = 7;
  const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = dark ? `rgba(${90 + random() * 60}, ${90 + random() * 50}, ${100 + random() * 60}, 0.10)` : `rgba(${120 + random() * 60}, ${95 + random() * 40}, ${50 + random() * 40}, 0.10)`;
    ctx.beginPath();
    ctx.ellipse(random() * WIDTH, random() * HEIGHT, 8 + random() * 34, 6 + random() * 22, random() * Math.PI, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.strokeStyle = dark ? '#c9c2b4' : '#3b2f24';
  ctx.lineWidth = 3;
  ctx.strokeRect(96, 84, 250, 190);
  ctx.strokeRect(346, 150, 150, 124);
  ctx.lineWidth = 1;
  for (let x = 110; x < 340; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 90);
    ctx.lineTo(x - 8, 104);
    ctx.stroke();
  }
  ctx.font = '600 15px Georgia, serif';
  ctx.fillStyle = dark ? '#d8d1c4' : '#3b2f24';
  ctx.fillText('The Sunken Hall', 150, 190);
  return canvas;
}

async function open(type: GridType, options: { dark?: boolean; plain?: number; gridColor?: number; lineWidth?: number } = {}): Promise<Scene> {
  const app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000 });
  const viewport = new Viewport({ screenWidth: WIDTH, screenHeight: HEIGHT, worldWidth: WIDTH, worldHeight: HEIGHT, events: app.renderer.events, ticker: app.ticker });
  viewport.sortableChildren = true;
  app.stage.addChild(viewport);
  const map = new Sprite(options.plain === undefined ? Texture.from(ground(options.dark === true)) : Texture.WHITE);
  if (options.plain !== undefined) map.tint = options.plain;
  map.setSize(WIDTH, HEIGHT);
  map.zIndex = MAP_LAYER_Z.mapImage;
  viewport.addChild(map);
  const grid = new GridSystem(app, viewport, mapImageViewOf(map), { type, size: CELL, enabled: true, color: options.gridColor ?? (options.dark ? 0xffffff : 0x000000), alpha: 0.7, lineWidth: options.lineWidth ?? 1 });
  const store = createViewAtlasStore(createInMemoryApp().app, `cells-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/cells.atlasmap');
  store.setState({ grid: { ...store.getState().grid, enabled: true, visible: true, type, size: CELL, offsetX: 0, offsetY: 0 } });
  const annotations = new AnnotationsRenderer({ viewport, store, grid: () => grid.getOptions(), mapRect: () => ({ x: 0, y: 0, width: WIDTH, height: HEIGHT }) });
  const boundary = new EventBoundary(viewport);
  const pointer = (kind: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void => {
    const event = new FederatedPointerEvent(boundary);
    event.button = 0;
    event.global.set(x, y);
    viewport.emit(kind, event);
  };
  cleanup.push(() => {
    annotations.destroy();
    grid.destroy();
    viewport.destroy();
    app.destroy(true, { children: true });
  });
  return {
    app, viewport, store, annotations, grid,
    tool: (choices) => {
      store.getState().setDrawTool(choices);
      store.getState().setActiveTool('draw');
    },
    drag: (path) => {
      pointer('pointerdown', ...path[0]!);
      for (const [x, y] of path.slice(1)) pointer('pointermove', x, y);
      pointer('pointerup', ...path.at(-1)!);
    },
    hover: (x, y, alt = false) => {
      const world = viewport.toWorld(x, y);
      return annotations.pointer.cursorAt(world.x, world.y, () => false, alt);
    },
    picture: () => {
      // The picture is of the map as it lies: without the frame of what was made last.
      store.getState().clearSelection();
      app.ticker.update();
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
      const { pixels } = app.renderer.extract.pixels({ target });
      target.destroy(true);
      return pixels;
    },
  };
}

const at = (pixels: Uint8ClampedArray, x: number, y: number): Rgb => {
  const i = (Math.round(y) * WIDTH + Math.round(x)) * 4;
  return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
};

async function saveCanvas(canvas: OffscreenCanvas, name: string, folder: string): Promise<void> {
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`out/${folder}/${name}.png`, btoa(binary), 'base64');
}

async function save(pixels: Uint8ClampedArray, name: string, width = WIDTH, height = HEIGHT, folder = 'draw-3-looks'): Promise<void> {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  await saveCanvas(canvas, name, folder);
}

/** The middle of a square cell, and the middle of the hex (q, r) of a pointy or flat grid. */
const square = (column: number, row: number): [number, number] => [(column + 0.5) * CELL, (row + 0.5) * CELL];
const hex = (type: 'hex-vertical' | 'hex-horizontal', q: number, r: number): [number, number] => {
  const { x, y } = axialToPixel(createHexLayout(type, CELL, 0, 0), { q, r });
  return [x, y];
};

describe('cell fills on the map', () => {
  it('fills exactly the squares a drag passed: every pixel inside them tinted, none of a neighbour', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: RED });
    // An L: three cells along a row, two down from its end.
    s.drag([square(1, 1), square(3, 1), square(3, 3)]);
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(1);
    const pixels = s.picture();
    const filled = new Set(['1,1', '2,1', '3,1', '3,2', '3,3']);
    const tinted = Math.round(0x20 + (0xe9 - 0x20) * CELL_FILL_OPACITY);
    for (let column = 0; column < 6; column++) {
      for (let row = 0; row < 5; row++) {
        const inside = filled.has(`${column},${row}`);
        // The middle of the cell and its four corners, two pixels in from the grid's lines.
        for (const [dx, dy] of [[0, 0], [-33, -33], [33, -33], [33, 33], [-33, 33], [0, -33], [33, 0]] as const) {
          const [red, green] = at(pixels, square(column, row)[0] + dx, square(column, row)[1] + dy);
          if (inside) {
            expect(Math.abs(red - tinted), `cell ${column},${row} at ${dx},${dy}`).toBeLessThanOrEqual(2);
            expect(green).toBeLessThan(red);
          } else {
            expect([red, green], `cell ${column},${row} at ${dx},${dy}`).toEqual([0x20, 0x20]);
          }
        }
      }
    }
  });

  it.each(['hex-vertical', 'hex-horizontal'] as const)('fills exactly the hexes a drag passed, up to their edges: %s', async (type) => {
    const s = await open(type, { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: BLUE });
    const path: [number, number][] = [[1, 1], [2, 1], [3, 1]];
    s.drag(path.map(([q, r]) => hex(type, q, r)));
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(1);
    const pixels = s.picture();
    const cells = cellGrid({ type, size: CELL, offsetX: 0, offsetY: 0 })!;
    const filled = new Set(path.map(([q, r]) => cells.cellAt({ x: hex(type, q, r)[0], y: hex(type, q, r)[1] })!.key));
    let checked = 0;
    for (let q = -1; q <= 6; q++) {
      for (let r = -1; r <= 5; r++) {
        const [cx, cy] = hex(type, q, r);
        const cell = cells.cellAt({ x: cx, y: cy })!;
        // The middle, and two pixels inside each corner and each edge's middle.
        const spots = [{ x: cx, y: cy }];
        cell.outline.forEach((corner, index) => {
          const next = cell.outline[(index + 1) % 6]!;
          for (const point of [corner, { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 }]) {
            const reach = Math.hypot(point.x - cx, point.y - cy);
            spots.push({ x: cx + ((point.x - cx) * (reach - 3)) / reach, y: cy + ((point.y - cy) * (reach - 3)) / reach });
          }
        });
        for (const { x, y } of spots) {
          if (x < 1 || y < 1 || x > WIDTH - 2 || y > HEIGHT - 2) continue;
          const [red, , blue] = at(pixels, x, y);
          checked++;
          if (filled.has(cell.key)) expect(blue, `hex ${q},${r} at ${x},${y}`).toBeGreaterThan(0x20 + 60);
          else expect([red, blue], `hex ${q},${r} at ${x},${y}`).toEqual([0x20, 0x20]);
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('keeps the grid\'s lines over a fill on the map, and lays a fill above the tokens over them', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0xffffff, lineWidth: 2 });
    s.tool({ mode: 'cells', color: RED });
    s.drag([square(1, 1), square(2, 1)]);
    s.tool({ mode: 'cells', color: RED, cellsLayer: 'above' });
    s.drag([square(1, 3), square(2, 3)]);
    const drawings = Object.values(s.store.getState().objects.drawings);
    expect(drawings.map(({ layer }) => layer)).toEqual(['map', undefined]);
    const pixels = s.picture();
    // The grid's line between the two cells of each fill, and the bare line elsewhere.
    const bare = at(pixels, 4 * CELL, square(4, 1)[1]);
    const onMap = at(pixels, 2 * CELL, square(1, 1)[1]);
    const above = at(pixels, 2 * CELL, square(1, 3)[1]);
    const fill = at(pixels, ...square(1, 1));
    expect(bare[1]).toBeGreaterThan(150);
    // Over a fill on the map the line is the grid's own, as bright as on the bare map but for the tint under it.
    expect(onMap[1]).toBeGreaterThan(bare[1] - 12);
    expect(onMap[1] - fill[1]).toBeGreaterThan(100);
    // A fill above the tokens lies over the line and tints it.
    expect(above[1]).toBeLessThan(onMap[1] - 40);
  });

  it('ends a fill at the map\'s edge, and merges a second drag of the colour into the first', async () => {
    const s = await open('hex-vertical', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: YELLOW });
    // The hex the map's left edge cuts in half, in the second row: its fill is the half on the map.
    s.drag([[10, hex('hex-vertical', 0, 1)[1]]]);
    const [half] = Object.values(s.store.getState().objects.drawings) as DrawingStroke[];
    expect([Math.min(...half!.points.map(({ x }) => x)), Math.max(...half!.points.map(({ x }) => x))]).toEqual([0, 35]);
    s.drag([hex('hex-vertical', 0, 1), hex('hex-vertical', 1, 1)]);
    const [fill, ...more] = Object.values(s.store.getState().objects.drawings) as DrawingStroke[];
    expect(more).toEqual([]);
    expect([Math.min(...fill!.points.map(({ x }) => x)), Math.max(...fill!.points.map(({ x }) => x))]).toEqual([0, 175]);
    const pixels = s.picture();
    expect(at(pixels, 4, hex('hex-vertical', 0, 1)[1])[0]).toBeGreaterThan(0x20 + 40);
  });
});

describe('a cell painted another colour', () => {
  it('shows the new colour alone once the drag is let go: not the two over each other', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: RED });
    s.drag([square(1, 1), square(3, 1)]);
    s.tool({ mode: 'cells', color: BLUE });
    s.drag([square(2, 1), square(2, 2)]);
    expect(Object.values(s.store.getState().objects.drawings).map(({ color }) => color)).toEqual([RED, RED, BLUE]);
    const pixels = s.picture();
    const tone = (ink: number): number => Math.round(0x20 + (ink - 0x20) * CELL_FILL_OPACITY);
    // Blue (#086ddd) on the bare ground, in the cell that was red and in the one that was empty: the same tones.
    for (const [column, row] of [[2, 1], [2, 2]] as const) {
      for (const [dx, dy] of [[0, 0], [-32, -32], [32, 32]] as const) {
        const [red, green, blue] = at(pixels, square(column, row)[0] + dx, square(column, row)[1] + dy);
        expect(Math.abs(red - tone(0x08)), `cell ${column},${row}`).toBeLessThanOrEqual(2);
        expect(Math.abs(green - tone(0x6d)), `cell ${column},${row}`).toBeLessThanOrEqual(2);
        expect(Math.abs(blue - tone(0xdd)), `cell ${column},${row}`).toBeLessThanOrEqual(2);
      }
    }
    // The red cells beside it are red as they were.
    for (const column of [1, 3]) expect(Math.abs(at(pixels, ...square(column, 1))[0] - tone(0xe9))).toBeLessThanOrEqual(2);
  });
});

describe('cell fills that close around a cell', () => {
  it('leaves the cell in the middle open where the cells around it meet only at a corner', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: RED });
    // A C around the cell (2, 2) whose two ends touch at a corner: one drawing, its hole touching its outline in a point.
    s.drag([square(3, 2), square(3, 1), square(1, 1), square(1, 3), square(2, 3)]);
    const drawings = Object.values(s.store.getState().objects.drawings) as DrawingStroke[];
    expect(drawings).toHaveLength(1);
    expect(drawings[0]!.holes).toHaveLength(1);
    const pixels = s.picture();
    const filled = new Set(['3,2', '3,1', '2,1', '1,1', '1,2', '1,3', '2,3']);
    for (let column = 0; column < 5; column++) {
      for (let row = 0; row < 5; row++) {
        for (const [dx, dy] of [[0, 0], [-32, -32], [32, -32], [32, 32], [-32, 32]] as const) {
          const [red] = at(pixels, square(column, row)[0] + dx, square(column, row)[1] + dy);
          if (filled.has(`${column},${row}`)) expect(red, `cell ${column},${row} at ${dx},${dy}`).toBeGreaterThan(0x20 + 60);
          else expect(red, `cell ${column},${row} at ${dx},${dy}`).toBe(0x20);
        }
      }
    }
  });
});

describe('stamps', () => {
  /** How much of the box (x0..x1, y0..y1) the stamp's ink covers, and the box around its ink. */
  function ink(pixels: Uint8ClampedArray, ground: number): { share: number; minX: number; maxX: number; minY: number; maxY: number } {
    let count = 0;
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (Math.abs(pixels[(y * WIDTH + x) * 4]! - ground) < 24) continue;
        count++;
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y);
        box.maxY = Math.max(box.maxY, y);
      }
    }
    return { share: count / (CELL * CELL), ...box };
  }

  it('places a stamp of medium size on one cell, in the tool\'s colour, and fills the cell with its symbol', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'stamp', icon: 'cauldron', color: RED, size: 'm' });
    // Anywhere in the cell: the stamp sits on its middle.
    s.drag([[3 * CELL + 9, 2 * CELL + 58]]);
    const [stamp] = Object.values(s.store.getState().objects.drawings) as DrawingStroke[];
    expect(stamp).toMatchObject({ type: 'icon', icon: 'cauldron', color: RED, width: CELL, points: [{ x: 3.5 * CELL, y: 2.5 * CELL }] });
    const pixels = s.picture();
    const drawn = ink(pixels, 0x20);
    // All of its ink lies in the cell, and reaches most of the way to its sides.
    expect(drawn.minX).toBeGreaterThanOrEqual(3 * CELL);
    expect(drawn.maxX).toBeLessThan(4 * CELL);
    expect(drawn.minY).toBeGreaterThanOrEqual(2 * CELL);
    expect(drawn.maxY).toBeLessThan(3 * CELL);
    expect(drawn.maxX - drawn.minX).toBeGreaterThan(0.6 * CELL);
    expect(drawn.maxY - drawn.minY).toBeGreaterThan(0.6 * CELL);
    expect(drawn.share).toBeGreaterThan(0.15);
    // Its ink is the tool's red: the white symbol tinted.
    let reddest: Rgb = [0, 0, 0];
    for (let y = drawn.minY; y <= drawn.maxY; y++) for (let x = drawn.minX; x <= drawn.maxX; x++) if (at(pixels, x, y)[0] > reddest[0]) reddest = at(pixels, x, y);
    expect(reddest).toEqual([0xe9, 0x31, 0x47]);
  });

  it('is crisp close in and clean far out', async () => {
    const s = await open('square', { plain: 0x000000, gridColor: 0x000000 });
    s.tool({ mode: 'stamp', icon: 'boss', color: '#ffffff', size: 'm' });
    s.drag([square(1, 1)]);
    /** Of the stamp's pixels in a picture where it is `side` wide: how many are in-between tones for each that is full ink. */
    const softness = (pixels: Uint8ClampedArray, side: number): number => {
      let between = 0;
      let full = 0;
      for (let y = HEIGHT / 2 - side / 2; y < HEIGHT / 2 + side / 2; y++) {
        for (let x = WIDTH / 2 - side / 2; x < WIDTH / 2 + side / 2; x++) {
          const tone = at(pixels, x, y)[0];
          if (tone >= 215) full++;
          else if (tone > 40) between++;
        }
      }
      expect(full).toBeGreaterThan(0.2 * side * side);
      return between / full;
    };
    s.viewport.moveCenter(...square(1, 1));
    const lifeSize = softness(s.picture(), CELL);
    // Close in: the stamp is 280 px wide. An edge stays a pixel or two wide while the ink grows with the area: four times
    // as wide, the symbol has a quarter of the in-between tones for its ink. A picture merely enlarged would keep them all.
    s.viewport.setZoom(4, true);
    s.viewport.moveCenter(...square(1, 1));
    const close = s.picture();
    const closeIn = softness(close, 4 * CELL);
    expect(closeIn).toBeLessThan(0.4 * lifeSize);
    // Far out: the stamp is 17.5 px wide. It is the close picture made small, not a sample of it: tone for tone near the average of the pixels it stands for.
    s.viewport.setZoom(0.25, true);
    s.viewport.moveCenter(...square(1, 1));
    const far = s.picture();
    // Tone for tone: the far picture, the average of the close pixels each of its pixels stands for, and the one close pixel in the
    // middle of them, which a picture without smaller copies of itself would show. Compared in blocks of two by two far pixels,
    // so that how softly the small picture is filtered does not count, only whether it holds what the large one holds.
    const side = 16;
    const tones = { far: new Float64Array(64), average: new Float64Array(64), sampled: new Float64Array(64) };
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        let sum = 0;
        for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) sum += at(close, WIDTH / 2 - 128 + i * 16 + u, HEIGHT / 2 - 128 + j * 16 + v)[0];
        const block = (j >> 1) * 8 + (i >> 1);
        tones.far[block]! += at(far, WIDTH / 2 - side / 2 + i, HEIGHT / 2 - side / 2 + j)[0] / 4;
        tones.average[block]! += sum / 256 / 4;
        tones.sampled[block]! += at(close, WIDTH / 2 - 128 + i * 16 + 8, HEIGHT / 2 - 128 + j * 16 + 8)[0] / 4;
      }
    }
    const off = (tone: Float64Array): number => tone.reduce((sum, value, index) => sum + Math.abs(value - tones.average[index]!), 0) / 64;
    const mean = tones.average.reduce((sum, value) => sum + value, 0) / 64;
    console.info(`[stamps] far out, the picture is off the average of what it stands for by ${off(tones.far).toFixed(1)} of 255, where sampled pixels would be off by ${off(tones.sampled).toFixed(1)} (mean tone ${mean.toFixed(1)}); in-between tones for each pixel of full ink: ${lifeSize.toFixed(3)} at life size, ${closeIn.toFixed(3)} four times as large`);
    expect(mean).toBeGreaterThan(30);
    expect(off(tones.far)).toBeLessThan(0.5 * off(tones.sampled));
  });
});

describe('the cell a press will fill or clear, under the pointer', () => {
  it('tints and outlines the cell under the pointer on the GM\'s canvas, writes nothing, and goes with the pointer', async () => {
    const s = await open('square', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: RED });
    expect(s.hover(...square(2, 1))).toBe('none');
    let pixels = s.picture();
    const tinted = Math.round(0x20 + (0xe9 - 0x20) * CELL_FILL_OPACITY);
    // The cell as its fill will tint it, its neighbours untouched, and a line of the colour along its edge.
    for (const [dx, dy] of [[0, 0], [-28, -28], [28, 28]] as const) expect(Math.abs(at(pixels, square(2, 1)[0] + dx, square(2, 1)[1] + dy)[0] - tinted)).toBeLessThanOrEqual(2);
    for (const [column, row] of [[1, 1], [3, 1], [2, 0], [2, 2]] as const) expect(at(pixels, ...square(column, row))).toEqual([0x20, 0x20, 0x20]);
    expect(at(pixels, 2 * CELL, 1.5 * CELL)[0]).toBeGreaterThan(200);
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(0);
    // In another cell with the next move; nowhere once the pointer left.
    s.hover(...square(4, 3));
    pixels = s.picture();
    expect(at(pixels, ...square(2, 1))).toEqual([0x20, 0x20, 0x20]);
    expect(Math.abs(at(pixels, ...square(4, 3))[0] - tinted)).toBeLessThanOrEqual(2);
    s.annotations.pointer.leave();
    expect(at(s.picture(), ...square(4, 3))).toEqual([0x20, 0x20, 0x20]);
  });

  it('marks a cell to clear as the unfill drag marks it, and shows a hex its own shape', async () => {
    const s = await open('hex-vertical', { plain: 0x202020, gridColor: 0x202020 });
    s.tool({ mode: 'cells', color: BLUE });
    s.drag([hex('hex-vertical', 2, 2)]);
    s.tool({ mode: 'cells', cellsUnfill: true });
    const [x, y] = hex('hex-vertical', 2, 2);
    const filled = at(s.picture(), x, y);
    expect(s.hover(x, y)).toBe('none');
    // A light veil over the fill.
    const veiled = at(s.picture(), x, y);
    expect(veiled[0]).toBeGreaterThan(filled[0] + 20);
    // A hex's corners lie outside the square around its middle: nothing of the mark is there.
    expect(at(s.picture(), x + 33, y - 38)).toEqual([0x20, 0x20, 0x20]);
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(1);
  });
});

describe.skipIf(!LOOKS)('what a press will place: pictures to look at', () => {
  const FOLDER = 'draw-qa2-looks';

  it.each([false, true])('the stamp to be, snapped to its cell, beside stamps that are placed (dark map: %s)', async (dark) => {
    const s = await open('square', { dark });
    s.tool({ mode: 'stamp', icon: 'trap', color: RED, size: 'm' });
    s.drag([square(1, 1)]);
    s.tool({ mode: 'stamp', icon: 'treasure', color: YELLOW, size: 'm' });
    s.drag([square(5, 3)]);
    s.tool({ mode: 'stamp', icon: 'trap', color: RED, size: 'm' });
    // The pointer is off the cell's middle: the stamp to be sits on the cell.
    expect(s.hover(square(3, 2)[0] + 22, square(3, 2)[1] - 17)).toBe('none');
    await vi.waitFor(() => expect(s.annotations.layer.building).toBe(false));
    await save(s.picture(), `stamp-ghost-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
    s.tool({ mode: 'stamp', icon: 'boss', color: dark ? '#ffffff' : '#000000', size: 'l' });
    s.hover(square(3, 2)[0] + 22, square(3, 2)[1] - 17);
    await save(s.picture(), `stamp-ghost-large-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
  });

  it.each([false, true])('the pen\'s dot in four sizes and three colours, at three zooms (dark map: %s)', async (dark) => {
    const s = await open('square', { dark });
    const TILE = 80;
    const colours = ['#ffffff', '#000000', RED];
    const sizes = ['s', 'm', 'l', 'xl'] as const;
    const zooms = [1, 0.4, 2.5];
    const sheet = new OffscreenCanvas(sizes.length * TILE * zooms.length + 16 * (zooms.length - 1), colours.length * TILE);
    const ctx = sheet.getContext('2d')!;
    for (const [group, zoom] of zooms.entries()) {
      s.viewport.setZoom(zoom, true);
      s.viewport.moveCenter(WIDTH / 2, HEIGHT / 2);
      for (const [row, color] of colours.entries()) {
        for (const [column, size] of sizes.entries()) {
          s.tool({ mode: 'pen', color, size });
          // Over the map's paper and over its ink.
          const [x, y] = [200 + column * 40, 150 + row * 45];
          expect(s.hover(x, y)).toBe('none');
          const tile = new ImageData(TILE, TILE);
          const pixels = s.picture();
          for (let ty = 0; ty < TILE; ty++) {
            const from = ((y - TILE / 2 + ty) * WIDTH + (x - TILE / 2)) * 4;
            tile.data.set(pixels.subarray(from, from + TILE * 4), ty * TILE * 4);
          }
          ctx.putImageData(tile, group * (sizes.length * TILE + 16) + column * TILE, row * TILE);
        }
      }
    }
    await saveCanvas(sheet, `pen-dots-${dark ? 'dark' : 'light'}`, FOLDER);
  });

  it.each([false, true])('a line\'s start on the grid\'s corner, and where the pointer is with Alt (dark map: %s)', async (dark) => {
    const s = await open('square', { dark });
    s.tool({ mode: 'line', color: dark ? '#ffffff' : '#000000', size: 'm' });
    expect(s.hover(3 * CELL + 9, 2 * CELL - 7)).toBe('none');
    await save(s.picture(), `line-start-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
    s.tool({ mode: 'rectangle', color: BLUE, size: 'l' });
    s.hover(3 * CELL + 9, 2 * CELL - 7, true);
    await save(s.picture(), `box-start-alt-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
  });

  it.each([['square', false], ['square', true], ['hex-vertical', false], ['hex-vertical', true]] as const)('the cell to fill and the cell to clear on a %s grid (dark map: %s)', async (type, dark) => {
    const s = await open(type, { dark });
    const cell = (a: number, b: number): [number, number] => (type === 'square' ? square(a, b) : hex(type, a, b));
    s.tool({ mode: 'cells', color: RED });
    s.drag([cell(1, 1), cell(2, 1), cell(3, 1)]);
    s.tool({ mode: 'cells', color: BLUE });
    s.drag([cell(1, 3), cell(2, 3)]);
    // A cell the tool's colour will fill, beside fills of that colour and of another.
    expect(s.hover(...cell(3, 3))).toBe('none');
    await save(s.picture(), `cell-fill-${type}-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
    s.tool({ mode: 'cells', cellsUnfill: true });
    s.hover(...cell(2, 1));
    await save(s.picture(), `cell-clear-${type}-${dark ? 'dark' : 'light'}`, WIDTH, HEIGHT, FOLDER);
  });
});

describe.skipIf(!LOOKS)('pictures to look at', () => {
  it.each([['square', false], ['square', true], ['hex-vertical', false], ['hex-vertical', true]] as const)('cell fills in three colours on a %s grid (dark map: %s)', async (type, dark) => {
    const s = await open(type, { dark });
    const cell = (a: number, b: number): [number, number] => (type === 'square' ? square(a, b) : hex(type, a, b));
    s.tool({ mode: 'cells', color: RED });
    s.drag([cell(1, 1), cell(2, 1), cell(3, 1), cell(3, 2)]);
    s.tool({ mode: 'cells', color: BLUE });
    s.drag([cell(1, 3), cell(2, 3), cell(3, 3), cell(4, 3), cell(4, 2)]);
    s.tool({ mode: 'cells', color: YELLOW });
    s.drag([cell(5, 1), cell(6, 1), cell(5, 2)]);
    s.tool({ mode: 'cells', color: '#ffffff' });
    s.drag([cell(6, 3), cell(6, 4)]);
    s.tool({ mode: 'cells', color: '#000000' });
    s.drag([cell(1, 4), cell(2, 4)]);
    await save(s.picture(), `cells-${type}-${dark ? 'dark' : 'light'}`);
  });

  it.each([false, true])('one fill at three strengths (dark map: %s)', async (dark) => {
    const s = await open('square', { dark });
    const fills = [0.25, CELL_FILL_OPACITY, 0.55].flatMap((opacity, row) => [RED, BLUE, YELLOW, '#2f9e44'].map((color, column) => ({
      type: 'line' as const, color, width: 0, opacity, fill: 'solid' as const, cells: true as const, layer: 'map' as const,
      points: [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]].map(([x, y]) => ({ x: (column * 2 + x!) * CELL, y: (row * 2 + y!) * CELL })),
    })));
    s.store.getState().addDrawings(fills);
    await save(s.picture(), `cells-strengths-${dark ? 'dark' : 'light'}`);
  });

  it.each([false, true])('stamps: glyphs, three colours and two sizes (dark map: %s)', async (dark) => {
    const s = await open('square', { dark });
    const icons = ['door', 'cauldron', 'boss', 'treasure', 'trap', 'stairs', 'skull'];
    icons.forEach((icon, column) => {
      [RED, BLUE, dark ? '#ffffff' : '#000000'].forEach((color, row) => {
        s.tool({ mode: 'stamp', icon, color, size: 'm' });
        s.drag([square(column, row)]);
      });
    });
    ['boss', 'treasure', 'skull'].forEach((icon, index) => {
      s.tool({ mode: 'stamp', icon, color: [YELLOW, RED, BLUE][index]!, size: 'l' });
      s.drag([[(1 + index * 2.5) * CELL, 4.5 * CELL]]);
    });
    // The older symbol comes in a moment later than the rest.
    await vi.waitFor(() => expect(s.annotations.layer.building).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await save(s.picture(), `stamps-${dark ? 'dark' : 'light'}`);
    s.viewport.setZoom(4, true);
    s.viewport.moveCenter(...square(2, 0));
    await save(s.picture(), `stamps-close-${dark ? 'dark' : 'light'}`);
    s.viewport.setZoom(0.25, true);
    s.viewport.moveCenter(WIDTH / 2, HEIGHT / 2);
    await save(s.picture(), `stamps-far-${dark ? 'dark' : 'light'}`);
  });
});
