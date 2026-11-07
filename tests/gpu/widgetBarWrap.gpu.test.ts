import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tabsCss from '../../src/app/react/components/scene-tab-bar.scss?inline';
import { DASHBOARD_THEME } from './dashboardTheme';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ResponsiveWidgetBar } from '../../src/app/react/components/ResponsiveWidgetBar';
import type { CounterWidget } from '../../src/app/types/widgetTypes';

/**
 * Widgets that do not fit beside the scene tabs lie stacked in the corner, on any screen and with
 * any number of tabs, clear of the tabs and of the initiative tracker's place below; a click spreads
 * them into rows inside the view. One widget never stacks, and a row that fits stays a row when the
 * bar wakes. The player window's bar has no tabs and nothing to click, and wraps. Styled by the
 * plugin's real stylesheet; screenshots in `__screenshots__`.
 */

const LABELS = ['Key cutter prog (STR)', 'Key cutter prog (DEX)', 'Key cutter prog (WIS)', 'Key cutter prog (CHA)', 'Key cutter prog (INT)',
  'Purple team respawn', 'White team respawn', 'Green team respawn', 'Red team respawn', 'Torches', 'Arrows left', 'Torch burns out'];

const card = (label: string, index: number): string => `
  <div class="atlas-widget atlas-widget-counter">
    <div class="atlas-widget-icon-wrapper"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg></div>
    <div class="atlas-widget-content">
      <div class="atlas-widget-value-row"><span class="atlas-widget-value">${index + 1}</span></div>
      <div class="atlas-widget-label"><span class="atlas-widget-label-text">${label}</span></div>
    </div>
  </div>`;

const bar = (count: number): string => `<div class="atlas-widget-bar active"><div class="atlas-widget-container">${LABELS.slice(0, count).map(card).join('')}</div></div>`;

const TABS = ['Blue Mouth Caves', 'The Citadel', 'Lockwood Manor', 'Old Forest', 'Grimhold', 'The Sunken Keep', 'Harrowmere', 'Ashfall'];

/** The map UI as `UIRoot` lays it out: scene tabs and the widgets in the top bar row, rolls hanging below. */
const mapUi = (tabs: number): string => `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-top-bar-start">
          <div class="atlas-scene-tab-bar">
            <div class="atlas-scene-tab-bar__strip">
              ${TABS.slice(0, tabs).map((name) => `<div class="atlas-scene-tab"><span class="atlas-scene-tab__name">${name}</span></div>`).join('')}
            </div>
            <button type="button" class="atlas-scene-tab atlas-scene-tab-bar__button atlas-scene-tab-bar__add">+</button>
          </div>
          <div class="atlas-top-bar-start__below"></div>
        </div>
        <div class="atlas-top-bar-end"></div>
      </div>
    </div>
  </div>`;

interface Box { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }

const boxOf = (element: Element): Box => element.getBoundingClientRect();
const boxesOf = (selector: string): Box[] => [...document.querySelectorAll(selector)].map(boxOf);
const query = (selector: string): Element => document.querySelector(selector)!;
const overlaps = (a: Box, b: Box): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const barState = (): string | null => query('.atlas-widget-bar').getAttribute('data-stack');
const INSET = 8;
/** The initiative tracker's top lies this far down at least (`initiative-tracker.scss`). */
const TRACKER_CLEARANCE = 160;

const widgetOf = (label: string, index: number): CounterWidget => ({
  id: `w${index}`, type: 'counter', label, icon: 'skull', visible: true, visibleToPlayers: true, value: index, order: index,
});

