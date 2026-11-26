import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createStore } from 'zustand/vanilla';
import css from '../../styles/main.scss?inline';
import { DASHBOARD_THEME } from './dashboardTheme';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ResponsiveWidgetBar } from '../../src/app/react/components/ResponsiveWidgetBar';
import { PlayerWidgetBar } from '../../src/app/services/PlayerWidgetBar';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { CounterWidget, WidgetSettings } from '../../src/app/types/widgetTypes';

/**
 * The widgets move as the initiative lists do, in the map view and in the player window: the bar shown or hidden as a
 * whole comes down from the top edge and goes back up, and a widget switched on, deleted or moved makes the others
 * glide while it grows in or fades where it stood. Every animation is held at its start to read where things begin.
 */

const LABELS = ['Doom', 'Torches', 'Arrows'];
const widgetOf = (label: string, index: number): CounterWidget => ({
  id: `w${index}`, type: 'counter', label, icon: 'skull', visible: true, visibleToPlayers: true, value: index, order: index,
});
const allWidgets = (): Record<string, CounterWidget> => Object.fromEntries(LABELS.map((label, index) => [`w${index}`, widgetOf(label, index)]));

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const card = (id: string): Element => document.querySelector(`.atlas-widget-container [data-turn-key="widget:${id}"]`)!;
const ghosts = (): Element[] => [...document.querySelectorAll('.atlas-initiative-ghost')];
const byTime = (animation: Animation): boolean => animation.timeline instanceof DocumentTimeline;
const holdAt = (ms: number): void => {
  for (const animation of document.getAnimations().filter(byTime)) { animation.pause(); animation.currentTime = ms; }
};
const finishAll = (): void => {
  for (const animation of document.getAnimations().filter(byTime)) if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
};
const SHOTS = '__screenshots__/widget-motion';
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

describe('the map view\'s widgets', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;
  const leaf = document.createElement('div');
  let root: Root | null = null;
  let store: ViewAtlasStore;

  beforeEach(async () => {
    await page.viewport(1200, 700);
    document.head.append(style);
    leaf.style.cssText = 'position: relative; width: 1200px; height: 700px; contain: strict';
    leaf.innerHTML = `<div class="atlas-vtt-plugin" style="position: absolute; inset: 0"><div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row"><div class="atlas-top-bar-start"><div class="atlas-top-bar-start__below"></div></div><div class="atlas-top-bar-end"></div></div></div></div>`;
    document.body.append(leaf);
    const { app } = createInMemoryApp();
    store = createViewAtlasStore(app, 'map');
    store.getState().setPersistenceEnabled(false);
    store.setState({ widgetSettings: { ...store.getState().widgetSettings, widgets: allWidgets() } });
    root = createRoot(leaf.querySelector('.atlas-top-bar-end')!);
    flushSync(() => root!.render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      createElement(ResponsiveWidgetBar, { store, viewId: 'map' }))));
    await frame();
    finishAll();
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    leaf.remove();
    style.remove();
  });

  const write = (change: Partial<WidgetSettings>): void => {
    flushSync(() => store.setState({ widgetSettings: { ...store.getState().widgetSettings, ...change } }));
  };

  it('stand still as they are first drawn', () => {
    expect(document.getAnimations().filter(byTime).filter((animation) => animation.playState === 'running')).toHaveLength(0);
  });

  it('leave towards the top edge when hidden, and come down from it when shown again', async () => {
    const resting = box(document.querySelector('.atlas-widget-bar')!);
    write({ globalVisible: false });
    const bar = document.querySelector('.atlas-widget-bar')!;
    expect(bar.classList).toContain('atlas-widget-bar--leaving');
    holdAt(10_000);
    expect(box(bar).top).toBeLessThan(resting.top - 10);
    expect(parseFloat(getComputedStyle(bar).opacity)).toBe(0);
    finishAll();
    await frame();
    expect(document.querySelector('.atlas-widget-bar')).toBeNull();

    write({ globalVisible: true });
    await frame();
    const shown = document.querySelector('.atlas-widget-bar')!;
    holdAt(0);
    expect(box(shown).top).toBeLessThan(resting.top - 15);
    expect(parseFloat(getComputedStyle(shown).opacity)).toBe(0);
    holdAt(140);
    await page.screenshot({ path: `${SHOTS}/map-enter-140ms.png`, element: leaf });
    finishAll();
    expect(box(shown).top).toBeCloseTo(resting.top, 0);
  });

  it('close the gap of a deleted widget as it fades where it stood', async () => {
    const before = { doom: box(card('w0')), torches: box(card('w1')) };
    const { w1: _gone, ...rest } = allWidgets();
    write({ widgets: rest });
    holdAt(0);
    // The bar is anchored at the right: what stood left of the deleted one starts where it was
    expect(box(card('w0')).left).toBeCloseTo(before.doom.left, 0);
    const [ghost] = ghosts();
    expect(ghost).toBeDefined();
    expect(box(ghost!).left).toBeCloseTo(before.torches.left, 0);
    expect(box(ghost!).top).toBeCloseTo(before.torches.top, 0);
    holdAt(110);
    await page.screenshot({ path: `${SHOTS}/map-delete-110ms.png`, element: leaf });
    finishAll();
    await frame();
    expect(ghosts()).toHaveLength(0);
    expect(box(card('w0')).left).toBeGreaterThan(before.doom.left + 10);
  });

  it('glide to their new places when moved, and grow in when switched on', () => {
    const before = { doom: box(card('w0')), arrows: box(card('w2')) };
    const widgets = allWidgets();
    write({ widgets: { ...widgets, w0: { ...widgets.w0!, order: 2 }, w2: { ...widgets.w2!, order: 0 } } });
    holdAt(0);
    expect(box(card('w0')).left).toBeCloseTo(before.doom.left, 0);
    expect(box(card('w2')).left).toBeCloseTo(before.arrows.left, 0);
    finishAll();
    expect(box(card('w0')).left).toBeGreaterThan(box(card('w2')).left);

    write({ offWidgets: ['w1'] });
    finishAll();
    write({ offWidgets: [] });
    holdAt(0);
    expect(parseFloat(getComputedStyle(card('w1')).opacity)).toBe(0);
    finishAll();
    expect(parseFloat(getComputedStyle(card('w1')).opacity)).toBe(1);
  });

  it('leave with the last widget on show when it is deleted', async () => {
    write({ widgets: { w0: widgetOf('Doom', 0) } });
    finishAll();
    write({ widgets: {} });
    expect(document.querySelector('.atlas-widget-bar--leaving .atlas-widget')).not.toBeNull();
    finishAll();
    await frame();
    expect(document.querySelector('.atlas-widget-bar')).toBeNull();
  });

  it('change at once while a scene loads', () => {
    flushSync(() => store.setState({ isMapLoading: true }));
    write({ widgets: { w0: widgetOf('Doom', 0) } });
    write({ globalVisible: false });
    expect(document.getAnimations().filter(byTime)).toHaveLength(0);
    expect(document.querySelector('.atlas-widget-bar')).toBeNull();
  });
});

