// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, FederatedPointerEvent, Rectangle, Text, loadEnvironmentExtensions, updateRenderGroupTransforms } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { barDimensions } from '../../src/app/styles/designTokens';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { AMMO, ARMOR, HP, STR, STRESS, wireControls } from '../mocks/resourceFixtures';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('resource bar controls', () => {
  beforeAll(async () => {
    // Pixi installs the pointer-event mixin lazily with the browser environment, which a renderer normally triggers.
    await loadEnvironmentExtensions(false);
  });

  function mount(resources: NonNullable<Character['resources']>, definitions: readonly ResourceDefinition[] = [HP, STRESS]) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.body.createEl('canvas');
    const viewport = Object.assign(new Container(), { options: { events: { domElement: canvas } } }) as Viewport;
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `resource-controls-${Math.random()}`);
    const token = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0, resources } as Character;
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero: token } } });
    const controls = new TokenControlsUI(viewport, store);
    wireControls(controls, store, definitions);
    controls.show('hero', 0, 0, 70, 1);
    /** Every control, whichever anchor holds it; each click area is followed by its minus and plus buttons. */
    const all = (node: Container): Container[] => node.children.flatMap((child) => [child, ...all(child)]);
    const hits = all(controls.getContainer()).filter((c): c is ResourceBarHitArea => c instanceof ResourceBarHitArea);
    const top = (hit: ResourceBarHitArea): number => (hit as unknown as { slot: { top: number } }).slot.top;
    const press = (target: Container): void => {
      const event = new FederatedPointerEvent(new EventBoundary(viewport));
      event.nativeEvent = new MouseEvent('pointerdown', { cancelable: true });
      target.emit('pointerdown', event);
    };
    const minus = (hit: ResourceBarHitArea): Container => hit.parent!.children[hit.parent!.children.indexOf(hit) + 1]!;
    const plus = (hit: ResourceBarHitArea): Container => hit.parent!.children[hit.parent!.children.indexOf(hit) + 2]!;
    const commit = (value: string): void => {
      const input = document.querySelector<HTMLInputElement>('.atlas-token-value-editor__input')!;
      input.value = value;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    };
    const stored = (): Character => store.getState().objects.tokens.hero as Character;
    return { controls, viewport, hits, top, press, minus, plus, commit, stored, store };
  }

  it('stays above tokens added to the map after it', () => {
    const { controls, viewport } = mount({ hp: { current: 5, max: 10 } });
    // The token layer joins the viewport after the controls, as TokenRenderer does
    const tokens = new Container();
    viewport.addChild(tokens);
    viewport.sortChildren();
    expect(viewport.getChildIndex(controls.getContainer())).toBeGreaterThan(viewport.getChildIndex(tokens));
  });

  it('edits the resource whose bar was clicked', () => {
    const { controls, viewport, hits, press, commit, stored } = mount({ hp: { current: 100, max: 100 }, stress: { current: 0, max: 10 } });
    try {
      expect(hits.map((hit) => hit.visible)).toEqual([true, true]);
      press(hits[0]!);
      commit('80');
      press(hits[1]!);
      commit('4');
      expect(stored().resources).toEqual({ hp: { current: 80, max: 100 }, stress: { current: 4, max: 10 } });
      expect(stored().overriddenMax).toBeUndefined();
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('takes damage typed as a sum, halved damage rounded down (issues #495, #396)', () => {
    const { controls, viewport, hits, press, commit, stored } = mount({ hp: { current: 30, max: 30 } });
    try {
      press(hits[0]!);
      commit('-10-5');
      expect(stored().resources?.hp).toEqual({ current: 15, max: 30 });
      press(hits[0]!);
      commit('-9/2');
      expect(stored().resources?.hp).toEqual({ current: 11, max: 30 });
      press(hits[0]!);
      commit('-2*3');
      expect(stored().resources?.hp).toEqual({ current: 5, max: 30 });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('changes only its own resource when another one changed since the controls were shown', () => {
    const { controls, viewport, hits, press, minus, stored, store } = mount({ hp: { current: 10, max: 10 }, stress: { current: 0, max: 6 } });
    try {
      // Stress marked elsewhere, e.g. in the DM Dashboard
      store.getState().updateToken('hero', { resources: { hp: { current: 10, max: 10 }, stress: { current: 3, max: 6 } } });
      press(minus(hits[0]!));
      expect(stored().resources).toEqual({ hp: { current: 9, max: 10 }, stress: { current: 3, max: 6 } });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('gives the bars and the wheels their own controls, each beside its resource', () => {
    const LUCK = { ...AMMO, key: 'luck', name: 'Luck', field: 'luck' };
    const { controls, viewport, hits, minus, plus, press, stored } = mount(
      { hp: { current: 3, max: 8 }, str: { current: 12, max: 14 }, ammo: { current: 4, max: 6 }, luck: { current: 2, max: 5 } }, [HP, STR, AMMO, LUCK]);
    try {
      expect(hits).toHaveLength(4);
      expect(hits.every((hit) => hit.visible)).toBe(true);
      const [, , ammo, luck] = hits;
      // Wheels hang from the token's right edge, bars from its bottom edge
      expect(ammo!.parent).toBe(luck!.parent);
      expect(ammo!.parent).not.toBe(hits[0]!.parent);
      // A stepper on the outer side: + above -, both right of the wheel
      expect(plus(ammo!).y).toBeLessThan(minus(ammo!).y);
      expect(plus(ammo!).x).toBe(minus(ammo!).x);
      const slot = (ammo as unknown as { slot: { left: number; width: number } }).slot;
      expect(plus(ammo!).x).toBeGreaterThan(slot.left + slot.width);
      press(minus(ammo!));
      press(plus(luck!));
      expect(stored().resources).toEqual({ hp: { current: 3, max: 8 }, str: { current: 12, max: 14 }, ammo: { current: 3, max: 6 }, luck: { current: 3, max: 5 } });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('opens the value editor from a wheel', () => {
    const { controls, viewport, hits, press, commit, stored } = mount(
      { hp: { current: 3, max: 8 }, str: { current: 12, max: 14 }, ammo: { current: 4, max: 6 } }, [HP, STR, AMMO]);
    try {
      press(hits[2]!);
      commit('1');
      expect(stored().resources!.ammo).toEqual({ current: 1, max: 6 });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('spends only the resource whose minus button was pressed', () => {
    const { controls, viewport, hits, press, minus, stored } = mount({ hp: { current: 3, max: 8 }, str: { current: 12, max: 14 } }, [HP, STR]);
    try {
      press(minus(hits[1]!));
      expect(stored().resources).toEqual({ hp: { current: 3, max: 8 }, str: { current: 11, max: 14 } });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('puts a resource on the top bar when the one before it is not defined', () => {
    const { controls, viewport, hits, top } = mount({ hp: { current: 5, max: 5 }, stress: { current: 1, max: 4 } }, [STRESS]);
    try {
      expect(hits).toHaveLength(1);
      expect(top(hits[0]!)).toBe(2);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('stacks the overlays like the bars', () => {
    const { controls, viewport, hits, top } = mount({ hp: { current: 5, max: 5 }, stress: { current: 1, max: 4 } });
    try {
      expect(top(hits[0]!)).toBe(2);
      expect(top(hits[1]!)).toBe(2 + barDimensions.token.height + barDimensions.token.gap);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('routes pointer hits on each drawn bar to that bar\'s overlay', () => {
    const { controls, viewport, hits, top } = mount({ hp: { current: 100, max: 100 }, stress: { current: 0, max: 10 } });
    const stage = new Container({ isRenderGroup: true });
    try {
      viewport.eventMode = 'static';
      viewport.hitArea = new Rectangle(-1000, -1000, 2000, 2000);
      stage.addChild(viewport);
      controls.setScaleFor('hero', 1.5);
      updateRenderGroupTransforms(stage.renderGroup!, true);
      // Token of 70px centred at the origin: the bars hang from its bottom edge at the controls' scale.
      const hitBarCentre = (hit: ResourceBarHitArea): Container | null =>
        new EventBoundary(stage).hitTest(0, 35 + 1.5 * (top(hit) + barDimensions.token.height / 2));
      expect(hitBarCentre(hits[0]!)).toBe(hits[0]);
      expect(hitBarCentre(hits[1]!)).toBe(hits[1]);
    } finally { controls.destroy(); stage.destroy({ children: true }); }
  });

  it('gives a static value no buttons and no click area: it does not change in play', () => {
    const { hits } = mount({ hp: { current: 5, max: 5 }, armor: { current: 15, max: 15 } }, [HP, ARMOR]);
    expect(hits).toHaveLength(1);
  });
});

describe('conditions card', () => {
  it('shows on a plain hover only, not while the token is selected or held', () => {
    restoreGraphics = stubJsdomGraphics();
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `conditions-card-${Math.random()}`);
    const ui = new TokenUIRenderer(store);
    ui.conditionDefsProvider = () => [{ id: 'prone', name: 'Prone', color: '#8e44ad' }];
    const card = (): boolean =>
      (ui as unknown as { conditionUI: { card: { container: { visible: boolean } } } }).conditionUI.card.container.visible;
    try {
      ui.update({ id: 'a', kind: 'character', name: 'A', imagePath: '', x: 0, y: 0, conditions: ['prone'] } as Character, 62);
      ui.setHoverState(true);
      expect(card()).toBe(true);
      ui.setHeld(true);
      expect(card()).toBe(false);
      ui.setHeld(false);
      ui.setSelectionState(true);
      expect(card()).toBe(false);
      ui.setSelectionState(false);
      ui.setHoverState(true, true);
      expect(card()).toBe(false);
    } finally {
      ui.destroy();
    }
  });
});