describe('a widget bar with many widgets', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css + tabsCss;
  const leaf = document.createElement('div');
  let root: Root | null = null;

  beforeEach(async () => {
    await page.viewport(1300, 800);
    document.head.append(style);
  });

  afterEach(() => {
    root?.unmount();
    root = null;
    leaf.remove();
    style.remove();
    document.body.className = '';
  });

  /** A map view `width` wide with `tabs` scene tabs, holding `count` real widgets. */
  function mount(width: number, count: number, tabs: number, theme: 'light' | 'dark' = 'dark'): Box {
    document.body.className = `theme-${theme}`;
    leaf.style.cssText = `position: relative; width: ${width}px; height: 700px; contain: strict`;
    leaf.innerHTML = mapUi(tabs);
    document.body.append(leaf);
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, 'map');
    store.getState().setPersistenceEnabled(false);
    const widgets = Object.fromEntries(LABELS.slice(0, count).map((label, index) => [`w${index}`, widgetOf(label, index)]));
    store.setState({ widgetSettings: { ...store.getState().widgetSettings, widgets } });
    root = createRoot(query('.atlas-top-bar-end'));
    flushSync(() => root!.render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      createElement(ResponsiveWidgetBar, { store, viewId: 'map' }),
      createElement('div', { className: 'atlas-dice-rolls atlas-vtt-plugin' },
        createElement('div', { className: 'atlas-dice-roll' }, createElement('div', { className: 'atlas-dice-roll__sheet', style: { height: 120 } }))))));
    return boxOf(leaf);
  }

  const settled = async (): Promise<void> => {
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 450)));
  };

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1280, 640, 360]) {
      it(`stacks twelve widgets beside eight tabs in a view ${width} px wide, and spreads them inside it (${theme})`, async () => {
        const view = mount(width, LABELS.length, TABS.length, theme);
        await settled();
        expect(barState()).toBe('closed');
        await page.screenshot({ path: `__screenshots__/atlas-widget-stack-${width}-${theme}.png`, element: leaf });

        const tabs = boxOf(query('.atlas-scene-tab-bar'));
        const opener = query('.atlas-widget-stack-opener');
        const deck = boxOf(opener);
        const top = boxOf(query('.atlas-widget'));
        expect(overlaps(deck, tabs), 'the stack under the tabs').toBe(false);
        expect(deck.right).toBeCloseTo(view.right - INSET, 0);
        expect(deck.top).toBeCloseTo(view.top + INSET, 0);
        expect(top.left).toBeGreaterThanOrEqual(view.left + INSET - 0.5);
        expect(deck.bottom).toBeLessThanOrEqual(view.top + TRACKER_CLEARANCE);
        expect(boxOf(query('.atlas-dice-rolls')).top, 'a roll lies over the deck, in its corner').toBeLessThanOrEqual(deck.top + 0.5);

        (opener as HTMLElement).click();
        await settled();
        expect(barState()).toBe('open');
        await page.screenshot({ path: `__screenshots__/atlas-widget-stack-open-${width}-${theme}.png`, element: leaf });
        const rows = query('.atlas-widget-container') as HTMLElement;
        expect(document.activeElement).toBe(rows);
        for (const [index, box] of boxesOf('.atlas-widget').entries()) {
          expect.soft(box.left, `card ${index}`).toBeGreaterThanOrEqual(view.left + INSET - 0.5);
          expect.soft(box.right, `card ${index}`).toBeLessThanOrEqual(view.right - INSET + 0.5);
        }
        if (rows.scrollHeight > rows.clientHeight + 1) {
          rows.scrollBy({ top: 100 });
          expect(rows.scrollTop).toBeGreaterThan(0);
          rows.scrollTo({ top: 0 });
        }
        // Nothing else moved while they lay spread.
        expect(boxOf(query('.atlas-scene-tab-bar'))).toEqual(tabs);
        expect(boxOf(query('.atlas-widget-bar')).right).toBeCloseTo(deck.right, 0);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await settled();
        expect(barState()).toBe('closed');
        expect(document.activeElement).toBe(query('.atlas-widget-stack-opener'));
      });
    }
  }

  it('takes the first press on the stack for itself, not for the top card', async () => {
    mount(640, LABELS.length, TABS.length);
    await settled();
    // A roll lies over the stack while it shows.
    (query('.atlas-dice-rolls') as HTMLElement).style.display = 'none';
    const box = boxOf(query('.atlas-widget'));
    const point = document.elementFromPoint(box.left + (box.right - box.left) / 2, box.top + (box.bottom - box.top) / 2);
    expect(point?.closest('.atlas-widget-stack-opener')).not.toBeNull();
  });

  it('gathers the cards on a press elsewhere, and keeps them spread on a press on a card', async () => {
    mount(640, LABELS.length, TABS.length);
    await settled();
    (query('.atlas-widget-stack-opener') as HTMLElement).click();
    await settled();
    query('.atlas-widget').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await settled();
    expect(barState()).toBe('open');
    query('.atlas-scene-tab-bar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await settled();
    expect(barState()).toBe('closed');
  });

  it('lays the widget used last on top of the stack', async () => {
    mount(640, LABELS.length, TABS.length);
    await settled();
    const topLabel = (): string | null => {
      const box = boxOf(query('.atlas-widget-stack-opener'));
      const layer = (card: HTMLElement): number => Number(getComputedStyle(card).zIndex) || 0;
      const tops = [...document.querySelectorAll<HTMLElement>('.atlas-widget')].sort((a, b) => layer(b) - layer(a));
      expect(boxOf(tops[0]!).right).toBeCloseTo(box.right, 0);
      expect(getComputedStyle(tops[0]!).opacity).toBe('1');
      return tops[0]!.querySelector('.atlas-widget-label-text')!.textContent;
    };
    expect(topLabel()).toBe(LABELS[0]);
    const use = async (index: number): Promise<void> => {
      (query('.atlas-widget-stack-opener') as HTMLElement).click();
      await settled();
      document.querySelectorAll<HTMLElement>('.atlas-widget-btn')[index * 2]!.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settled();
    };
    await use(5);
    expect(topLabel()).toBe(LABELS[5]);
    await use(2);
    expect(topLabel()).toBe(LABELS[2]);
    await page.screenshot({ path: '__screenshots__/atlas-widget-stack-last-used.png', element: leaf });
  });

  it('never stacks one widget, however narrow the view and however many the tabs', async () => {
    const view = mount(360, 1, TABS.length);
    await settled();
    expect(barState()).toBeNull();
    const box = boxOf(query('.atlas-widget'));
    expect(box.right).toBeCloseTo(view.right - INSET, 0);
    expect(box.left).toBeGreaterThanOrEqual(view.left + INSET);
    expect(overlaps(box, boxOf(query('.atlas-scene-tab-bar')))).toBe(false);
  });

  it('keeps a few widgets in one row in the top right corner, beside the tabs', async () => {
    const view = mount(1280, 2, 2);
    await settled();
    expect(barState()).toBeNull();
    const row = boxOf(query('.atlas-widget-bar'));
    const cards = boxesOf('.atlas-widget');
    expect(row.right).toBeCloseTo(view.right - INSET, 0);
    expect(row.top).toBeCloseTo(view.top + INSET, 0);
    expect(cards[0]!.top).toBeCloseTo(cards[1]!.top, 0);
    expect(boxOf(query('.atlas-scene-tab-bar')).right).toBeLessThanOrEqual(row.left);
  });

  it('gives way to the tabs before it stacks: the row stands while they still have room, whatever their number', async () => {
    mount(1000, 3, TABS.length);
    await settled();
    expect(barState()).toBeNull();
    expect(boxOf(query('.atlas-scene-tab-bar')).right).toBeLessThanOrEqual(boxOf(query('.atlas-widget-bar')).left);
  });

  it('stacks and unstacks as the view changes its width', async () => {
    mount(1280, 6, 2);
    await settled();
    const wide = barState();
    leaf.style.width = '500px';
    await settled();
    expect(barState()).toBe('closed');
    leaf.style.width = '1280px';
    await settled();
    expect(barState()).toBe(wide);
  });

  it('wraps the player window\'s cards inside the window', async () => {
    await page.viewport(640, 600);
    document.body.className = 'theme-dark';
    leaf.style.cssText = '';
    leaf.innerHTML = `<div class="atlas-vtt-plugin" id="atlas-player-widgets">${bar(LABELS.length)}</div>`;
    document.body.append(leaf);
    await page.screenshot({ path: '__screenshots__/atlas-widget-bar-player-window.png' });
    for (const [index, box] of boxesOf('.atlas-widget').entries()) {
      expect.soft(box.left, `card ${index}`).toBeGreaterThanOrEqual(INSET - 0.5);
      expect.soft(box.right, `card ${index}`).toBeLessThanOrEqual(640 - INSET + 0.5);
    }
  });
});
