// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { UIManager } from '../../src/app/pixi/token-renderer/UIManager';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { AMMO, HP } from '../mocks/resourceFixtures';

const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0,
  resources: { hp: { current: 7, max: 10 }, ammo: { current: 4, max: 6 } } };

let restoreGraphics: () => void;
beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
afterEach(() => restoreGraphics());

/** A GM view with one token, its players' copy of the token UI built as a frame builds it. */
function playersFrame(seen: boolean): { manager: UIManager; players: Container } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `player-wheels-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero } } });
  const viewport = Object.assign(new Container(), { options: {} }) as unknown as Viewport;
  const manager = new UIManager(viewport, store, 'test', false);
  manager.resourceDefsProvider = () => [HP, { ...AMMO, visibleToPlayers: true, slot: 2 }];
  const sprite = Object.assign(new Container(), { tokenSize: 62 }) as TokenGroupContainer;
  manager.setTokenSpriteProvider(() => sprite);
  manager.createTokenUI('hero', sprite, hero);
  const layers = manager.getPlayerViewLayers({ showTokenNameplates: false }, () => seen);
  const players = layers.find(({ layer, visible }) => visible && layer !== manager.getUIContainer())!.layer as Container;
  return { manager, players };
}

it('draws the wheels players see in their frame, inside the token\'s own UI', () => {
  const { manager, players } = playersFrame(true);
  try {
    const tokenUI = players.children[0] as Container;
    expect(tokenUI.renderable).toBe(true);
    // The anchor beside the token holds the wheels of its right side, at rest
    const rightWheels = (tokenUI.children[1] as Container).children[0] as Container;
    expect(rightWheels.visible).toBe(true);
    expect(rightWheels.children).toHaveLength(1);
  } finally { manager.destroyAll(); }
});

it('leaves the wheels out with a token the players do not see', () => {
  const { manager, players } = playersFrame(false);
  try {
    expect((players.children[0] as Container).renderable).toBe(false);
  } finally { manager.destroyAll(); }
});
