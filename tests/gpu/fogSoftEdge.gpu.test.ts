import '../setup/obsidianDom';
import { afterEach, describe, expect, it } from 'vitest';
import { FogCanvasCompositor } from '../../src/app/pixi/fog/FogCanvasCompositor';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogScenes } from '../helpers/fogCoverageScene';

const SIDE = 256;
/** The blur's deviation in these tests; edges are set three times as wide (`fogEdgeBlur`). */
const EDGE = 40;
const owned: FogCanvasCompositor[] = [];

function rect(id: string, timestamp: number, x: number, y: number, width: number, height: number, isErasing = false): FogRectangleFill {
  return { id, timestamp, kind: 'fog', type: 'rectangle', x, y, width, height, isErasing };
}

function compositor(edge = EDGE): FogCanvasCompositor {
  const made = new FogCanvasCompositor({ x: 0, y: 0, width: SIDE, height: SIDE }, 1);
  made.setEdgeWidth(edge * 3);
  owned.push(made);
  return made;
}

function alphas(c: FogCanvasCompositor): Uint8ClampedArray {
  const image = c.getCanvas().getContext('2d')!.getImageData(0, 0, SIDE, SIDE).data;
  return image.filter((_, i) => i % 4 === 3);
}

const alphaAt = (pixels: Uint8ClampedArray, x: number, y: number): number => pixels[y * SIDE + x]!;

