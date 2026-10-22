// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, Graphics, Point, Text } from 'pixi.js';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import type { Viewport } from 'pixi-viewport';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { ResourceBarLabel, RESOURCE_NUMBER_GAP } from '../../src/app/pixi/ResourceBarLabel';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { barDimensions } from '../../src/app/styles/designTokens';
import { HP, STRESS, wireControls } from '../mocks/resourceFixtures';

const DEFINITIONS = [HP, STRESS];

const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0,
  resources: { hp: { current: 1, max: 50 }, stress: { current: 1, max: 50 } } };

function setup() {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'resource-bars');
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid, size: 70 },
    tokenSettings: { ...store.getState().tokenSettings, hiddenResources: [] },
    objects: { ...store.getState().objects, tokens: { hero } } });
  return store;
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

/** The UI drawn below the token, laid out from the token's bottom edge. */
const belowToken = (ui: TokenUIRenderer): Container => ui.getContainer().children[0] as Container;
/** One container per drawn bar: its track, its fill layer and its label. */
const barViews = (ui: TokenUIRenderer): Container[] => (belowToken(ui).children.find((c) => c.zIndex === 10) as Container).children as Container[];
const tokenUI = (): TokenUIRenderer => {
  const ui = new TokenUIRenderer(setup());
  ui.resourceDefsProvider = () => DEFINITIONS;
  return ui;
};

describe('resources hidden on a map', () => {
  const context = (): CanvasRenderingContext2D => ({ createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn() }) as unknown as CanvasRenderingContext2D;

  it('leaves no slots for controls once every bar is hidden', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context());
    const store = setup();
    const ui = new TokenUIRenderer(store);
    ui.resourceDefsProvider = () => DEFINITIONS;
    try {
      ui.update(hero, 70);
      expect(ui.getResourceSlots()).toHaveLength(2);
      store.setState({ tokenSettings: { ...store.getState().tokenSettings, hiddenResources: ['hp', 'stress'] } });
      ui.update(hero, 70);
      expect(ui.getResourceSlots()).toEqual([]);
    } finally { ui.destroy(); }
  });

  it('hides each resource on its own, as the two old switches did', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context());
    const store = setup();
    const ui = new TokenUIRenderer(store);
    ui.resourceDefsProvider = () => DEFINITIONS;
    try {
      store.setState({ tokenSettings: { ...store.getState().tokenSettings, hiddenResources: ['hp'] } });
      ui.update(hero, 70);
      // The bar that stays moves up to the first place, as before
      expect(ui.getResourceSlots().map((slot) => [slot.key, slot.top])).toEqual([['stress', 2]]);
    } finally { ui.destroy(); }
  });
});

describe('resource fill geometry', () => {
  it('refreshes a bar when only its maximum changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as CanvasRenderingContext2D);
    const ui = tokenUI();
    try {
      ui.update(hero, 70);
      ui.update({ ...hero, resources: { ...hero.resources, stress: { current: 1, max: 100 } } }, 70);
      const labels = barViews(ui).flatMap((bar) => bar.children[2]!.children).filter((c): c is Text => c instanceof Text && c.label === 'resource-max').map(c => c.text);
      expect(labels).toContain('100');
    } finally { ui.destroy(); }
  });

  it.each([0, 1])('keeps the rounded leading edge at low values for resource %i', (index) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as CanvasRenderingContext2D);
    const ui = tokenUI();
    try {
      ui.update(hero, 70);
      // Each fill layer holds the loss/gain trail and then the fill itself
      const fills = barViews(ui).map((bar) => (bar.children[1] as Container).children[1]);
      const fill = fills[index] as Graphics;
      const x = -32 + 0.375 + 1;
      const y = 2 + index * 12 + 0.375 + 1;
      const height = 10 - 0.75 - 2;
      const width = (64 - 0.75 - 2) / 50;
      expect(fill.containsPoint(new Point(x + width / 2, y + height / 2))).toBe(true);
      // Low fills must follow the track's curved cap, not turn into a vertical strip.
      expect(fill.containsPoint(new Point(x + width / 2, y + 1))).toBe(false);
      expect(fill.containsPoint(new Point(x + width + 0.1, y + height / 2))).toBe(false);
    } finally { ui.destroy(); }
  });
});

describe('resource label layout', () => {
  it('anchors both numbers against the central slash', () => {
    const label = new ResourceBarLabel();
    try {
      const [current, separator, max] = label.children as Text[];
      // Text metrics need a canvas, so check the anchoring that keeps each number flush to the slash.
      expect([current.anchor.x, current.position.x]).toEqual([1, -RESOURCE_NUMBER_GAP]);
      expect([separator.anchor.x, separator.position.x]).toEqual([0.5, 0]);
      expect([max.anchor.x, max.position.x]).toEqual([0, RESOURCE_NUMBER_GAP]);
      expect(RESOURCE_NUMBER_GAP).toBeLessThan(barDimensions.token.width / 8);
    } finally { label.destroy({ children: true }); }
  });
});

