import { Container, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { cellOutlines } from '../../src/app/dungeons/scene/cellOutline';
import { floorCells } from '../../src/app/dungeons/water/wetGrid';
import { normalizePolygon, subtractShapes, unionShapes } from '../../src/app/lighting/polygonClip';
import type { DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { fieldDistance, liquidField } from '../../src/app/pixi/liquids/liquidField';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import type { LiquidColors, LiquidKind, LiquidSurface } from '../../src/app/types/liquidTypes';
import type { Point } from '../../src/app/types/visionTypes';

/** Where the pictures go, under the project root (the browser may write nowhere else). */
export const LIQUID_OUT = 'out/liquids';

export interface PaintedMap {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** World pixels per cell. */
  cell: number;
  /** Every liquid outline the map paints, in world pixels, largest first, with the columns standing in it. */
  outlines: { polygon: Point[]; holes: Point[][] }[];
}

function signedArea(polygon: readonly Point[]): number {
  let twice = 0;
  polygon.forEach((a, index) => {
    const b = polygon[(index + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return twice / 2;
}
const area = (polygon: readonly Point[]): number => Math.abs(signedArea(polygon));

const toQ = (points: readonly Point[]): number[] => points.flatMap((p) => [Math.round(p.x * 8), Math.round(p.y * 8)]);
const fromQ = (ring: readonly number[]): Point[] => Array.from({ length: ring.length / 2 }, (_, k) => ({ x: ring[k * 2]! / 8, y: ring[k * 2 + 1]! / 8 }));

function inside(point: Point, ring: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The pieces of `outline` on the floor and off the columns, as the map paints its water, each with its holes. */
function onFloor(outline: readonly Point[], floor: readonly (readonly number[])[], columns: readonly (readonly number[])[]): { polygon: Point[]; holes: Point[][] }[] {
  const shape = normalizePolygon(toQ(outline));
  const rings = subtractShapes(subtractShapes(shape, subtractShapes(shape, floor)), columns).map(fromQ).filter((ring) => area(ring) > 1);
  const largest = rings.reduce((best, ring) => (area(ring) > area(best) ? ring : best), rings[0] ?? []);
  const outer = Math.sign(signedArea(largest));
  const pieces = rings.filter((ring) => Math.sign(signedArea(ring)) === outer).map((polygon) => ({ polygon, holes: [] as Point[][] }));
  for (const hole of rings.filter((ring) => Math.sign(signedArea(ring)) !== outer)) pieces.find((piece) => inside(hole[0]!, piece.polygon))?.holes.push(hole);
  return pieces;
}

/** A generated dungeon's first floor, painted in `look` at `cell` pixels per cell, with its water outlines. */
export async function paintedDungeon(request: DungeonRequest, look: DungeonStyleId, cell: number): Promise<PaintedMap> {
  const model = generateDungeon(request);
  const layout = mapLayout(model, cell, DEFAULT_VIEW);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  renderMap(canvas.getContext('2d')!, model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: cell, floor: 0 });
  const world = (p: Point): Point => ({ x: (p.x - layout.originCell.x) * cell, y: (p.y - layout.originCell.y) * cell });
  const floor = unionShapes(cellOutlines(floorCells(model.floors[0]!.rooms), 100_000).map((ring) => toQ(ring.map(world))), []);
  const columns = model.floors[0]!.columns.map((column) => {
    const r = column.radius;
    return toQ([{ x: column.x - r, y: column.y - r }, { x: column.x + r, y: column.y - r }, { x: column.x + r, y: column.y + r }, { x: column.x - r, y: column.y + r }].map(world));
  });
  const outlines = model.floors[0]!.water
    .flatMap((water) => onFloor(water.outline.map(world), floor, unionShapes(columns, [])))
    .sort((a, b) => area(b.polygon) - area(a.polygon));
  return { bitmap: await createImageBitmap(canvas), width: canvas.width, height: canvas.height, cell, outlines };
}

export function surfaceOf(id: string, liquid: LiquidKind, outline: { polygon: Point[]; holes?: Point[][] }, colors: LiquidColors, flow?: Point): LiquidSurface {
  return { id, kind: 'liquid', liquid, polygon: outline.polygon, colors, ...(outline.holes?.length && { holes: outline.holes }), ...(flow && { flow }) };
}

export function centreOf(polygon: readonly Point[]): Point {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** The point of `polygon` farthest from its shore (to a texel of its distance field), or a point that far as `share` of its deepest. */
export function deepPoint(polygon: readonly Point[], cell: number, share = 1): Point {
  const field = liquidField(polygon, cell);
  let best = { x: 0, y: 0, d: -Infinity };
  for (let j = 0; j < field.height; j++) {
    for (let i = 0; i < field.width; i++) {
      const d = fieldDistance(field, i, j);
      if (d > best.d) best = { x: field.origin.x + (i + 0.5) * field.texel, y: field.origin.y + (j + 0.5) * field.texel, d };
    }
  }
  if (share >= 1) return best;
  for (let j = 0; j < field.height; j++) {
    for (let i = 0; i < field.width; i++) {
      if (Math.abs(fieldDistance(field, i, j) - best.d * share) < 0.05) return { x: field.origin.x + (i + 0.5) * field.texel, y: field.origin.y + (j + 0.5) * field.texel };
    }
  }
  return best;
}

export interface Shot {
  width: number;
  height: number;
  /** Screen pixels per world pixel. */
  zoom: number;
  /** World point at the picture's centre. */
  centre: Point;
}

/** Renders the map and its surfaces as `shot` frames them, each surface at `seconds`; `surfaces` empty renders the map alone. */
export function renderShot(renderer: WebGLRenderer, map: Texture, meshes: readonly LiquidMesh[], shot: Shot, seconds: number): Uint8ClampedArray {
  const world = new Container();
  world.addChild(new Sprite(map));
  for (const mesh of meshes) {
    mesh.setTime(seconds);
    world.addChild(mesh.mesh);
  }
  world.scale.set(shot.zoom);
  world.position.set(shot.width / 2 - shot.centre.x * shot.zoom, shot.height / 2 - shot.centre.y * shot.zoom);
  const target = RenderTexture.create({ width: shot.width, height: shot.height, antialias: false });
  renderer.render({ container: world, target, clear: true, clearColor: [0, 0, 0, 1] });
  const { pixels } = renderer.extract.pixels({ target });
  target.destroy(true);
  world.removeChildren();
  world.destroy();
  return new Uint8ClampedArray(pixels);
}

/** Pictures side by side, `columns` to a row, with a gap between them. */
export function sheet(pictures: readonly Uint8ClampedArray[], width: number, height: number, columns: number): OffscreenCanvas {
  const gap = 8;
  const rows = Math.ceil(pictures.length / columns);
  const out = new OffscreenCanvas(columns * width + (columns - 1) * gap, rows * height + (rows - 1) * gap);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, out.width, out.height);
  pictures.forEach((pixels, index) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), (index % columns) * (width + gap), Math.floor(index / columns) * (height + gap));
  });
  return out;
}

export async function savePicture(canvas: OffscreenCanvas, name: string): Promise<void> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${LIQUID_OUT}/${name}.png`, btoa(binary), 'base64');
}
