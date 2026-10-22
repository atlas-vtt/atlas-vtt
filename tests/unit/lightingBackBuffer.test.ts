// @vitest-environment jsdom
import { GlBackBufferSystem, type Renderer, type Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BackBufferHold, PLAIN_BACK_BUFFER_RESOLUTION } from '../../src/app/pixi/lighting/engine/backBuffer';

/**
 * PIXI's own back buffer system on a renderer without a GL context, set up as PIXI does for an
 * antialiased renderer, `always` drawing through the back buffer like the plugin's.
 * `BackBufferHold` writes private fields of it; these tests fail when a PIXI update stops reading
 * them for the texture it renders the canvas through.
 */
function backBufferFor(resolution: number, always = false): { renderer: WebGLRenderer; texture: () => Texture } {
  const canvasTexture = { width: 2880, height: 1720, _resolution: resolution };
  const renderer = {
    name: 'webgl',
    resolution,
    context: { supports: { msaa: true } },
    renderTarget: { getRenderTarget: () => ({ isRoot: true, colorTexture: canvasTexture }) },
  } as unknown as WebGLRenderer;
  const backBuffer = new GlBackBufferSystem(renderer);
  backBuffer.init({ useBackBuffer: always, antialias: true });
  Object.assign(renderer, { backBuffer });
  return {
    renderer,
    texture: () => {
      // What a render to the canvas starts with: PIXI swaps the target for its back buffer texture
      const options = { target: canvasTexture } as unknown as Parameters<GlBackBufferSystem['renderStart']>[0];
      backBuffer['renderStart'](options);
      return options.target as Texture;
    },
  };
}

describe('BackBufferHold', () => {
  it('gives PIXI a plain back buffer on a high-density display', () => {
    const { renderer, texture } = backBufferFor(PLAIN_BACK_BUFFER_RESOLUTION);

    new BackBufferHold(renderer).set(true);

    expect(texture().source.antialias).toBe(false);
    expect(texture().source.pixelWidth).toBe(2880 * PLAIN_BACK_BUFFER_RESOLUTION);
  });

  it('leaves the back buffer multisampled, like the canvas, below that', () => {
    const { renderer, texture } = backBufferFor(1);

    new BackBufferHold(renderer).set(true);

    expect(texture().source.antialias).toBe(true);
  });

  it('switches the back buffer off again and frees it, and never touches other renderers', () => {
    const { renderer, texture } = backBufferFor(PLAIN_BACK_BUFFER_RESOLUTION);
    const hold = new BackBufferHold(renderer);
    hold.set(true);
    const lit = texture().source;
    expect(renderer.backBuffer.useBackBuffer).toBe(true);

    hold.release();

    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    expect(lit.destroyed).toBe(true);

    const canvasRenderer = { name: 'canvas', resolution: 2 } as unknown as Renderer;
    expect(() => new BackBufferHold(canvasRenderer).set(true)).not.toThrow();
  });

  describe('on a renderer that always draws through its back buffer', () => {
    it('keeps the back buffer when lighting goes, multisampled again in a new texture', () => {
      const { renderer, texture } = backBufferFor(PLAIN_BACK_BUFFER_RESOLUTION, true);
      expect(texture().source.antialias).toBe(true);
      const hold = new BackBufferHold(renderer);

      hold.set(true);
      const lit = texture().source;
      expect(lit.antialias).toBe(false);

      hold.release();
      const unlit = texture().source;

      expect(renderer.backBuffer.useBackBuffer).toBe(true);
      expect(lit.destroyed).toBe(true);
      expect(unlit.antialias).toBe(true);
    });

    it('keeps the same texture where lighting needs no other', () => {
      const { renderer, texture } = backBufferFor(1, true);
      const unlit = texture();

      new BackBufferHold(renderer).set(true);

      expect(texture()).toBe(unlit);
      expect(unlit.source.antialias).toBe(true);
    });
  });
});
