// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { MeasurePopoverHost } from '../../../src/app/react/components/measure/MeasurePopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

// jsdom lays nothing out: the view is 1200 × 800, the popover 272 × 160, and the map fills the view.
const VIEW = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
const restore: (() => void)[] = [];

function stub<T extends object>(target: T, key: string, descriptor: PropertyDescriptor): void {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  restore.push(() => (previous ? Object.defineProperty(target, key, previous) : delete (target as Record<string, unknown>)[key]));
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  stub(HTMLElement.prototype, 'offsetParent', { get(this: HTMLElement) { return this.parentElement; } });
  stub(HTMLElement.prototype, 'offsetWidth', { get: () => 272 });
  stub(HTMLElement.prototype, 'offsetHeight', { get: () => 160 });
  stub(HTMLElement.prototype, 'getBoundingClientRect', { value: () => VIEW });
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  restore.forEach((undo) => undo());
});
afterEach(cleanup);

interface Setup {
  store: ViewAtlasStore;
  /** A ruler of three squares from (300, 400), and a red circle of two from (900, 400). */
  ruler: string;
  circle: string;
  /** The tokens the map says lie in each measurement: none until a test puts some there. */
  tokensIn: Record<string, string[]>;
  measure: (id: string) => KeptMeasure | undefined;
  camera: { x: number; y: number; zoom: number };
  frame: () => void;
  popover: () => HTMLElement;
  position: () => { x: number; y: number };
  steps: () => number;
  undo: () => void;
}

