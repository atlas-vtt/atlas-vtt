import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { LightingToolGroup } from '../../src/app/packages/components/toolbar/LightingToolGroup';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'L', useAtlasSettings: () => undefined }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;

/** The bottom row as the map has it: undo/redo at the left, the lighting tool in the toolbar, its bar above. */
describe('the lighting tool\'s bar above the toolbar', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;

  const mount = (menuOpen: boolean): void => {
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
        store,
        children: h(BottomToolbarRow, {
          start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 300, height: 52 } }),
          // Outside the provider, as on the map.
          options: h(LightingToolBar),
          children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: 420 } }, h(TooltipProvider, null,
            h(LightingToolGroup, { activeTool: 'wall', selectTool: () => undefined, menuOpen, toggleMenu: () => undefined, closeMenu: () => undefined }))),
        }),
      }))));
  };

  beforeEach(async () => {
    await page.viewport(1400, 800);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `lighting-bar-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'wall', isMapLoading: false });
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const settled = (): Promise<void> => vi.waitFor(() => {
    // The bar has risen into place once it stands its gap above the toolbar.
    expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect('.atlas-lighting-bar').bottom)).toBeLessThan(0.05);
  });

  it('stands centred on the toolbar, its gap above it, and is one bar of the toolbar\'s height', async () => {
    mount(false);
    await settled();
    const bar = rect('.atlas-lighting-bar');
    const toolbar = rect('.atlas-main-toolbar');
    expect(Math.abs((bar.left + bar.right) / 2 - (toolbar.left + toolbar.right) / 2)).toBeLessThan(0.5);
    expect(bar.height).toBeCloseTo(toolbar.height, 0);
    // The group break is space: the gap between the modes and the ways of drawing is twice the gap between buttons.
    const buttons = [...document.querySelectorAll('.atlas-lighting-bar .atlas-tool-button')].map((button) => button.getBoundingClientRect());
    const gaps = buttons.slice(1).map((button, index) => Math.round(button.left - buttons[index]!.right));
    expect(gaps).toEqual([8, 8, 8, 8, 8, 16, 8]);
  });

  it('lifts the tool\'s menu by the bar and its gap, and lets it down again when the bar goes', async () => {
    mount(true);
    await settled();
    const bar = rect('.atlas-lighting-bar');
    const lifted = rect('.atlas-dropdown-content').bottom;
    expect(lifted).toBeLessThan(bar.top - 6);
    act(() => store.setState({ isGMView: false }));
    await vi.waitFor(() => expect(document.querySelector('.atlas-lighting-bar')).toBeNull());
    expect(rect('.atlas-dropdown-content').bottom - lifted).toBeCloseTo(bar.height + 8, 0);
  });
});