describe('resource value popover editing', () => {
  function mount() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.body.createEl('canvas');
    canvas.tabIndex = 0;
    const viewport = Object.assign(new Container(), { options: { events: { domElement: canvas } } }) as Viewport;
    const store = setup();
    const controls = new TokenControlsUI(viewport, store);
    wireControls(controls, store, DEFINITIONS);
    controls.show('hero', 0, 0, 70, 1);
    // Bars' controls hang from the anchor on the token's bottom edge, the container's first child
    const bars = (controls.getContainer().children[0] as Container).children.filter((c): c is ResourceBarHitArea => c instanceof ResourceBarHitArea);
    const click = (index: number, x = 0): void => {
      const target = bars[index]!;
      const event = new FederatedPointerEvent(new EventBoundary(viewport));
      event.nativeEvent = new MouseEvent('pointerdown', { cancelable: true });
      event.global.copyFrom(target.toGlobal({ x, y: 7 + index * 12 }));
      target.emit('pointerdown', event);
      // Model the browser's default canvas focus after pointerdown listeners finish.
      if (!event.nativeEvent.defaultPrevented) canvas.focus();
    };
    const inputs = (): HTMLInputElement[] => Array.from(document.querySelectorAll<HTMLInputElement>('.atlas-token-value-editor__input'));
    const key = (target: Element, key: string, init: KeyboardEventInit = {}): void => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    };
    const token = (): Character => store.getState().objects.tokens.hero as Character;
    return { store, controls, viewport, canvas, bars, click, inputs, key, token };
  }

  it('shows the whole bar as a pointer target and highlights it on hover', () => {
    const { bars, controls, viewport } = mount();
    try {
      const [hpBar] = bars;
      expect(hpBar!.cursor).toBe('pointer');
      expect(hpBar!.containsPoint(new Point(-30, 7))).toBe(true);
      expect(hpBar!.containsPoint(new Point(30, 7))).toBe(true);
      expect(hpBar!.containsPoint(new Point(0, 1))).toBe(false);
      // Idle draws only the transparent target; hover adds a ring around the bar.
      expect(hpBar!.context.instructions).toHaveLength(1);
      hpBar!.emit('pointerover');
      expect(hpBar!.context.instructions).toHaveLength(2);
      hpBar!.emit('pointerout');
      expect(hpBar!.context.instructions).toHaveLength(1);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it.each([0, 1])('opens a two-field popover below resource bar %i and focuses the current value', (index) => {
    const { click, inputs, controls, viewport, bars } = mount();
    try {
      click(index, 20);
      const popover = document.querySelector<HTMLElement>('.atlas-token-value-editor')!;
      expect(popover.getAttribute('aria-label')).toBe(`Edit ${index === 0 ? 'HP' : 'Stress'}`);
      const [current, max] = inputs();
      expect(current!.value).toBe('1');
      expect(max!.value).toBe('50');
      expect(document.activeElement).toBe(current);
      const barBottom = bars[index]!.toGlobal({ x: 0, y: 12 + index * 12 }).y;
      expect(parseFloat(popover.style.top)).toBeGreaterThan(barBottom);
      expect(parseFloat(popover.style.left)).toBeGreaterThanOrEqual(8);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('applies both values on Enter and records a maximum override', () => {
    const { click, inputs, key, token, controls, viewport } = mount();
    try {
      click(0);
      const [current, max] = inputs();
      current!.value = '7';
      max!.value = '60';
      key(max!, 'Enter');
      expect(token().resources?.hp).toEqual({ current: 7, max: 60 });
      expect(token().overriddenMax).toEqual(['hp']);
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();

      click(1);
      inputs()[0]!.value = '+3';
      key(inputs()[0]!, 'Enter');
      expect(token().resources?.stress).toEqual({ current: 4, max: 50 });
      expect(token().overriddenMax).toEqual(['hp']);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('steps the focused value with the arrow keys', () => {
    const { click, inputs, key, controls, viewport } = mount();
    try {
      click(0);
      const [current] = inputs();
      key(current!, 'ArrowUp');
      key(current!, 'ArrowUp', { shiftKey: true });
      expect(current!.value).toBe('12');
      key(current!, 'ArrowDown');
      expect(current!.value).toBe('11');
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('keeps the popover open with the bad field marked when a value is invalid', () => {
    const { click, inputs, key, token, controls, viewport } = mount();
    try {
      click(0);
      const [current, max] = inputs();
      max!.value = '0';
      key(current!, 'Enter');
      expect(document.querySelector('.atlas-token-value-editor')).not.toBeNull();
      expect(max!.hasAttribute('aria-invalid')).toBe(true);
      expect(document.activeElement).toBe(max);
      expect(token().resources?.hp).toEqual({ current: 1, max: 50 });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('discards on Escape and commits edited values when clicking outside', () => {
    const { click, inputs, key, token, controls, viewport, canvas } = mount();
    try {
      click(0);
      inputs()[0]!.value = '9';
      key(inputs()[0]!, 'Escape');
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
      expect(token().resources?.hp?.current).toBe(1);

      click(0);
      inputs()[0]!.value = '9';
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
      expect(token().resources?.hp?.current).toBe(9);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('follows the bar while the viewport moves and closes when the token is deselected', () => {
    const { click, controls, viewport } = mount();
    try {
      controls.getContainer().position.x = 100;
      click(0);
      const popover = document.querySelector<HTMLElement>('.atlas-token-value-editor')!;
      const before = parseFloat(popover.style.left);
      expect(before).toBe(100);
      controls.getContainer().position.x += 40;
      viewport.emit('moved');
      expect(parseFloat(popover.style.left)).toBeCloseTo(before + 40, 3);
      controls.hide();
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
      expect(viewport.listenerCount('moved')).toBe(0);
    } finally { controls.destroy(); viewport.destroy(); }
  });
});
