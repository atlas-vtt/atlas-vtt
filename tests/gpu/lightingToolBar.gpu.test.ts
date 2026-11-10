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
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
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
    // The bars have risen into place once they stand their gap above the toolbar.
    expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect('.atlas-lighting-bar--modes').bottom)).toBeLessThan(0.05);
  });

  it('puts the modes and the tools in two bars from the toolbar\'s left edge, smaller than the toolbar, with its corners', async () => {
    mount(false);
    await settled();
    const toolbar = rect('.atlas-main-toolbar');
    const modes = rect('.atlas-lighting-bar--modes');
    const tools = rect('.atlas-lighting-bar--tools');
    expect(modes.left).toBeCloseTo(toolbar.left, 0);
    expect(tools.left).toBeCloseTo(modes.right + 8, 0);
    expect(tools.bottom).toBeCloseTo(modes.bottom, 0);
    // Below whatever hangs from the toolbar, and still the bars' own to click.
    expect(document.elementFromPoint(modes.left + 24, modes.top + modes.height / 2)?.closest('.atlas-lighting-bar--modes')).not.toBeNull();
    // A second level: buttons of 32 px against the toolbar's 40, in the toolbar's 8 px of padding.
    expect(modes.height).toBeCloseTo(50, 0);
    expect(modes.height).toBeLessThan(toolbar.height - 6);
    const buttons = [...document.querySelectorAll('.atlas-lighting-bar--modes .atlas-tool-button')].map((button) => button.getBoundingClientRect());
    expect(buttons.map((button) => Math.round(button.width))).toEqual([32, 32, 32, 32, 32, 32]);
    // The toolbar's corner in proportion to the bar's height, so it reads as the toolbar drawn smaller, never a capsule.
    const corner = (selector: string): number => parseFloat(getComputedStyle(document.querySelector(selector)!).borderTopLeftRadius);
    expect(corner('.atlas-lighting-bar--modes') / modes.height).toBeCloseTo(corner('.atlas-main-toolbar') / toolbar.height, 2);
  });

  it('moves nothing of the modes when another mode brings other tools', async () => {
    mount(false);
    await settled();
    const modes = rect('.atlas-lighting-bar--modes');
    const left = rect('.atlas-lighting-bar--tools').left;
    act(() => store.getState().setLightingTool({ mode: 'rooms' }));
    await vi.waitFor(() => expect(document.querySelectorAll('.atlas-lighting-bar--tools .atlas-tool-button')).toHaveLength(7), { timeout: 2000 });
    await vi.waitFor(() => expect(rect('.atlas-lighting-bar--tools').left).toBeCloseTo(left, 1), { timeout: 2000 });
    expect(rect('.atlas-lighting-bar--modes')).toEqual(modes);
    // Carve, fill and door, then the shapes, a doubled gap between them.
    const buttons = [...document.querySelectorAll('.atlas-lighting-bar--tools .atlas-tool-button')].map((button) => button.getBoundingClientRect());
    expect(buttons.slice(1).map((button, index) => Math.round(button.left - buttons[index]!.right))).toEqual([8, 8, 16, 8, 8, 8]);
    // The lights mode has the lights to place as its tools.
    act(() => store.getState().setLightingTool({ mode: 'place-light' }));
    await vi.waitFor(() => expect(document.querySelectorAll('.atlas-lighting-bar--tools .atlas-tool-button')).toHaveLength(5), { timeout: 2000 });
    expect(rect('.atlas-lighting-bar--modes')).toEqual(modes);
    act(() => store.getState().setLightingTool({ mode: 'light-zone' }));
    await vi.waitFor(() => expect(document.querySelector('.atlas-lighting-bar--tools')).toBeNull(), { timeout: 2000 });
    expect(rect('.atlas-lighting-bar--modes')).toEqual(modes);
  });

  it('opens the tool\'s menu in its own place, over the bars, and sets the lift the turn banner stands clear by', async () => {
    mount(true);
    await settled();
    const bar = rect('.atlas-lighting-bar--modes');
    const menu = rect('.atlas-dropdown-content');
    const toolbar = rect('.atlas-main-toolbar');
    // As without the bars: the menu's foot is where every toolbar menu's is, below the bars' top.
    expect(menu.bottom).toBeGreaterThan(bar.top);
    expect(menu.bottom).toBeLessThan(toolbar.top);
    // Where the two overlap, the menu is on top and takes the pointer.
    const x = Math.max(menu.left, bar.left) + 6;
    const y = Math.max(menu.top, bar.top) + 6;
    expect(x).toBeLessThan(Math.min(menu.right, bar.right));
    expect(y).toBeLessThan(Math.min(menu.bottom, bar.bottom));
    expect(document.elementFromPoint(x, y)?.closest('.atlas-dropdown-content')).not.toBeNull();
    const row = document.querySelector<HTMLElement>('.atlas-bottom-toolbar-row')!;
    expect(parseFloat(row.style.getPropertyValue('--atlas-toolbar-lift'))).toBeCloseTo(bar.height + 8, 0);
    const place = menu.bottom;
    // The menu stays open when another tool is chosen from the store, and the bars go.
    act(() => store.setState({ activeTool: 'move' }));
    await vi.waitFor(() => expect(document.querySelector('.atlas-lighting-bars')).toBeNull());
    expect(rect('.atlas-dropdown-content').bottom).toBeCloseTo(place, 1);
  });
});
