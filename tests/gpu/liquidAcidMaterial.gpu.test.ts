import { Container, RenderTexture, WebGLRenderer } from 'pixi.js';
import { expect, it } from 'vitest';
import { LiquidMesh } from '../../src/app/pixi/liquids/LiquidMesh';

it('lays pigment over the illustration without additive light', async () => {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: 256, height: 256 });
  const mesh = new LiquidMesh({ id: 'acid-ink-test', kind: 'liquid', liquid: 'acid', polygon: [{ x: 0, y: 0 }, { x: 256, y: 0 }, { x: 256, y: 256 }, { x: 0, y: 256 }], colors: { surface: '#ffffff', deep: '#ffffff', glint: '#ffffff' } }, 100);
  const world = new Container();
  world.addChild(mesh.mesh);
  const target = RenderTexture.create({ width: 256, height: 256 });
  try {
    let excess = 0;
    for (const seconds of [0, 0.5, 2, 7]) {
      mesh.setTime(seconds);
      renderer.render({ container: world, target, clear: true, clearColor: [0, 0, 0, 0] });
      // readPixels keeps premultiplication, whereas PIXI extract unpremultiplies it.
      const pixels = new Uint8Array(256 * 256 * 4);
      renderer.gl.readPixels(0, 0, 256, 256, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
      for (let k = 0; k < pixels.length; k += 4) if (pixels[k]! > pixels[k + 3]! + 1) excess++;
    }
    expect(excess).toBe(0);
    const picture = (time: number): Uint8Array => {
      mesh.setTime(time);
      renderer.render({ container: world, target, clear: true, clearColor: [0, 0, 0, 0] });
      const pixels = new Uint8Array(256 * 256 * 4);
      renderer.gl.readPixels(0, 0, 256, 256, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const beforeWrap = picture(4096 - 1 / 60);
    const afterWrap = picture(4096 + 1 / 60);
    const delta = afterWrap.reduce((sum, value, index) => sum + Math.abs(value - beforeWrap[index]!), 0) / afterWrap.length;
    expect(delta).toBeLessThan(0.5);
  } finally { mesh.destroy(); world.destroy(); target.destroy(true); renderer.destroy(); }
});
