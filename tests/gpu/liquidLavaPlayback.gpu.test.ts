import { Container, RenderTexture, Ticker, UniformGroup, WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LightFlicker } from '../../src/app/pixi/lighting/lightFlicker';
import { LiquidLayer, type LiquidLayerDeps } from '../../src/app/pixi/liquids/LiquidLayer';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import { liquidDetail } from '../../src/app/pixi/liquids/viewLiquids';
import type { LiquidSurface } from '../../src/app/types/liquidTypes';
import { activeLights, engineLight } from '../../src/app/vision/lightSources';

const lava: LiquidSurface = {
  id: 'cut-half', kind: 'liquid', liquid: 'lava', lavaLight: 'whole-lava-area',
  polygon: [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 240 }, { x: 0, y: 240 }],
  colors: { surface: '#d66028', deep: '#702414', glint: '#f09646' },
};

function glow(mesh: LiquidMesh): number {
  const group = mesh.mesh.shader.resources.liquid;
  if (!(group instanceof UniformGroup)) throw new Error('No liquid uniforms');
  return group.uniforms.uLavaGlow as number;
}

describe('lava playback and light coherence', () => {
  let renderer: WebGLRenderer;
  beforeAll(async () => { renderer = new WebGLRenderer(); await renderer.init({ width: 240, height: 240 }); });
  afterAll(() => renderer.destroy());

  it('uses the linked light phase at the lighting clock, even when a bridge split the lava', () => {
    const a = new LiquidMesh(lava, 90);
    const b = new LiquidMesh({ ...lava, id: 'other-half' }, 90);
    const light = new LightFlicker();
    const placed = activeLights({ linked: { id: lava.lavaLight!, kind: 'light', x: 120, y: 120, area: lava.polygon, emission: { kind: 'custom', bright: 5, dim: 10, color: '#ff6622', intensity: 1, animation: 'smoulder' } } }, {});
    const source = engineLight(placed[0]!, { cellSize: 90, unitDistance: 5 });
    try {
      for (const at of [0, 30, 123456, 4096000, 86400000]) {
        a.setTime(20, at);
        b.setTime(20, at);
        expect(glow(a)).toBeCloseTo(light.sample(source.key, source.animation, at).intensity, 7);
        expect(glow(a)).toBe(glow(b));
      }
      a.setDetail(0);
      a.setTime(20, 123456);
      expect(glow(a)).toBe(1);
    } finally { a.destroy(); b.destroy(); }
  });

  it('holds poster and pause pixels, restores captures, and observes each frame budget', () => {
    for (const fps of [30, 15, 10]) {
      const ticker = new Ticker();
      ticker.autoStart = false;
      let now = 100000;
      let requests = 0;
      const state = { grid: { size: 90 }, objects: { liquids: { lava } } } as ReturnType<LiquidLayerDeps['store']['getState']>;
      const layer = new LiquidLayer({ store: { getState: () => state, subscribe: () => () => undefined }, ticker, now: () => now, inView: () => true, drawable: true, fps: () => fps, detail: () => liquidDetail(fps), requestRender: () => { requests++; } });
      const target = RenderTexture.create({ width: 240, height: 240 });
      const picture = (): Uint8ClampedArray => {
        renderer.render({ container: layer.container, target, clear: true });
        return new Uint8ClampedArray(renderer.extract.pixels({ target }).pixels);
      };
      const tick = (): void => { now += 1000 / 60; ticker.update(now); };
      try {
        layer.buildPending();
        layer.setMode('poster');
        const poster = picture();
        for (let i = 0; i < 20; i++) tick();
        expect(picture()).toEqual(poster);
        layer.setMode('play');
        requests = 0;
        for (let i = 0; i < 60; i++) tick();
        expect(requests).toBeLessThanOrEqual(fps + 1);
        const moving = picture();
        expect(moving).not.toEqual(poster);
        const restore = layer.stillFor();
        expect(picture()).toEqual(poster);
        restore();
        expect(picture()).toEqual(moving);
        layer.setMode('pause');
        for (let i = 0; i < 20; i++) tick();
        expect(picture()).toEqual(moving);
      } finally { layer.destroy(); ticker.destroy(); target.destroy(true); }
    }
  });

  it('keeps the material continuous as drifts and the shader clock wrap', () => {
    const mesh = new LiquidMesh(lava, 90);
    const world = new Container();
    world.addChild(mesh.mesh);
    const target = RenderTexture.create({ width: 240, height: 240 });
    const picture = (seconds: number): Uint8ClampedArray => {
      mesh.setTime(seconds);
      renderer.render({ container: world, target, clear: true });
      return new Uint8ClampedArray(renderer.extract.pixels({ target }).pixels);
    };
    try {
      for (const at of [4096, 64 / 0.012, 64 / 0.01]) {
        const a = picture(at - 1 / 60);
        const b = picture(at + 1 / 60);
        let delta = 0;
        for (let i = 0; i < a.length; i++) delta += Math.abs(a[i]! - b[i]!);
        expect(delta / a.length).toBeLessThan(1);
      }
    } finally { mesh.destroy(); world.destroy(); target.destroy(true); }
  });
});
