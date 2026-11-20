import '../setup/obsidianDom';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { Header, type HeaderProps } from '../../src/app/packages/components/asset-manager/components/Header';
import { Sidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import { NavigationHistory } from '../../src/app/packages/components/asset-manager/NavigationHistory';
import { DASHBOARD_THEME } from './dashboardTheme';

/**
 * The asset manager's top left with the plugin's stylesheet: the sidebar opens with the collection picker and its
 * ⋯ menu in the header's controls row, and the Armarium is the tab strip's last place. Screenshots go to
 * `__screenshots__/asset-manager/`.
 */

/** Layout rounds to fractions of a pixel; the brief allows one. */
const PX = 1;
const SHOT_DIR = '__screenshots__/asset-manager';

const noop = (): void => undefined;

function headerProps(armariumShown: boolean): HeaderProps {
  return {
    app: new App(),
    search: '',
    onSearch: noop,
    query: { suggestionsFor: () => null, commit: (text) => text, chips: [], activeCount: 0, panel: null, reset: noop },
    activeTab: 'tokens',
    onTabChange: noop,
    assetCounts: { scenes: 12, maps: 34, encounters: 5, tokens: 412, party: 4 },
    onCreateFolder: noop,
    sidebarToggleLabel: 'Hide sidebar',
    onToggleSidebar: noop,
    sel: { navigationHistory: new NavigationHistory(), handleNavigateBack: noop, handleNavigateForward: noop },
    onShowArmarium: noop,
    armarium: armariumShown ? { onBack: noop, onReload: noop, onShare: noop, page: 'https://atlas-vtt.dev/armarium' } : undefined,
  };
}

function managerOf(armariumShown: boolean): React.ReactElement {
  return React.createElement('div', { className: 'atlas-asset-manager-container' },
    React.createElement(Sidebar, {
      selectedTagIds: ['forest'], onSelectTag: noop, onClearTags: noop, countedAssets: [],
      tags: [{ id: 'forest', name: 'Forest' }, { id: 'undead', name: 'Undead' }, { id: 'beast', name: 'Beast' }],
      collections: [{ id: 'Blue Mouth Caves', uid: 'u', name: 'Blue Mouth Caves', isDefault: true }],
      selectedCollection: 'Blue Mouth Caves', onSelectCollection: noop, onManageTags: noop,
      onEditCollectionSettings: noop, onExportCollection: noop, onImportCollection: noop, onShareCollection: noop,
    }),
    React.createElement(Header, headerProps(armariumShown)),
    React.createElement('div', { className: 'atlas-asset-manager-body' }),
  );
}

const box = (selector: string): DOMRect => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`${selector} did not render`);
  return element.getBoundingClientRect();
};
const centre = (rect: DOMRect): number => rect.top + rect.height / 2;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('the asset manager\'s top left', () => {
  const style = document.createElement('style');
  style.textContent = `${DASHBOARD_THEME}${css} .am-frame { position: absolute; top: 0; left: 0; width: 1180px; height: 360px; }`;
  let host: HTMLElement;
  let root: Root;

  const show = async (theme: 'dark' | 'light', armariumShown: boolean): Promise<void> => {
    document.body.className = `theme-${theme}`;
    act(() => root.render(managerOf(armariumShown)));
    await nextFrame();
    await nextFrame();
  };

  beforeEach(async () => {
    await page.viewport(1180, 360);
    document.head.append(style);
    host = document.body.createDiv({ cls: 'atlas-vtt-plugin am-frame' });
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    style.remove();
    document.body.className = '';
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`lines the picker row up with the header's controls (${theme})`, async () => {
      await show(theme, false);
      const picker = box('.atlas-collection-dropdown-trigger');
      const more = box('.atlas-collection-more-btn');
      const toolbar = box('.atlas-am-toolbar');
      expect(Math.abs(centre(picker) - centre(toolbar))).toBeLessThanOrEqual(PX);
      expect(Math.abs(centre(more) - centre(toolbar))).toBeLessThanOrEqual(PX);
      expect(Math.abs(centre(picker) - centre(box('.atlas-sidebar-toggle-btn')))).toBeLessThanOrEqual(PX);
      // As tall as the search field across the window, so the two share their top edge too.
      expect(Math.abs(picker.top - box('.atlas-asset-manager-search').top)).toBeLessThanOrEqual(PX);
      expect(more.height).toBeCloseTo(picker.height, 0);
      expect(more.width).toBeCloseTo(more.height, 0);
      // The picker and ⋯ stay inside the sidebar's padding.
      const sidebar = box('.atlas-asset-manager-sidebar');
      expect(more.right).toBeLessThanOrEqual(sidebar.right - 12 + PX);
      await page.screenshot({ path: `${SHOT_DIR}/top-left-library-${theme}.png`, element: host });
    });

    it(`shows the Armarium as the strip's last tab, the size of the others (${theme})`, async () => {
      await show(theme, true);
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('.atlas-asset-manager-tabs .atlas-tab-button'));
      const armarium = tabs.at(-1)!;
      expect(armarium.textContent).toBe('');
      expect(armarium.getAttribute('aria-label')).toBe('Armarium');
      const square = armarium.getBoundingClientRect();
      expect(Math.abs(square.width - square.height)).toBeLessThanOrEqual(0.5);
      expect(armarium.getAttribute('aria-current')).toBe('page');
      expect(document.querySelectorAll('.atlas-tab-button.atlas-active')).toHaveLength(1);
      for (const tab of tabs) {
        expect(Math.abs(tab.getBoundingClientRect().height - armarium.getBoundingClientRect().height)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(centre(tab.getBoundingClientRect()) - centre(armarium.getBoundingClientRect()))).toBeLessThanOrEqual(0.5);
      }
      // The divider stands centred between the last library tab and the Armarium.
      const divider = box('.atlas-tab-divider');
      const before = tabs.at(-2)!.getBoundingClientRect();
      const after = armarium.getBoundingClientRect();
      expect(Math.abs((divider.left - before.right) - (after.left - divider.right))).toBeLessThanOrEqual(0.5);
      expect(Math.abs(centre(divider) - centre(after))).toBeLessThanOrEqual(0.5);
      await page.screenshot({ path: `${SHOT_DIR}/top-left-armarium-${theme}.png`, element: host });
    });

    it(`opens the collection's ⋯ menu below its button, inside the sidebar (${theme})`, async () => {
      await show(theme, false);
      const trigger = document.querySelector<HTMLButtonElement>('.atlas-collection-more-btn')!;
      act(() => trigger.click());
      await nextFrame();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const menu = box('.atlas-collections .atlas-am-menu');
      const labels = Array.from(document.querySelectorAll('.atlas-collections .atlas-am-menu-item')).map((item) => item.textContent);
      expect(labels).toEqual(['Collection settings…', 'Export collection…', 'Import collection…', 'Share in the Armarium…']);
      expect(document.activeElement?.textContent).toBe('Collection settings…');
      expect(menu.top).toBeGreaterThan(trigger.getBoundingClientRect().bottom);
      const sidebar = box('.atlas-asset-manager-sidebar');
      expect(menu.left).toBeGreaterThanOrEqual(sidebar.left);
      expect(menu.right).toBeLessThanOrEqual(sidebar.right);
      await page.screenshot({ path: `${SHOT_DIR}/top-left-menu-${theme}.png`, element: host });
    });
  }

  it('names the Armarium in the folded tabs and offers it last in their menu', async () => {
    host.style.width = '900px';
    await show('dark', true);
    const trigger = document.querySelector<HTMLButtonElement>('.atlas-am-tab-menu-trigger')!;
    expect(trigger.getClientRects()).toHaveLength(1);
    expect(trigger.textContent).toBe('Armarium');
    act(() => trigger.click());
    await nextFrame();
    const items = Array.from(document.querySelectorAll<HTMLElement>('.atlas-am-tab-menu .atlas-am-menu-item'));
    expect(items.at(-1)?.textContent).toBe('Armarium');
    expect(items.at(-1)?.getAttribute('aria-checked')).toBe('true');
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await page.screenshot({ path: `${SHOT_DIR}/top-left-folded-armarium-dark.png`, element: host });
  });
});