describe('the player window\'s widgets', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;
  let showWidgets = true;
  const listeners: (() => void)[] = [];
  const settings = {
    getLocalPlayerViewSettings: () => ({ showWidgets }),
    initiativeLayout: () => ({ fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false }),
    onChange: (listener: () => void) => { listeners.push(listener); return () => undefined; },
  } as unknown as SettingsService;
  let bar: PlayerWidgetBar;
  let scene: ReturnType<typeof createStore<{ widgetSettings: WidgetSettings; widgetValues: object; isMapLoading: boolean }>>;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
    document.body.innerHTML = '';
    showWidgets = true;
    listeners.length = 0;
    const layer = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    Object.assign(layer.style, { position: 'relative', width: '1000px', height: '700px', transform: 'translate(0, 0)' });
    bar = new PlayerWidgetBar(settings);
    bar.mount(layer);
    scene = createStore(() => ({
      widgetSettings: { widgets: allWidgets(), globalVisible: true, position: 'top', scale: 1 } as WidgetSettings,
      widgetValues: {},
      isMapLoading: false,
    }));
    bar.present(scene as never);
  });

  afterEach(() => {
    bar.destroy();
    style.remove();
  });

  const write = (change: Partial<WidgetSettings>): void => {
    scene.setState({ widgetSettings: { ...scene.getState().widgetSettings, ...change } });
  };

  it('are there at once as the window shows its scene', () => {
    expect(document.getAnimations().filter(byTime)).toHaveLength(0);
  });

  it('leave towards the top edge when switched off, and come down from it when switched on', async () => {
    const resting = box(document.querySelector('.atlas-widget-bar')!);
    showWidgets = false;
    for (const listener of listeners) listener();
    const leaving = document.querySelector('.atlas-widget-bar--leaving')!;
    expect(leaving).not.toBeNull();
    holdAt(10_000);
    expect(box(leaving).top).toBeLessThan(resting.top - 10);
    finishAll();
    await frame();
    expect(document.querySelector('.atlas-widget-bar')).toBeNull();

    showWidgets = true;
    for (const listener of listeners) listener();
    const shown = document.querySelector('.atlas-widget-bar')!;
    holdAt(0);
    expect(box(shown).top).toBeLessThan(resting.top - 15);
    finishAll();
    expect(box(shown).top).toBeCloseTo(resting.top, 0);
  });

  it('close the gap of a deleted widget as it fades where it stood, and carry the fade over a new drawing', async () => {
    const before = { doom: box(card('w0')), torches: box(card('w1')) };
    const { w1: _gone, ...rest } = allWidgets();
    write({ widgets: rest });
    holdAt(0);
    expect(box(card('w0')).left).toBeCloseTo(before.doom.left, 0);
    expect(box(ghosts()[0]!).left).toBeCloseTo(before.torches.left, 0);
    // A value changes meanwhile: the bar is drawn anew and the fading copy stays where it was
    for (const animation of document.getAnimations()) animation.play();
    scene.setState({ widgetValues: { w0: 5 } });
    expect(ghosts()).toHaveLength(1);
    holdAt(0);
    expect(box(ghosts()[0]!).left).toBeCloseTo(before.torches.left, 0);
    finishAll();
    await frame();
    expect(ghosts()).toHaveLength(0);
  });

  it('change at once while the scene loads', () => {
    scene.setState({ isMapLoading: true });
    const { w1: _gone, ...rest } = allWidgets();
    write({ widgets: rest });
    expect(ghosts()).toHaveLength(0);
    expect(document.getAnimations().filter(byTime)).toHaveLength(0);
  });
});
