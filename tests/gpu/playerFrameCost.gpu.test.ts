/// <reference types="vite/client" />
import { Container, Graphics, Matrix, Sprite, Text, Texture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PlayerFrameTexture } from '../../src/app/pixi/PlayerFrameTexture';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { EngineLight, EngineScene } from '../../src/app/pixi/lighting/engine/types';
import { playerFrame } from '../../src/app/services/playerFrame';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeSight, type SightSource } from '../../src/app/vision/sight';

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const MAP = 4096;
const PANE = { width: 1200, height: 800 };
/** The DM's zoom: the pane shows 2400 × 1600 world px around the map's centre. */
const GM_SCALE = 0.5;
const SAMPLES = 9;

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** GPU time of `work` from a timer query; null without the extension or when the GPU reported a disjoint event. */
async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt | null, work: () => void): Promise<number | null> {
  if (!ext) {
    work();
    return null;
  }
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  work();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => setTimeout(resolve, 4));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

function median(values: (number | null)[]): number | null {
  const kept = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  return kept.length ? Math.round(kept[Math.floor(kept.length / 2)]! * 100) / 100 : null;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

/** A map image with detail at every scale. */
function mapTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP;
  const context = canvas.getContext('2d')!;
  const random = seeded(7);
  for (let y = 0; y < MAP; y += 128) {
    for (let x = 0; x < MAP; x += 128) {
      context.fillStyle = `hsl(${30 + random() * 40}, ${20 + random() * 30}%, ${35 + random() * 30}%)`;
      context.fillRect(x, y, 128, 128);
    }
  }
  return Texture.from(canvas);
}

