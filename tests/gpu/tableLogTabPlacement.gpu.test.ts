import '../setup/obsidianDom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tabsCss from '../../src/app/react/components/scene-tab-bar.scss?inline';
import switcherCss from '../../src/app/react/components/levels/level-switcher.scss?inline';
import { roomAbove } from '../../src/app/online/gm/dock/dockDom';
import { LogUnreadTab } from '../../src/app/online/tableLog/LogUnreadTab';
import { DASHBOARD_THEME } from './dashboardTheme';

/**
 * Online play's unread table log on the GM's map: it hangs directly below the scene tabs, in their
 * place where there are none, and stays clear of the tabs, the widgets, the dice rolls and the levels
 * switch at any width. The map UI as `UIRoot` lays it out, styled by the plugin's real stylesheets;
 * screenshots in `__screenshots__`.
 */

const TABS = `
  <div class="atlas-scene-tab-bar">
    <div class="atlas-scene-tab-bar__strip">
      <div class="atlas-scene-tab atlas-scene-tab--active"><span class="atlas-scene-tab__name">Blue Mouth Caves</span></div>
      <div class="atlas-scene-tab atlas-scene-tab--loaded"><span class="atlas-scene-tab__name">The Citadel</span></div>
    </div>
    <button type="button" class="atlas-scene-tab atlas-scene-tab-bar__button atlas-scene-tab-bar__add">+</button>
  </div>`;

const LABELS = ['Torches', 'Arrows left', 'Purple team respawn', 'White team respawn', 'Green team respawn', 'Red team respawn', 'Torch burns out', 'Key cutter prog (STR)'];

const card = (label: string, index: number): string => `
  <div class="atlas-widget atlas-widget-counter">
    <div class="atlas-widget-icon-wrapper"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg></div>
    <div class="atlas-widget-content">
      <div class="atlas-widget-value-row"><span class="atlas-widget-value">${index + 1}</span></div>
      <div class="atlas-widget-label"><span class="atlas-widget-label-text">${label}</span></div>
    </div>
  </div>`;

const LEVELS = `
  <div class="atlas-level-switcher">
    <div class="atlas-level-switcher__levels">
      ${['Tower', 'Hall', 'Cellar', 'Crypt'].map((name) => `<div class="atlas-level-switcher__level"><span class="atlas-level-switcher__name">${name}</span></div>`).join('')}
    </div>
  </div>`;

interface Layout {
  readonly tabs: boolean;
  readonly widgets: number;
  readonly levels: boolean;
}

const mapUi = ({ tabs, widgets, levels }: Layout): string => `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-top-bar-start">
          ${tabs ? TABS : ''}
          <div class="atlas-top-bar-start__below"><div class="atlas-online-log-tab-host"></div></div>
        </div>
        <div class="atlas-top-bar-end">
          ${widgets > 0 ? `<div class="atlas-widget-bar active"${widgets > 2 ? ' data-stack="closed"' : ''}><div class="atlas-widget-container">${LABELS.slice(0, widgets).map(card).join('')}</div></div>` : ''}
          <div class="atlas-dice-rolls atlas-vtt-plugin"><div class="atlas-dice-roll"><div class="atlas-dice-roll__sheet" style="height: 200px"></div></div></div>
        </div>
      </div>
      <div class="atlas-bottom-toolbar-row">
        <div class="atlas-vtt-toolbar" style="width: 300px; height: 48px"></div>
      </div>
      ${levels ? LEVELS : ''}
    </div>
  </div>`;

const INSET = 8;
const boxOf = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
const boxesOf = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

