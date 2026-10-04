import { expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { UIManager } from '../../src/app/pixi/token-renderer/UIManager';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';

// Text rasterization requires a GPU/canvas; keep the real display tree and UI manager.
vi.mock('../../src/app/pixi/TokenUIRenderer', async () => {
  const { Container } = await import('pixi.js');
  return { TokenUIRenderer: class {
    container = new Container();
    update = vi.fn();
    destroy = vi.fn();
    getContainer() { return this.container; }
  } };
});

it('renders separate player token overlays using the player settings and restores the DM layers', () => {
  const viewport = new Container();
  const token = { id: 'hero', kind: 'character', name: 'Hero', resources: { hp: { current: 10, max: 10 } } };
  const store = createStore(() => ({ grid: { size: 70 }, objects: { tokens: { hero: token } }, objectMask: { hidden: {}, ghost: {} } }));
  const manager = new UIManager(viewport as any, store as any, 'test', true);
  const sprite = new Container(); sprite.position.set(100, 200);
  manager.setTokenSpriteProvider(() => sprite);
  manager.createTokenUI('hero', sprite, token as any);
  const settings = { showTokenNameplates: true };
  const layers = manager.getPlayerViewLayers(settings);
  const playerLayer = layers.find(entry => entry.visible)!.layer as Container;
  captureWithLayerVisibility(layers, () => {}, () => {
    expect(manager.getUIContainer().visible).toBe(false);
    expect(playerLayer.visible).toBe(true);
    expect(playerLayer.children[0]?.position).toMatchObject({ x: 100, y: 200 });
  });
  expect(manager.getUIContainer().visible).toBe(true);
  expect(playerLayer.visible).toBe(false);
  manager.getPlayerViewLayers({ showTokenNameplates: false });
  expect(playerLayer.children).toHaveLength(1);
  manager.destroyTokenUI('hero');
  expect(playerLayer.children).toHaveLength(0);
  manager.destroyAll();
});