/** Rooms of 512 px with a door gap in every wall. */
function rooms(): WallSegment[] {
  const walls: WallSegment[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number): void => {
    walls.push({ id: `w${walls.length}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
  };
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j < 8; j++) {
      const a = j * 512, b = i * 512;
      add(a, b, a + 200, b); add(a + 312, b, a + 512, b);
      add(b, a, b, a + 200); add(b, a + 312, b, a + 512);
    }
  }
  return walls;
}

interface Scene {
  renderer: WebGLRenderer;
  frames: PlayerFrameTexture;
  /** The DM's own render of the pane. */
  own(): void;
  /** One mirrored frame: the players' frame rendered and brought to a 2D canvas. The DM's render must follow. */
  mirrored(frame: PlayerFrame): void;
  destroy(): void;
}

/** A lit scene as a map view renders it: a map image, a grid, 40 tokens with bars and names, 288 walls, 16 lights and four tokens that see. */
async function scene(resolution: number): Promise<Scene> {
  const renderer = new WebGLRenderer();
  await renderer.init({ ...PANE, antialias: true, useBackBuffer: true, backgroundAlpha: 1, backgroundColor: 0x101010, resolution, autoDensity: true });
  const stage = new Container();
  const world = new Container();
  stage.addChild(world);
  const art = mapTexture();
  world.addChild(new Sprite(art));
  const grid = new Graphics();
  for (let p = 0; p <= MAP; p += 70) grid.moveTo(p, 0).lineTo(p, MAP).moveTo(0, p).lineTo(MAP, p);
  grid.stroke({ color: 0x000000, alpha: 0.4, pixelLine: true });
  world.addChild(grid);
  const random = seeded(3);
  const sources: SightSource[] = [];
  const plates = new Container();
  for (let i = 0; i < 40; i++) {
    const x = 800 + random() * 2500, y = 1100 + random() * 1900;
    const token = new Graphics().circle(0, 0, 33).fill(0xcc3333).circle(0, 0, 35).stroke({ width: 3, color: 0x3399ff });
    token.position.set(x, y);
    world.addChild(token);
    const plate = new Container();
    const name = new Text({ text: `Goblin ${i}`, style: { fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
    name.anchor.set(0.5, 0);
    name.position.set(0, 48);
    plate.addChild(new Graphics().roundRect(-30, 38, 60, 8, 3).fill(0x222222).roundRect(-29, 39, 40, 6, 2).fill(0x44cc44), name);
    plate.position.set(x, y);
    plates.addChild(plate);
    if (i < 4) sources.push({ tokenId: `t${i}`, origin: { x, y }, range: 1200, senses: [] });
  }
  const engine = new LightingEngine(renderer);
  engine.setEnabled(true);
  const walls = rooms();
  const lights: EngineLight[] = Array.from({ length: 16 }, (_, i) => ({
    key: `l${i}`, x: 1024 + random() * 2048, y: 1024 + random() * 2048, bright: 300, dim: 600, flame: 40, color: [1, 0.8, 0.6], intensity: 1, animation: 'none',
  }));
  const lit: EngineScene = { bounds: { width: MAP, height: MAP }, albedo: art, walls, lights, sight: computeSight(sources, walls), sightRadius: 33, ambient: 0.15 };
  engine.update(lit);
  engine.flush();
  world.addChild(engine.layer, plates);
  engine.layer.onRender = (): void => engine.setView(new Matrix(world.scale.x, 0, 0, world.scale.y, world.x, world.y).invert(), world.scale.x);
  const camera = (width: number, height: number, scale: number): void => {
    world.scale.set(scale);
    world.position.set(width / 2 - (MAP / 2) * scale, height / 2 - (MAP / 2) * scale);
  };
  const frames = new PlayerFrameTexture(renderer);
  const target = document.createElement('canvas');
  const context = target.getContext('2d')!;
  const own = (): void => {
    engine.setMode('gm');
    camera(PANE.width, PANE.height, GM_SCALE);
    renderer.render({ container: stage });
  };
  return {
    renderer, frames, own,
    mirrored(frame): void {
      if (target.width !== frame.width || target.height !== frame.height) {
        target.width = frame.width;
        target.height = frame.height;
      }
      engine.setMode('player');
      camera(frame.width / frame.resolution, frame.height / frame.resolution, frame.scale);
      frames.render(stage, frame);
      frames.copy((piece) => context.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height, piece.left, piece.top, piece.width, piece.height));
    },
    destroy(): void {
      frames.destroy();
      engine.destroy();
      stage.destroy({ children: true });
      art.destroy(true);
      renderer.destroy();
    },
  };
}

interface Cost {
  paneRatio: number;
  window: string;
  frame: string;
  pieces: number;
  /** GPU milliseconds of the DM's own render: on its own, and right after a mirrored frame. */
  ownRender: number | null;
  ownRenderAfterFrame: number | null;
  /** GPU milliseconds of one mirrored frame, without the DM's render that follows. The copies onto the 2D canvas are not in it. */
  mirroredFrame: number | null;
}

describe('what a players\' frame of the player window\'s size costs', () => {
  it('prints the GPU time of a mirrored frame and of the DM\'s own render beside it (budget with VITE_PERF_STRICT)', { timeout: 600_000 }, async (ctx) => {
    const costs: Cost[] = [];
    let gpu = 'unknown';
    for (const paneRatio of [1, 2]) {
      const s = await scene(paneRatio);
      try {
        const gl = s.renderer.gl as WebGL2RenderingContext;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : gpu;
        const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
        const ext = timer && !gpu.includes('SwiftShader') ? timer : null;
        const view = { centerX: MAP / 2, centerY: MAP / 2, width: PANE.width / GM_SCALE, height: PANE.height / GM_SCALE };
        const pane = { ...PANE, resolution: paneRatio };
        for (let i = 0; i < 10; i++) s.own();
        const alone: (number | null)[] = [];
        for (let i = 0; i < SAMPLES; i++) alone.push(await gpuMs(gl, ext, s.own));
        for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]] as const) {
          // As the mirror asks for it: the window's own pixels up to the budget
          const frame = playerFrame({ width, height, resolution: 1 }, view, pane)!;
          for (let i = 0; i < 10; i++) {
            s.mirrored(frame);
            s.own();
          }
          const mirrored: (number | null)[] = [];
          const after: (number | null)[] = [];
          for (let i = 0; i < SAMPLES; i++) {
            mirrored.push(await gpuMs(gl, ext, () => s.mirrored(frame)));
            after.push(await gpuMs(gl, ext, s.own));
          }
          costs.push({
            paneRatio, window: `${width}x${height}`, frame: `${frame.width}x${frame.height}${frame.antialias ? ' smoothed' : ''}`,
            pieces: Math.ceil(frame.width / s.renderer.canvas.width) * Math.ceil(frame.height / s.renderer.canvas.height),
            ownRender: median(alone), ownRenderAfterFrame: median(after), mirroredFrame: median(mirrored),
          });
        }
      } finally {
        s.destroy();
      }
    }
    const figures = `players' frame cost (${gpu}):\n${costs.map((cost) => JSON.stringify(cost)).join('\n')}`;
    await ctx.annotate(figures, 'performance');
    console.info(figures);
    expect(costs).toHaveLength(6);
    // A 4K window is rendered within the budget, or with the pixels of a pane that has more
    expect(costs.filter((cost) => cost.window === '3840x2160').map((cost) => cost.frame)).toEqual(['2560x1440 smoothed', '2613x1470']);
    if (STRICT) {
      for (const cost of costs) {
        if (cost.ownRender === null || cost.ownRenderAfterFrame === null) continue;
        // The DM's render costs what it did
        expect(cost.ownRenderAfterFrame).toBeLessThanOrEqual(cost.ownRender * 1.5 + 0.5);
      }
    }
  });
});