describe('the table log\'s unread tab on the GM\'s map', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css + tabsCss + switcherCss;
  // Obsidian's workspace leaf: it holds the view's fixed elements and their stacking.
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

  /** A map view `width` × `height` laid out as `layout`, with three messages unread. */
  async function mount(width: number, height: number, layout: Layout): Promise<{ view: DOMRect; tab: DOMRect }> {
    document.body.className = 'theme-dark';
    leaf.style.cssText = `position: relative; width: ${width}px; height: ${height}px; contain: strict`;
    leaf.innerHTML = mapUi(layout);
    document.body.append(leaf);
    root = createRoot(leaf.querySelector<HTMLElement>('.atlas-online-log-tab-host')!);
    root.render(createElement(LogUnreadTab, { count: 3, onOpen: () => undefined }));
    await expect.poll(() => leaf.querySelector('.atlas-online-log-tab__button')).not.toBeNull();
    // The tab slides in; measure where it rests.
    for (const animation of document.getAnimations()) animation.finish();
    return { view: leaf.getBoundingClientRect(), tab: boxOf('.atlas-online-log-tab__button') };
  }

  /** Nothing at the top of the map or the levels switch lies over the tab, and the tab is on top where it stands. */
  function staysClear(tab: DOMRect): void {
    for (const selector of ['.atlas-scene-tab-bar', '.atlas-widget', '.atlas-dice-roll__sheet', '.atlas-level-switcher']) {
      for (const [index, box] of boxesOf(selector).entries()) expect.soft(overlaps(tab, box), `${selector} ${index}`).toBe(false);
    }
    const hit = document.elementFromPoint(tab.left + tab.width / 2, tab.top + tab.height / 2);
    expect(hit?.closest('.atlas-online-log-tab__button')).not.toBeNull();
  }

  for (const width of [1280, 640, 420]) {
    for (const levels of [false, true]) {
      it(`hangs directly below the scene tabs in a view ${width} px wide${levels ? ' with levels' : ''}`, async () => {
        const { tab } = await mount(width, 600, { tabs: true, widgets: LABELS.length, levels });
        await page.screenshot({ path: `__screenshots__/atlas-online-log-tab-${width}${levels ? '-levels' : ''}.png`, element: leaf });
        const tabs = boxOf('.atlas-scene-tab-bar');
        expect(tab.left).toBeCloseTo(tabs.left, 0);
        expect(tab.top).toBeCloseTo(tabs.bottom + INSET, 0);
        staysClear(tab);
      });
    }
  }

  for (const width of [1280, 420]) {
    it(`stands in the tabs' place without scene tabs in a view ${width} px wide`, async () => {
      const { view, tab } = await mount(width, 600, { tabs: false, widgets: LABELS.length, levels: true });
      await page.screenshot({ path: `__screenshots__/atlas-online-log-tab-no-tabs-${width}.png`, element: leaf });
      expect(tab.left).toBeCloseTo(view.left + INSET, 0);
      expect(tab.top).toBeCloseTo(view.top + INSET, 0);
      staysClear(tab);
    });
  }

  it('keeps clear of a levels switch with several floors in a short view', async () => {
    const { tab } = await mount(900, 420, { tabs: true, widgets: 0, levels: true });
    expect(boxOf('.atlas-level-switcher').top).toBeGreaterThanOrEqual(tab.bottom + INSET);
    staysClear(tab);
  });

  it('leaves the tabs where they were', async () => {
    const { view } = await mount(1280, 600, { tabs: true, widgets: 2, levels: false });
    const tabs = boxOf('.atlas-scene-tab-bar');
    expect(tabs.left).toBeCloseTo(view.left + INSET, 0);
    expect(tabs.top).toBeCloseTo(view.top + INSET, 0);
    // What hangs below the tabs takes no room in the row: the dice rolls still start below the widgets.
    expect(boxOf('.atlas-top-bar-row').height).toBeCloseTo(Math.max(tabs.height, boxOf('.atlas-widget-bar').height), 0);
  });

  it('keeps the online control\'s open surface below the tab', async () => {
    const { tab } = await mount(1280, 600, { tabs: true, widgets: 0, levels: false });
    const row = leaf.querySelector<HTMLElement>('.atlas-bottom-toolbar-row')!;
    const top = row.getBoundingClientRect().bottom - roomAbove(leaf, row, INSET);
    expect(top).toBeGreaterThanOrEqual(tab.bottom + INSET - 0.5);
  });
});
