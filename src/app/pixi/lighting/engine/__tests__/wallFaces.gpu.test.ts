import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 256;
const SCALE = 4;
const TEXEL = 2;
/** The camera looks at the middle of the room's north wall, whose centre line is y = 100. */
const CENTRE = { x: 300, y: 100 };

function wall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/** A room whose north wall steps down at x = 300: an inside corner at (300, 100). */
const stepped = [
  wall('n1', 100, 100, 300, 100), wall('step', 300, 100, 300, 150), wall('n2', 300, 150, 700, 150),
  wall('e', 700, 150, 700, 600), wall('s', 700, 600, 100, 600), wall('w', 100, 600, 100, 100),
];
const room = [wall('n', 100, 100, 500, 100), wall('e', 500, 100, 500, 500), wall('s', 500, 500, 100, 500), wall('w', 100, 500, 100, 100)];
/**
 * A square object's outline as the dungeon generator draws a column's: each face stops light
 * alone, and only from inside, so a lamp outside lights the top through the near faces and the
 * far ones cast its shadow.
 */
function objectOutline(x0: number, y0: number, x1: number, y1: number): WallSegment[] {
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  return corners.map(([ax, ay], k) => {
    const [bx, by] = corners[(k + 1) % corners.length]!;
    const direction = -(by - ay) * (cx - ax) + (bx - ax) * (cy - ay) > 0 ? 'left' : 'right';
    return { ...wall(`object${k}`, ax, ay, bx, by), blocks: 'light', direction };
  });
}
const light: EngineLight = { key: 'l', x: 300, y: 450, bright: 400, dim: 800, flame: 10, color: [1, 1, 1], intensity: 0.8, animation: 'none' };

function scene(overrides: Partial<EngineScene>): EngineScene {
  return { bounds: { width: 1024, height: 1024 }, albedo: null, walls: room, lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...overrides };
}

