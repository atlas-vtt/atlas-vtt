import { describe, it, expect } from 'vitest';
import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Texture, Sprite } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { mapImageViewOf } from '../helpers/fakeMapImageView';

async function setup() {
  const app = new Application();
  await app.init();
  const viewport = new Viewport({ screenWidth:800, screenHeight:600, events:(app.renderer as any).events });
  app.stage.addChild(viewport);
  const bg = new Sprite(Texture.WHITE);
  viewport.addChildAt(bg, 0);
  const grid = new GridSystem(app, viewport, mapImageViewOf(bg), { size:70, color: 0x000000 });
  const gridSprite = grid.getGridSprite()!;
  return { viewport, bg, gridSprite };
}

describe.skip('Layer order (requires WebGL)', () => {
  it('grid sprite renders after background', async () => {
    const { viewport, bg, gridSprite } = await setup();
    expect(viewport.children.indexOf(gridSprite)).toBeGreaterThan(viewport.children.indexOf(bg));
  });
}); 