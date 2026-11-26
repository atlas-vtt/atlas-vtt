// @vitest-environment jsdom
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
    setPlayersView = vi.fn();
    setPilePlace = vi.fn();
    showsConditionCard = vi.fn(() => false);
    showConditionCard = vi.fn();
    destroy = vi.fn();
    getContainer() { return this.container; }
  } };
});

it('renders separate player token overlays using the player settings and restores the DM layers', () => {
  const viewport = new Container();
  const token = { id: 'hero', kind: 'character', name: 'Hero', resources: { hp: { current: 10, max: 10 } } };
  const store = createStore(() => ({ grid: { size: 70 }, objects: { tokens: { hero: token } } }));
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

it('shows players the conditions card the GM\'s hover shows on a token', () => {
  const viewport = new Container();
  const token = { id: 'hero', kind: 'character', name: 'Hero', conditions: ['prone'] };
  const store = createStore(() => ({ grid: { size: 70 }, objects: { tokens: { hero: token } } }));
  const manager = new UIManager(viewport as any, store as any, 'test', true);
  const sprite = new Container();
  manager.setTokenSpriteProvider(() => sprite);
  manager.createTokenUI('hero', sprite, token as any);
  const gm = manager.getTokenUIs().hero as unknown as { showsConditionCard: ReturnType<typeof vi.fn> };
  gm.showsConditionCard.mockReturnValue(true);
  const layers = manager.getPlayerViewLayers({ showTokenNameplates: true });
  const player = (layers.find(entry => entry.visible)!.layer as Container).children[0]!;
  const playerUI = Object.values((manager as unknown as { playerTokenUIs: Record<string, { getContainer(): Container; showConditionCard: ReturnType<typeof vi.fn> }> }).playerTokenUIs)[0]!;
  expect(playerUI.getContainer()).toBe(player);
  expect(playerUI.showConditionCard).toHaveBeenLastCalledWith(true);
  gm.showsConditionCard.mockReturnValue(false);
  manager.getPlayerViewLayers({ showTokenNameplates: true });
  expect(playerUI.showConditionCard).toHaveBeenLastCalledWith(false);
  manager.destroyAll();
});