describe('wall faces', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<{ renderer: WebGLRenderer; engine: LightingEngine }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    return { renderer, engine };
  }

  /** Renders a white map under the lighting layer at `SCALE` around `centre`; reads the red channel at a world point. */
  function render(engine: LightingEngine, renderer: WebGLRenderer, centre = CENTRE): (x: number, y: number) => number {
    const ox = SIZE / 2 - centre.x * SCALE, oy = SIZE / 2 - centre.y * SCALE;
    const stage = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(1024, 1024);
    const world = new Container();
    world.addChild(map, engine.layer);
    world.scale.set(SCALE);
    world.position.set(ox, oy);
    stage.addChild(world);
    engine.setView(new Matrix(SCALE, 0, 0, SCALE, ox, oy).invert(), SCALE);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    renderer.render({ container: stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
    target.destroy(true);
    return (x, y) => pixels[(Math.floor(y * SCALE + oy) * SIZE + Math.floor(x * SCALE + ox)) * 4]!;
  }

  it('lights the face of a wall on the lit side and leaves its far side dark', async () => {
    const { renderer, engine } = await setup();
    engine.update(scene({}));
    engine.flush();
    const at = render(engine, renderer);
    // Below the tonemap's shoulder PBR Neutral only subtracts 0.04 from linear light.
    const light = (x: number, y: number): number => srgbToLinear(at(x, y) / 255) + 0.04;
    for (const x of [250, 300, 350]) {
      expect(light(x, CENTRE.y + 2 * TEXEL)).toBeGreaterThanOrEqual(0.9 * light(x, CENTRE.y + 2 * TEXEL + 12));
      expect(at(x, CENTRE.y - 2 * TEXEL)).toBe(0);
    }
  });

  it('shows no sight past a wall beyond filtering', async () => {
    const { renderer, engine } = await setup();
    const sight = computeSight([{ tokenId: 't', origin: { x: 300, y: 300 }, range: 4000, senses: [] }], room);
    engine.update(scene({ lights: [], ambient: 1, sight }));
    engine.flush();
    const at = render(engine, renderer);
    for (const x of [250, 300, 350]) {
      expect(at(x, CENTRE.y + 2 * TEXEL)).toBeGreaterThan(200);
      for (let d = 1.5 / SCALE + 0.01 + 1 / SCALE; d < 12; d += 1 / SCALE) expect(at(x, CENTRE.y - d)).toBe(0);
    }
  });

  it('lights the top of an object up to its shadow, without a dark line where the far face stops the light', async () => {
    const { renderer, engine } = await setup();
    // The lamp stands south of the object; its north face, y = 260, stops the light.
    engine.update(scene({ walls: [...room, ...objectOutline(260, 260, 340, 340)], ambient: 0.3 }));
    engine.flush();
    const at = render(engine, renderer, { x: 300, y: 260 });
    const linear = (x: number, y: number): number => srgbToLinear(at(x, y) / 255) + 0.04;
    const pixel = 1 / SCALE;
    for (const x of [280, 300, 320]) {
      const top = linear(x, 272);
      let shade = Infinity;
      for (let y = 244; y <= 252; y += pixel) shade = Math.min(shade, linear(x, y));
      expect(top).toBeGreaterThan(1.5 * shade);
      // Across the face's core no pixel is darker than its shadow: the top meets it without a line.
      for (let y = 256; y <= 266; y += pixel) expect(linear(x, y), `(${x}, ${y})`).toBeGreaterThanOrEqual(0.95 * shade);
      // And no light of the lamp past the face's centre line beyond filtering.
      let shadeMax = 0;
      for (let y = 244; y <= 252; y += pixel) shadeMax = Math.max(shadeMax, linear(x, y));
      for (let y = 260 - 1.5 * pixel - 0.01 - pixel; y > 252; y -= pixel) expect(linear(x, y), `(${x}, ${y})`).toBeLessThanOrEqual(shadeMax + 0.02);
    }
  });

  it('lights the faces at an inside corner like the floor next to them', async () => {
    const { renderer, engine } = await setup();
    const lamp: EngineLight = { ...light, x: 200, y: 400 };
    engine.update(scene({ walls: stepped, lights: [lamp] }));
    engine.flush();
    const at = render(engine, renderer, { x: 290, y: 120 });
    const linear = (x: number, y: number): number => srgbToLinear(at(x, y) / 255) + 0.04;
    // Along the step's face (x = 300) and the upper wall (y = 100), 2 texels out, up to the corner.
    for (let t = 2 * TEXEL; t <= 40; t += 1) {
      expect(linear(300 - 2 * TEXEL, 100 + t)).toBeGreaterThanOrEqual(0.9 * linear(300 - 16, 100 + t));
      expect(linear(300 - t, 100 + 2 * TEXEL)).toBeGreaterThanOrEqual(0.9 * linear(300 - t, 116));
    }
  });

  it('keeps a shadow that meets a wall where it is', async () => {
    const { renderer, engine } = await setup();
    // The pillar's left end casts a 45° shadow edge onto the wall at y = 150: x = 350 + (y - 150).
    const lamp: EngineLight = { ...light, x: 650, y: 450, flame: 2 };
    engine.update(scene({ walls: [...stepped, wall('pillar', 400, 200, 440, 200)], lights: [lamp] }));
    engine.flush();
    const at = render(engine, renderer, { x: 350, y: 160 });
    const linear = (x: number, y: number): number => srgbToLinear(at(x, y) / 255) + 0.04;
    // Where the face crosses halfway from lit to shadow, relative to the edge, against the floor
    // 12 px further from the wall at the same offset from the edge. Bounce lights a wall's face
    // more than the floor, so levels are taken on each row.
    const crossing = (edge: number, y: number): number => {
      const mid = (linear(edge - 12, y) + linear(edge + 10, y)) / 2;
      let x = edge - 12;
      while (x < edge + 10 && linear(x, y) > mid) x += 1 / SCALE;
      return x - edge;
    };
    for (let d = 2 * TEXEL; d <= 8; d += 1) {
      const edge = 350 + d;
      expect(linear(edge - 12, 150 + d)).toBeGreaterThan(0.3);
      expect(Math.abs(crossing(edge, 150 + d) - crossing(edge + 12, 162 + d))).toBeLessThanOrEqual(3);
    }
  });
});
