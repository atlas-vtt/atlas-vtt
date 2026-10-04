import '../setup/obsidianDom';
import type { EventEmitter } from 'events';
import { Container, EventEmitter as PixiEmitter, RenderTexture, Sprite, Texture, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SIZE = 256;
const MAP = 1024;

/** A map with a border and a pattern, so a sprite drawn from the wrong corners shows. */
function mapTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#d8c8a0';
  context.fillRect(0, 0, MAP, MAP);
  context.fillStyle = '#3080c0';
  context.fillRect(40, 40, MAP - 80, MAP - 80);
  context.fillStyle = '#40a040';
  for (let i = 0; i < 40; i++) context.fillRect((i * 97) % 900 + 60, (i * 53) % 900 + 60, 60, 60);
  return Texture.from(canvas);
}

/**
 * PIXI updates a renderable's vertices in place, at the slot it took in the last build of its
 * batch. A grid mask left visible while its grid was hidden was not in that build, so the next
 * zoom wrote its corners over the pin that took its slot and the map folded towards the pin.
 */
describe('the grid while it is switched off', () => {
  it('leaves the map and its pins as a full rebuild draws them when the GM zooms', async () => {
    const renderer = await createTestRenderer(SIZE);
    const store = createViewAtlasStore(createInMemoryApp().app, `grid-mask-${Math.random()}`);
    store.setState({ persistenceEnabled: false });
    const stage = new Container();
    const viewport = new Container({ sortableChildren: true });
    stage.addChild(viewport);
    const map = viewport.addChild(new Sprite(mapTexture()));
    // Pins are there before the map image has loaded; the grid comes with the map
    const pins = new PinRenderer(viewport as unknown as Viewport, new PixiEmitter() as unknown as EventEmitter, store, false);
    store.setState((state) => ({ objects: { ...state.objects, pins: {
      a: { id: 'a', kind: 'pin', x: 500, y: 300, icon: 'treasure', notePath: 'a.md' },
    } } }));
    const grid = new GridSystem({ renderer } as unknown as Application, viewport as unknown as Viewport, map, { size: 64 });
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    const zoom = (scale: number): void => {
      viewport.scale.set(scale);
      viewport.position.set(SIZE / 2 - (MAP / 2) * scale, SIZE / 2 - (MAP / 2) * scale);
      viewport.emit('zoomed', {});
    };
    const render = (): Uint8ClampedArray => {
      renderer.render({ container: stage, target, clear: true });
      return readRgba(renderer, target).slice();
    };

    try {
      zoom(0.25);
      render();
      grid.setEnabled(false);
      render();
      zoom(0.3);
      const incremental = render();
      stage.renderGroup.structureDidChange = true;
      const rebuilt = render();
      let differing = 0;
      for (let i = 0; i < rebuilt.length; i++) if (Math.abs(rebuilt[i]! - incremental[i]!) > 8) differing++;
      expect(differing).toBe(0);
    } finally {
      grid.destroy();
      pins.destroy();
      target.destroy(true);
      renderer.destroy();
    }
  });

  it('still clips the grid to the map once it is switched on again', async () => {
    const renderer = await createTestRenderer(SIZE);
    const viewport = new Container();
    const map = viewport.addChild(new Sprite(mapTexture()));
    const grid = new GridSystem({ renderer } as unknown as Application, viewport as unknown as Viewport, map, {
      size: 64, offsetX: 32, offsetY: 32, color: 0xff0000, alpha: 1, lineWidth: 4,
    });
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    try {
      grid.setEnabled(false);
      grid.setEnabled(true);
      // The map's top-left corner in the middle of the target, at full size: the grid's padding cell lies outside it
      viewport.position.set(SIZE / 2, SIZE / 2);
      renderer.render({ container: viewport, target, clear: true, clearColor: 0x000000 });
      const pixels = readRgba(renderer, target);
      let redOutside = 0;
      let redInside = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          const red = pixels[i]! > 200 && pixels[i + 1]! < 60 && pixels[i + 2]! < 60;
          if (!red) continue;
          if (x < SIZE / 2 || y < SIZE / 2) redOutside++;
          else redInside++;
        }
      }
      expect({ redOutside, gridShown: redInside > 0 }).toEqual({ redOutside: 0, gridShown: true });
    } finally {
      grid.destroy();
      target.destroy(true);
      renderer.destroy();
    }
  });
});
