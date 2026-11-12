import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { DASHBOARD_THEME } from './dashboardTheme';
import { centreOf, mouse } from './realMouse';

/**
 * How much of a scene's name its tab shows, with the map's top bar laid out by the plugin's real stylesheet.
 *
 * A tab used to keep room for its two controls (show to players, close) at either side of its name, though they show
 * only while the pointer is on the tab, and was never wider than 160 px. Of six names 139 to 180 px long, a view 900 px
 * wide showed 71 to 96 px each, and a view with room for all of them 108 px each. Now a name has its tab, less the
 * tab's inset: 105 to 135 px in the view of 900 px, and every name whole where the bar has the room.
 */

const NAMES = ['Blue Mouth Caves, Upper Level', 'The Sunken Citadel of Varn', 'Lockwood Manor, Ground Floor', 'Old Forest Road at Night', 'Grimhold Keep, The Dungeons', 'Harrowmere Market Square'];
const INSET = 6;
const h = React.createElement;

const strip = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-scene-tab-bar__strip')!;
const tabs = (): HTMLElement[] => [...strip().querySelectorAll<HTMLElement>(':scope > .atlas-scene-tab')];
const nameOf = (tab: HTMLElement): HTMLElement => tab.querySelector<HTMLElement>('.atlas-scene-tab__name')!;
const widthOf = (element: Element): number => element.getBoundingClientRect().width;
const isCut = (tab: HTMLElement): boolean => nameOf(tab).scrollWidth > nameOf(tab).clientWidth;
const actionsOf = (tab: HTMLElement): HTMLElement[] => [...tab.querySelectorAll<HTMLElement>('.atlas-scene-tab__action')];
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('the names on the scene tabs', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;

  beforeEach(async () => {
    await page.viewport(1900, 400);
    document.head.append(style);
    document.body.className = 'theme-dark';
    await mouse.hover(4, 300);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.className = '';
  });

  /** The six scenes open in a map view `width` px wide; the third is the one players are shown. */
  async function mount(width: number): Promise<void> {
    const tabMetaStore = createTabMetaStore();
    const ids = NAMES.map((name) => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
    tabMetaStore.getState().setActiveTab(ids[0]!);
    const ui = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
    const nothing = (): void => undefined;
    render(h('div', { className: 'atlas-vtt-plugin atlas-react-ui-container', style: { position: 'relative', width, height: 200 } },
      h('div', { className: 'atlas-ui', style: { position: 'relative', width: '100%', height: '100%' } },
        h('div', { className: 'atlas-top-bar-row' },
          h('div', { className: 'atlas-top-bar-start' },
            h(AtlasUIContext.Provider, { value: ui },
              h(SceneTabBar, { onSwitchTab: nothing, onCloseTab: nothing, onAddTab: nothing, onPresentTab: nothing, onMoveTab: nothing, onShowAllTabs: nothing, presentedTabId: ids[2]! })))))));
    await frame();
    await frame();
  }

  it('gives every name its tab\'s whole width where six scenes share a bar that cannot hold their names', async () => {
    await mount(900);
    await page.screenshot({ path: '__screenshots__/atlas-scene-tab-names-900.png', element: document.querySelector('.atlas-top-bar-row')! });
    // The tabs fill the strip between them, and nothing scrolls.
    expect(strip().scrollWidth).toBe(strip().clientWidth);
    const gap = parseFloat(getComputedStyle(strip()).columnGap);
    expect(tabs().reduce((sum, tab) => sum + widthOf(tab), 0) + gap * (tabs().length - 1)).toBeCloseTo(strip().clientWidth, 0);

    for (const [index, tab] of tabs().entries()) {
      expect(isCut(tab), NAMES[index]).toBe(true);
      // The one players are shown keeps its eye, with the tab's inset between the two.
      const kept = index === 2 ? widthOf(actionsOf(tab)[0]!) + INSET : 0;
      expect(widthOf(nameOf(tab)), NAMES[index]).toBeCloseTo(widthOf(tab) - 2 * INSET - kept, 0);
    }
    expect(Math.min(...tabs().map((tab) => widthOf(nameOf(tab))))).toBeGreaterThan(100);
  });

  it('cuts no name where the bar has room for all of them', async () => {
    await mount(1900);
    await page.screenshot({ path: '__screenshots__/atlas-scene-tab-names-1900.png', element: document.querySelector('.atlas-top-bar-row')! });
    for (const [index, tab] of tabs().entries()) expect(isCut(tab), NAMES[index]).toBe(false);
  });

  it('keeps the names of the tabs at their smallest readable once the strip scrolls', async () => {
    await mount(520);
    expect(strip().scrollWidth).toBeGreaterThan(strip().clientWidth);
    for (const tab of tabs()) expect(widthOf(nameOf(tab))).toBeGreaterThanOrEqual(widthOf(tab) - 2 * INSET - 16 - INSET - 0.5);
    expect(widthOf(nameOf(tabs()[0]!))).toBeCloseTo(100, 0);
  });

  it('has one inset: a tab\'s padding is its gap, and its controls stand that far inside it', async () => {
    await mount(900);
    const tab = tabs()[1]!;
    const { paddingTop, paddingRight, paddingBottom, paddingLeft, columnGap } = getComputedStyle(tab);
    expect([paddingTop, paddingRight, paddingBottom, paddingLeft, columnGap]).toEqual(Array(5).fill(`${INSET}px`));

    const point = centreOf(tab);
    await mouse.hover(point.x, point.y);
    await frame();
    const box = tab.getBoundingClientRect();
    const [show, close] = actionsOf(tab).map((action) => action.getBoundingClientRect());
    expect([show!.left - box.left, show!.top - box.top, box.bottom - show!.bottom]).toEqual([INSET, INSET, INSET]);
    expect([box.right - close!.right, close!.top - box.top, box.bottom - close!.bottom]).toEqual([INSET, INSET, INSET]);
  });

  it('changes no tab\'s width and moves no name when the pointer shows a tab\'s controls', async () => {
    await mount(900);
    const layout = (): number[][] => tabs().map((tab) => [tab, nameOf(tab)].flatMap((element) => [element.getBoundingClientRect().left, widthOf(element)]));
    const visible = (tab: HTMLElement): string[] => actionsOf(tab).map((action) => getComputedStyle(action).visibility);
    /** Whether the name fades out under the controls that lie over its ends. */
    const fades = (tab: HTMLElement): boolean => getComputedStyle(tab.querySelector('.atlas-scene-tab__label')!).maskImage !== 'none';
    const atRest = layout();
    expect(tabs().map(fades)).toEqual(Array(6).fill(false));
    expect(tabs().map(visible)).toEqual([['hidden', 'hidden'], ['hidden', 'hidden'], ['visible', 'hidden'], ['hidden', 'hidden'], ['hidden', 'hidden'], ['hidden', 'hidden']]);

    for (const tab of tabs()) {
      const point = centreOf(tab);
      await mouse.hover(point.x, point.y);
      await frame();
      expect(visible(tab)).toEqual(['visible', 'visible']);
      expect(tabs().map(fades)).toEqual(tabs().map((other) => other === tab));
      expect(layout()).toEqual(atRest);
    }
    await page.screenshot({ path: '__screenshots__/atlas-scene-tab-names-hover.png', element: document.querySelector('.atlas-top-bar-row')! });
  });
});