function setup(): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `measure-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/measures.atlasmap');
  store.getState().setSnapToGrid(true);
  const ruler = store.getState().addMeasure({ shape: 'ruler', points: [{ x: 300, y: 400 }, { x: 510, y: 400 }] })!;
  const circle = store.getState().addMeasure({ shape: 'circle', points: [{ x: 900, y: 400 }, { x: 1040, y: 400 }], color: '#e93147', hidden: true })!;
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const tokensIn: Record<string, string[]> = {};
  const camera = { x: 0, y: 0, zoom: 1 };
  const viewport = {
    scale: { get x() { return camera.zoom; } },
    toScreen: (x: number, y: number) => ({ x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y }),
  };
  const ticks = new Set<() => void>();
  const pixiApp = { ticker: { add: vi.fn((tick: () => void) => ticks.add(tick)), remove: vi.fn((tick: () => void) => ticks.delete(tick)) } };
  const ui: AtlasUIContextValue = {
    app,
    view: null,
    pixiApp: pixiApp as unknown as Application,
    renderer: { getViewportInstance: () => viewport, getCanvasElement: () => document.createElement('canvas'), tokensInMeasure: (id: string) => tokensIn[id] ?? [] } as never,
  };
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><MeasurePopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  const popover = (): HTMLElement => screen.getByRole('dialog', { name: 'Measurement' });
  return {
    store, ruler, circle, tokensIn, camera, popover,
    measure: (id) => store.getState().objects.measures?.[id],
    frame: () => act(() => ticks.forEach((tick) => tick())),
    position: () => {
      const [x, y] = popover().style.translate.split(' ').map((value) => Number.parseFloat(value));
      return { x: x!, y: y! };
    },
    steps: () => history.getState().pastStates.length,
    undo: () => act(() => history.getState().undo()),
  };
}

describe('MeasurePopover', () => {
  it('is closed until a measurement is opened, then says what it is and measures and names every control', async () => {
    const { store, ruler, popover } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => store.getState().openMeasurePopover(ruler));
    expect(within(popover()).getByText('Ruler · 3 sq')).toBeTruthy();
    expect(within(popover()).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(
      ['Default', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Delete'],
    );
    expect(screen.getByRole('switch', { name: 'Players see it' }).getAttribute('aria-checked')).toBe('true');
    expect(popover().querySelector('[title]')).toBeNull();
    // Its controls come in this order, Delete last.
    const order = [...popover().querySelectorAll('.atlas-swatch-grid, [role="switch"], .atlas-light-popover__delete')].map((element) => element.className.split(' ')[0]);
    expect(order).toEqual(['atlas-swatch-grid', 'atlas-toggle', 'btn']);
    act(() => store.getState().closeMeasurePopover());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the other measurement when that one is opened: the same popover', () => {
    const { store, ruler, circle, popover } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    const element = popover();
    act(() => store.getState().openMeasurePopover(circle));
    expect(popover()).toBe(element);
    expect(within(element).getByText('Circle · 2 sq')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Red' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Players see it' }).getAttribute('aria-checked')).toBe('false');
  });

  it('gives the measurement a colour, and the theme\'s back with the first swatch, one undo step each', () => {
    const { store, ruler, measure, steps, undo } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    expect(screen.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Green' }));
    expect(measure(ruler)?.color).toBe('#08b94e');
    expect(screen.getByRole('button', { name: 'Green' }).getAttribute('aria-pressed')).toBe('true');
    expect(steps()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect(measure(ruler)).not.toHaveProperty('color');
    expect(steps()).toBe(2);
    undo();
    expect(measure(ruler)?.color).toBe('#08b94e');
  });

  it('keeps a measurement from the players, and shows it to them again without leaving a field behind', () => {
    const { store, ruler, measure, steps } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    const players = screen.getByRole('switch', { name: 'Players see it' });
    fireEvent.click(players);
    expect(measure(ruler)?.hidden).toBe(true);
    expect(players.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(players, { key: ' ' });
    expect(measure(ruler)).not.toHaveProperty('hidden');
    expect(steps()).toBe(2);
  });

  it('deletes the measurement in one undo step and closes; undo brings the measurement back, not the popover', async () => {
    const { store, ruler, measure, steps, undo } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(measure(ruler)).toBeUndefined();
    expect(store.getState().measurePopover).toBeNull();
    expect(steps()).toBe(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    undo();
    expect(measure(ruler)).toBeDefined();
    expect(store.getState().measurePopover).toBeNull();
  });

  it('takes the keyboard when it opens, closes on Escape and keeps its own keys from the map', () => {
    const { store, ruler, popover } = setup();
    const map = vi.fn();
    document.addEventListener('keydown', map);
    try {
      act(() => store.getState().openMeasurePopover(ruler));
      expect(document.activeElement).toBe(popover());
      fireEvent.keyDown(screen.getByRole('switch', { name: 'Players see it' }), { key: ' ' });
      fireEvent.keyDown(popover(), { key: 'Tab' });
      expect(map).not.toHaveBeenCalled();
      // Delete is the map's: it deletes the measurement whose popover is open.
      fireEvent.keyDown(popover(), { key: 'Delete' });
      expect(map).toHaveBeenCalledTimes(1);
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => { popover().dispatchEvent(escape); });
      expect(escape.defaultPrevented).toBe(true);
      expect(store.getState().measurePopover).toBeNull();
      expect(map).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', map);
    }
  });
});

describe('the popover of a kept area', () => {
  const controls = (popover: HTMLElement): string[] =>
    [...popover.querySelectorAll('.atlas-light-popover__heading, .atlas-swatch-grid, .atlas-light-popover__kinds, [role="switch"], .atlas-dungeon-stepper, .atlas-light-popover__actions button')]
      .map((element) => {
        if (element.classList.contains('atlas-swatch-grid')) return 'colours';
        if (element.classList.contains('atlas-light-popover__kinds')) return 'effects';
        const labelledBy = element.getAttribute('aria-labelledby');
        return (labelledBy ? document.getElementById(labelledBy)?.textContent : element.textContent) ?? '';
      });

  it('holds, in this order: what it is, its colour, its look, Gives light, Players see it, Stops at walls, a circle\'s Follows token, a line\'s Width, Select tokens and Delete', () => {
    const { store, circle, ruler, popover } = setup();
    const line = store.getState().addMeasure({ shape: 'line', points: [{ x: 300, y: 600 }, { x: 580, y: 600 }], width: 70 })!;
    act(() => store.getState().openMeasurePopover(circle));
    expect(controls(popover())).toEqual(['Circle · 2 sq', 'colours', 'effects', 'Gives light', 'Players see it', 'Stops at walls', 'Follows token', 'Select tokens', 'Delete']);
    act(() => store.getState().openMeasurePopover(line));
    expect(controls(popover())).toEqual(['Line · 4 sq', 'colours', 'effects', 'Gives light', 'Players see it', 'Stops at walls', 'Width', 'Select tokens', 'Delete']);
    // A ruler has neither a look nor a light.
    act(() => store.getState().openMeasurePopover(ruler));
    expect(controls(popover())).toEqual(['Ruler · 3 sq', 'colours', 'Players see it', 'Delete']);
  });

  it('gives an area a look in one step: the effect, its usual colour and, on a lit scene, the light it starts with', () => {
    const { store, circle, measure, steps, undo } = setup();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    act(() => store.getState().openMeasurePopover(circle));
    const chip = (name: string): HTMLElement => within(screen.getByRole('group', { name: 'Effect' })).getByRole('button', { name });
    expect(within(screen.getByRole('group', { name: 'Effect' })).getAllByRole('button').map((item) => item.getAttribute('aria-label'))).toEqual(['None', 'Fire', 'Frost', 'Lightning', 'Mist', 'Radiance', 'Shadow']);
    expect(chip('None').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip('Fire'));
    expect(measure(circle)).toMatchObject({ effect: 'fire', color: '#ec7500', light: { color: '#ec7500', animation: 'torch' } });
    expect(measure(circle)!.light!.dim).toBe(2 * measure(circle)!.light!.bright);
    expect(chip('Fire').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Gives light' }).getAttribute('aria-checked')).toBe('true');
    expect(steps()).toBe(1);
    // Frost starts without light; Shadow makes a circle a magical darkness, which has no ranges to set.
    fireEvent.click(chip('Frost'));
    expect(measure(circle)).toMatchObject({ effect: 'frost', color: '#8ad1f8' });
    expect(measure(circle)).not.toHaveProperty('light');
    fireEvent.click(chip('Shadow'));
    expect(measure(circle)!.light).toMatchObject({ darkness: true });
    expect(screen.getByRole('switch', { name: 'Magical darkness' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Bright')).toBeNull();
    // None takes the look away and leaves the rest.
    fireEvent.click(chip('None'));
    expect(measure(circle)).not.toHaveProperty('effect');
    expect(measure(circle)).toMatchObject({ color: '#7852ee', light: { darkness: true } });
    expect(steps()).toBe(4);
    undo();
    undo();
    undo();
    undo();
    expect(measure(circle)).toMatchObject({ color: '#e93147' });
    expect(measure(circle)).not.toHaveProperty('effect');
    expect(measure(circle)).not.toHaveProperty('light');
  });

  it('switches an area\'s light on with ranges sized by it and folds them away again, one undo step each', () => {
    const { store, circle, measure, steps } = setup();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    act(() => store.getState().openMeasurePopover(circle));
    const light = (): HTMLElement => screen.getByRole('switch', { name: 'Gives light' });
    expect(light().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Bright')).toBeNull();
    fireEvent.click(light());
    const emission = measure(circle)!.light!;
    // Its own red, steady, bright to its edge and dim as far again.
    expect(emission).toMatchObject({ color: '#e93147', animation: 'none', intensity: 1 });
    expect(emission.bright).toBeGreaterThan(0);
    expect(emission.dim).toBe(2 * emission.bright);
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe(String(emission.bright));
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe(String(emission.dim));
    // A typed range is the light's at once.
    fireEvent.change(screen.getByLabelText('Dim'), { target: { value: String(emission.dim + 5) } });
    fireEvent.blur(screen.getByLabelText('Dim'));
    expect(measure(circle)!.light).toMatchObject({ bright: emission.bright, dim: emission.dim + 5 });
    fireEvent.click(light());
    expect(measure(circle)).not.toHaveProperty('light');
    expect(screen.queryByLabelText('Bright')).toBeNull();
    expect(steps()).toBe(3);
  });

  it('shows the switch as it is and takes no press on a scene without dynamic lighting, and for Shadow on a shape without a radius', () => {
    const { store, circle, measure } = setup();
    const line = store.getState().addMeasure({ shape: 'line', points: [{ x: 300, y: 600 }, { x: 580, y: 600 }], width: 70 })!;
    act(() => store.getState().openMeasurePopover(circle));
    const light = (): HTMLElement => screen.getByRole('switch', { name: 'Gives light' });
    const disabled = (): boolean => light().getAttribute('aria-disabled') === 'true';
    expect(disabled()).toBe(true);
    fireEvent.click(light());
    expect(measure(circle)).not.toHaveProperty('light');
    // An effect chosen there brings its look and colour, and no light.
    fireEvent.click(within(screen.getByRole('group', { name: 'Effect' })).getByRole('button', { name: 'Fire' }));
    expect(measure(circle)).toMatchObject({ effect: 'fire', color: '#ec7500' });
    expect(measure(circle)).not.toHaveProperty('light');
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(disabled()).toBe(false);
    act(() => store.getState().openMeasurePopover(line));
    expect(disabled()).toBe(false);
    fireEvent.click(within(screen.getByRole('group', { name: 'Effect' })).getByRole('button', { name: 'Shadow' }));
    expect(measure(line)).toMatchObject({ effect: 'shadow' });
    expect(measure(line)).not.toHaveProperty('light');
    expect(disabled()).toBe(true);
  });

  it('lets an area pass walls, and stop at them again without leaving a field behind, one undo step each', () => {
    const { store, circle, measure, steps, undo } = setup();
    act(() => store.getState().openMeasurePopover(circle));
    const walls = (): HTMLElement => screen.getByRole('switch', { name: 'Stops at walls' });
    expect(walls().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(walls());
    expect(measure(circle)?.walls).toBe(false);
    expect(walls().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(walls());
    expect(measure(circle)).not.toHaveProperty('walls');
    expect(steps()).toBe(2);
    undo();
    expect(measure(circle)?.walls).toBe(false);
  });

  it('makes a line wider and narrower by whole cells, never under one, and the tool\'s next line as wide', () => {
    const { store, measure, popover, steps } = setup();
    const line = store.getState().addMeasure({ shape: 'line', points: [{ x: 300, y: 600 }, { x: 580, y: 600 }], width: 70 })!;
    const before = steps();
    act(() => store.getState().openMeasurePopover(line));
    const narrower = screen.getByRole('button', { name: 'Narrower' }) as HTMLButtonElement;
    expect(narrower.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Wider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wider' }));
    expect(measure(line)?.width).toBe(210);
    // A map that counts in squares without a unit names no width in the heading; the stepper says it, in squares.
    expect(popover().querySelector('.atlas-dungeon-stepper__value')?.textContent).toBe('3 sq');
    expect(store.getState().measureTool.lineWidth).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Narrower' }));
    expect(measure(line)?.width).toBe(140);
    expect(steps() - before).toBe(3);
  });

  it('selects the tokens in the area and closes, and offers nothing to select while it holds none', async () => {
    const { store, circle, tokensIn } = setup();
    act(() => store.getState().openMeasurePopover(circle));
    const select = (): HTMLButtonElement => screen.getByRole('button', { name: 'Select tokens' }) as HTMLButtonElement;
    expect(select().disabled).toBe(true);
    tokensIn[circle] = ['goblin', 'hero'];
    // The scene changed: the button asks again.
    act(() => store.getState().setSnapToGrid(false));
    expect(select().disabled).toBe(false);
    fireEvent.click(select());
    expect(store.getState().selectedIds).toEqual(['goblin', 'hero']);
    expect(store.getState().measurePopover).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('has none of an area\'s controls for a ruler', () => {
    const { store, ruler } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    expect(screen.queryByRole('switch', { name: 'Stops at walls' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select tokens' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wider' })).toBeNull();
  });
});

describe('the measurement popover on the map', () => {
  it('stands beside its handle, growing out of it, and follows the map', () => {
    const { store, ruler, camera, frame, popover, position } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    // 300 + the handle's 10 px + a 12 px gap; centred on the handle's height.
    expect(position()).toEqual({ x: 322, y: 320 });
    expect(popover().style.transformOrigin).toBe('-22px 80px');
    camera.x = -120;
    camera.y = 40;
    frame();
    expect(position()).toEqual({ x: 202, y: 360 });
  });

  it('follows its measurement when that is moved, and travels to another one that is opened', () => {
    const { store, ruler, circle, frame, position } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    act(() => store.getState().updateMeasure(ruler, { points: [{ x: 370, y: 470 }, { x: 580, y: 470 }] }));
    frame();
    expect(position()).toEqual({ x: 392, y: 390 });
    act(() => store.getState().openMeasurePopover(circle));
    // The circle is on the right half: the popover stands on its roomier, left side.
    expect(position()).toEqual({ x: 900 - 22 - 272, y: 320 });
  });

  it('stays inside the view at its edges', () => {
    const { store, ruler, camera, frame, position } = setup();
    act(() => store.getState().openMeasurePopover(ruler));
    camera.y = 380;
    frame();
    // The handle is 20 px above the view's bottom: the popover ends 8 px inside it.
    expect(position().y).toBe(800 - 8 - 160);
  });
});

describe('a circle that follows a token', () => {
  /** The circle's centre (900, 400) lies in the cell whose centre is (875, 385). */
  const hero = { id: 'hero', kind: 'character' as const, name: 'hero', imagePath: '', x: 875, y: 385 };
  const follows = (): HTMLElement => screen.getByRole('switch', { name: 'Follows token' });

  it('cannot follow where its centre is on no token: the switch shows off and says why', () => {
    const { store, circle, measure, steps } = setup();
    act(() => store.getState().openMeasurePopover(circle));
    expect(follows().getAttribute('aria-checked')).toBe('false');
    expect(follows().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(follows());
    expect(measure(circle)).not.toHaveProperty('follows');
    expect(steps()).toBe(0);
  });

  it('becomes the aura of the token it lies on, reaching as far past the token\'s space, and a circle again where the token stands', () => {
    const { store, circle, measure, popover, steps, undo } = setup();
    act(() => store.setState({ objects: { ...store.getState().objects, tokens: { hero } } }));
    getHistoryStore(store)!.getState().clear();
    act(() => store.getState().openMeasurePopover(circle));
    expect(follows().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(follows());
    // Two squares from the token's centre is a square and a half past its space: an aura of two squares, 5 a square.
    expect(measure(circle)).toMatchObject({ shape: 'circle', follows: 'hero', aura: 10, points: [{ x: 875, y: 385 }, { x: 875 + 35 + 140, y: 385 }], color: '#e93147', hidden: true });
    expect(follows().getAttribute('aria-checked')).toBe('true');
    expect(within(popover()).getByText('Aura · 2 sq')).toBeTruthy();
    expect(steps()).toBe(1);

    // The token walks off; let go, the aura stays as a circle around where the token stands then.
    act(() => store.getState().setTokenPositions([{ id: 'hero', x: 455, y: 385 }]));
    fireEvent.click(follows());
    const let_go = measure(circle)!;
    expect(let_go).not.toHaveProperty('follows');
    expect(let_go).not.toHaveProperty('aura');
    expect(let_go.points).toEqual([{ x: 455, y: 385 }, { x: 455 + 35 + 140, y: 385 }]);
    expect(within(popover()).getByText('Circle · 3 sq')).toBeTruthy();
    undo();
    expect(measure(circle)).toMatchObject({ follows: 'hero', aura: 10 });
  });

  it('stands beside its badge on the rim of its token, wherever the token is', () => {
    const { store, circle, frame, position } = setup();
    act(() => store.setState({ objects: { ...store.getState().objects, tokens: { hero } } }));
    act(() => store.getState().updateMeasure(circle, { follows: 'hero', aura: 10 }));
    act(() => store.getState().openMeasurePopover(circle));
    frame();
    const before = position();
    act(() => store.getState().setTokenPositions([{ id: 'hero', x: 875 - 210, y: 385 }]));
    frame();
    expect(position().x).toBeCloseTo(before.x - 210, 6);
    expect(position().y).toBeCloseTo(before.y, 6);
  });
});

