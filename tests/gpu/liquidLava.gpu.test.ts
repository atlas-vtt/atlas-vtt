/// <reference types="vite/client" />
import { Container, RenderTexture, WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { DUNGEON_STYLES } from '../../src/app/dungeons/styleCatalog';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';
import { lavaDungeon, lavaGpuMs, lavaPng, LAVA_OUT, LAVA_SIZE } from './liquidLavaHarness';

const phase = import.meta.env.VITE_LAVA_CAPTURE as string | undefined;
const only = import.meta.env.VITE_LAVA_LOOK as string | undefined;
const median = (samples: number[]): number | null => samples.length ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]! : null;

describe('lava in the generated map artwork', () => {
  let renderer: WebGLRenderer;
  beforeAll(async () => { renderer = new WebGLRenderer(); await renderer.init({ ...LAVA_SIZE, antialias: false }); });
  afterAll(() => renderer.destroy());
  for (const { id, style } of DUNGEON_STYLES) {
    if (only && !only.split(',').includes(id)) continue;
    for (const monochrome of [false, true]) {
      const name = `${id}${monochrome ? '-mono' : ''}`;
      it(`renders moving lava over ${name}`, async () => {
        const scene = lavaDungeon(id, monochrome);
        const target = RenderTexture.create(LAVA_SIZE);
        const pixels = (): Uint8ClampedArray => {
          renderer.render({ container: scene.world, target, clear: true });
          return new Uint8ClampedArray(renderer.extract.pixels({ target }).pixels);
        };
        try {
          scene.meshes.forEach(m => { m.mesh.visible = false; });
          const staticArt = pixels();
          if (phase) await lavaPng(staticArt, `${phase}/${name}/static`);
          scene.meshes.forEach(m => { m.mesh.visible = true; m.setTime(20); });
          const start = pixels();
          expect(start).not.toEqual(staticArt);
          if (!phase && monochrome) {
            const palette = paletteOf(style, { ...DEFAULT_VIEW, monochrome });
            const a = parseHex(palette.ink);
            const b = parseHex(palette.floor);
            for (const picture of [staticArt, start]) {
              let offPalette = 0;
              let count = 0;
              for (let y = 0; y < LAVA_SIZE.height; y += 3) for (let x = 0; x < LAVA_SIZE.width; x += 3) {
                if (!scene.meshes.some(m => pointInPolygon({ x, y }, m.surface.polygon) && !(m.surface.holes ?? []).some(h => pointInPolygon({ x, y }, h)))) continue;
                const at = (y * LAVA_SIZE.width + x) * 4;
                const rgb = [picture[at]!, picture[at + 1]!, picture[at + 2]!];
                const axis = b.map((c, i) => c - a[i]!);
                const t = Math.max(0, Math.min(1, rgb.reduce((sum, c, i) => sum + (c - a[i]!) * axis[i]!, 0) / axis.reduce((sum, c) => sum + c * c, 0)));
                const error = Math.hypot(...rgb.map((c, i) => c - a[i]! - t * axis[i]!));
                if (error > 35) offPalette++;
                count++;
              }
              expect(offPalette / count).toBeLessThan(0.05);
            }
          }
          if (phase) await lavaPng(start, `${phase}/${name}/still`);
          let last = start;
          let maxMeanStep = 0;
          for (let frame = 0; frame < (phase ? 90 : 3); frame++) {
            scene.meshes.forEach(m => m.setTime(20 + frame / 30));
            const next = pixels();
            let change = 0;
            for (let k = 0; k < next.length; k++) change += Math.abs(next[k]! - last[k]!);
            maxMeanStep = Math.max(maxMeanStep, change / next.length);
            if (phase) await lavaPng(next, `${phase}/${name}/frame-${String(frame).padStart(3, '0')}`);
            last = next;
          }
          expect(last).not.toEqual(start);
          expect(maxMeanStep).toBeLessThan(2);
        } finally { target.destroy(true); scene.destroy(); }
      });
    }
  }

  it('measures only the liquid draw at each quality on the GPU', async () => {
    const target = RenderTexture.create({ width: 1920, height: 1080 });
    const world = new Container();
    const mesh = new LiquidMesh({ id: 'lava-cost', kind: 'liquid', liquid: 'lava', polygon: [{ x: -500, y: -500 }, { x: 2400, y: -500 }, { x: 2400, y: 1600 }, { x: -500, y: 1600 }], colors: { surface: '#d6602a', deep: '#5c1a0c', glint: '#ffd27a' } }, 100);
    world.addChild(mesh.mesh);
    const rows: { quality: string; medianMs: number | null; samples: number[] }[] = [];
    try {
      for (const [quality, detail] of [['high', 2], ['balanced', 1], ['saver', 0]] as const) {
        mesh.setDetail(detail);
        const draw = (): void => renderer.render({ container: world, target, clear: true });
        for (let i = 0; i < 12; i++) draw();
        const samples: number[] = [];
        for (let i = 0; i < 21; i++) {
          mesh.setTime(20 + i / 30);
          const ms = await lavaGpuMs(renderer, draw);
          if (ms !== null) samples.push(ms);
        }
        rows.push({ quality, medianMs: median(samples), samples });
      }
      const gl = renderer.gl;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : 'unknown';
      const report = { gpu, size: '1920x1080', cell: 100, rows };
      console.log('[lava GPU]', JSON.stringify(report));
      if (phase) await commands.writeFile(`${LAVA_OUT}/${phase}/gpu.json`, JSON.stringify(report, null, 2));
      expect(rows).toHaveLength(3);
    } finally { mesh.destroy(); world.destroy(); target.destroy(true); }
  });
});