describe('a soft fog edge', () => {
  afterEach(() => {
    for (const c of owned.splice(0)) c.destroy();
  });

  it('fades the fog over the edge, from solid to open, both ways of its outline', () => {
    const c = compositor();
    expect(c.composite({ paint: rect('paint', 1, 0, 0, SIDE / 2, SIDE) })).toBe(true);
    const fog = alphas(c);
    const row = Array.from({ length: SIDE }, (_, x) => alphaAt(fog, x, SIDE / 2));
    expect(row[0]).toBe(255);
    expect(row[SIDE - 1]).toBe(0);
    expect(Math.abs(row[SIDE / 2]! - 127)).toBeLessThan(8);
    for (let x = 1; x < SIDE; x++) expect(row[x]!).toBeLessThanOrEqual(row[x - 1]!);
    // Within a blur's reach of the outline it is in between, and solid or open beyond it
    expect(row[SIDE / 2 - EDGE]!).toBeGreaterThan(127);
    expect(row[SIDE / 2 - EDGE]!).toBeLessThan(255);
    expect(row[SIDE / 2 - 3 * EDGE]).toBe(255);
    expect(row[SIDE / 2 + 3 * EDGE]).toBe(0);
  });

  // Blurred as it is, the fog fades into the nothing past the map, and players see the rim of a map fogged whole
  it('keeps a map fogged whole opaque up to its own edges and corners', () => {
    const c = compositor();
    c.composite({ paint: rect('paint', 1, 0, 0, SIDE, SIDE) });
    const fog = alphas(c);
    expect(fog.every((alpha) => alpha === 255)).toBe(true);
  });

  // The canvas is larger than the map: fog painted up to the map's edge has open canvas beyond it
  it.each([[0.5, 0], [0.5, 1], [1, 0]])('takes the map\'s edge for the edge, not the canvas\' (scale %s, map offset %s)', (scale, offset) => {
    const margin = 64;
    const side = 128 + offset;
    const c = new FogCanvasCompositor({ x: -margin, y: -margin, width: side + 2 * margin, height: side + 2 * margin }, scale);
    owned.push(c);
    c.setEdgeWidth(EDGE * 3, () => ({ x: offset, y: offset, width: 128, height: 128 }));
    c.composite({ paint: rect('paint', 1, offset, offset, 128, 128) });
    const canvas = c.getCanvas();
    const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const at = (worldX: number, worldY: number): number =>
      image[(Math.floor((worldY + margin) * scale) * canvas.width + Math.floor((worldX + margin) * scale)) * 4 + 3]!;
    for (let i = 0; i < 128; i += 4) {
      for (const [x, y] of [[i, 0], [i, 127], [0, i], [127, i]] as const) expect(at(x + offset, y + offset)).toBe(255);
    }
  });

  it('leaves fog erased up to the map\'s edge open there, not fading in from beyond it', () => {
    const c = compositor();
    c.composite({ paint: rect('paint', 1, 0, 0, SIDE, SIDE), hole: rect('hole', 2, 0, 0, SIDE / 2, SIDE, true) });
    const fog = alphas(c);
    expect(alphaAt(fog, 0, SIDE / 2)).toBe(0);
    expect(alphaAt(fog, SIDE - 1, SIDE / 2)).toBe(255);
  });

  it('draws as a hard edge did at width 0, and after being switched off', () => {
    const ops = { paint: rect('paint', 1, 40, 40, 100, 100) };
    const hard = compositor(0);
    hard.composite(ops);
    const switched = compositor();
    switched.composite(ops);
    expect(alphas(switched)).not.toEqual(alphas(hard));
    switched.setEdgeWidth(0);
    switched.composite(ops);
    expect(alphas(switched)).toEqual(alphas(hard));
  });

  it('draws the fog as its shapes are for what reads its pixels', () => {
    const ops = { paint: rect('paint', 1, 40, 40, 100, 100) };
    const hard = compositor(0);
    hard.composite(ops);
    const faded = compositor();
    faded.composite(ops, undefined, false);
    expect(alphas(faded)).toEqual(alphas(hard));
  });

  it('still covers the whole canvas, unblurred, where the geometry cannot be read', () => {
    const c = compositor();
    expect(c.composite({ broken: rect('broken', 1, Number.NaN, 0, 10, 10) })).toBe(false);
    expect(alphas(c).every((alpha) => alpha === 255)).toBe(true);
  });

  it('follows a canvas that changes size', () => {
    const c = compositor();
    c.composite({ paint: rect('paint', 1, 0, 0, SIDE, SIDE) });
    c.updateBounds({ x: 0, y: 0, width: SIDE, height: SIDE / 2 });
    c.composite({ paint: rect('paint', 1, 0, 0, SIDE, SIDE / 2) });
    const image = c.getCanvas().getContext('2d')!.getImageData(0, 0, SIDE, SIDE / 2).data;
    expect(image.filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });
});

describe('the fog tool with a soft edge', () => {
  const { scene } = fogScenes();

  // Deleting erases the piece under the pointer by the fog's pixels: read faded, two pieces closer than the fade are one
  it('deletes one piece of fog, not the piece beside it within the fade', async () => {
    const s = await scene({ left: rect('left', 1, 8, 8, 40, 112), right: rect('right', 2, 72, 8, 40, 112) });
    s.showMapImage({ x: 0, y: 0, width: 128, height: 128 });
    s.fog.setEdge({ style: 'soft', width: 12 });
    // The blur's depth in a piece this narrow differs by renderer, so the piece beside it is held to itself
    const beside = s.read(92, 64);
    expect(beside).toBeLessThan(60);
    const erase = s.fog as unknown as { eraseConnectedVisibleRegionAt(x: number, y: number): boolean };
    expect(erase.eraseConnectedVisibleRegionAt(28, 64)).toBe(true);
    expect(s.read(28, 64)).toBeGreaterThan(200);
    expect(s.read(92, 64)).toBe(beside);
  });

  it('shows the players the fade, and nothing of a map fogged whole', async () => {
    const s = await scene({ half: rect('half', 1, 0, 0, 64, 128) });
    s.showMapImage({ x: 0, y: 0, width: 128, height: 128 });
    s.fog.setEdge({ style: 'soft', width: 8 });
    expect(s.read(4, 64)).toBe(0);
    expect(s.read(124, 64)).toBe(255);
    const middle = s.read(64, 64);
    expect(middle).toBeGreaterThan(80);
    expect(middle).toBeLessThan(180);
    s.setFog({ whole: rect('whole', 2, 0, 0, 128, 128) });
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [64, 0], [0, 64]] as const) expect(s.read(x, y)).toBe(0);
  });
});
