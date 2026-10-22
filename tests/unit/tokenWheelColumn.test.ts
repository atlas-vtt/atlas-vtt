// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { AMMO, HP, STR } from '../mocks/resourceFixtures';

const DEFINITIONS = [HP, STR, AMMO];
const hero: Character = { id: 'hero', kind: 'character', name: 'Gargoyle', showNameplate: true, imagePath: 'hero.png', x: 0, y: 0,
  resources: { hp: { current: 7, max: 10 }, str: { current: 14, max: 14 }, ammo: { current: 4, max: 6 } } };
/** How far the bars' + buttons reach from the token's centre, in UI units: half a bar, a gap and a button. */
const BUTTONS_REACH = 32 + 2 + 10;

let restoreGraphics: () => void;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => { restoreGraphics(); vi.useRealTimers(); document.body.replaceChildren(); });

/** A token UI on a 70 px grid at viewport `zoom`, where a selected token's UI grows. */
function tokenUI(zoom: number): TokenUIRenderer {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wheel-column-${Math.random()}`);
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid, size: 70 },
    objects: { ...store.getState().objects, tokens: { hero } } });
  const ui = new TokenUIRenderer(store);
  ui.resourceDefsProvider = () => DEFINITIONS;
  ui.zoomProvider = () => zoom;
  return ui;
}
const beside = (ui: TokenUIRenderer): Container => ui.getContainer().children[1] as Container;
/** Where the right wheels' column begins, in world units from the token's centre. */
const innerEdge = (ui: TokenUIRenderer): number => {
  const slot = ui.getResourceSlots().find((candidate) => candidate.kind === 'wheel')!;
  return beside(ui).position.x + slot.left * beside(ui).scale.x;
};

describe('the wheel column beside a token', () => {
  it('gives the bar buttons\' room back as the UI shrinks after deselection, without a jump', () => {
    const zoom = 0.5;
    const ui = tokenUI(zoom);
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      ui.setBarButtonsShown(true);
      vi.advanceTimersByTime(1000);
      expect(innerEdge(ui)).toBeGreaterThan(BUTTONS_REACH * beside(ui).scale.x);

      // As the app deselects: the controls go, then the UI eases back to rest. The buttons' room
      // eases with it: nothing moves before the next frame, then the column glides in.
      const selected = innerEdge(ui);
      ui.setBarButtonsShown(false);
      ui.setSelectionState(false);
      expect(innerEdge(ui)).toBe(selected);
      let previous = selected;
      for (let frame = 0; frame < 40; frame++) {
        vi.advanceTimersByTime(16);
        expect(innerEdge(ui)).toBeLessThanOrEqual(previous);
        previous = innerEdge(ui);
      }
      // At rest, just past the resize button again
      const atRest = tokenUI(zoom);
      atRest.update(hero, 62);
      expect(previous).toBeCloseTo(innerEdge(atRest));
      atRest.destroy();
    } finally { ui.destroy(); }
  });

  it('makes room for the bar buttons only while this token\'s controls show them', () => {
    const ui = tokenUI(0.5);
    try {
      ui.update(hero, 62);
      // One of several selected tokens: it grows, but its controls show no buttons
      ui.setSelectionState(true);
      vi.advanceTimersByTime(1000);
      const withoutButtons = innerEdge(ui);
      expect(withoutButtons).toBeLessThan(BUTTONS_REACH * beside(ui).scale.x);
      ui.setBarButtonsShown(true);
      expect(innerEdge(ui)).toBeGreaterThan(BUTTONS_REACH * beside(ui).scale.x);
    } finally { ui.destroy(); }
  });

  it('moves the wheels out while a longer name is typed into the nameplate', () => {
    const ui = tokenUI(1);
    try {
      ui.update(hero, 62);
      ui.setSelectionState(true);
      vi.advanceTimersByTime(1000);
      const before = innerEdge(ui);
      ui.startNameEdit();
      const input = document.querySelector<HTMLInputElement>('.atlas-offscreen-input')!;
      input.value = 'Ancient Red Dragon of the Northern Wastes';
      input.dispatchEvent(new Event('input'));
      const below = ui.getContainer().children[0] as Container;
      const plateRight = (below.children[0] as Container).getLocalBounds().maxX * below.scale.x;
      expect(plateRight).toBeGreaterThan(before);
      expect(innerEdge(ui)).toBeGreaterThan(plateRight);
    } finally { ui.destroy(); }
  });
});
