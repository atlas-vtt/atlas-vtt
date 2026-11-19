import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { LightingToolGroup } from '../../src/app/packages/components/toolbar/LightingToolGroup';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// Without settings the lighting quality section renders nothing: the shape measured is the scene's own rows and switch.
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'L', useAtlasSettings: () => undefined }));

/** The lighting tool's menu as the toolbar shows it, styled by the plugin's real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
  button { height: 30px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;

describe('the lighting tool\'s menu', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;

  beforeEach(async () => {
    await page.viewport(600, 700);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `lighting-menu-shape-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    render(h('div', { className: 'atlas-vtt-plugin' },
      h('div', { className: 'atlas-vtt-toolbar', style: { position: 'fixed', left: 40, bottom: 20 } },
        h(TooltipProvider, null, h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
          store,
          children: h(LightingToolGroup, { activeTool: 'wall', selectTool: () => undefined, menuOpen: true, toggleMenu: () => undefined, closeMenu: () => undefined }),
        }))))));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const box = (selector: string): number[] => {
    const { left, top, width, height } = document.querySelector(selector)!.getBoundingClientRect();
    return [left, top, width, height];
  };

  it('keeps its size and the switch its place when dynamic lighting is switched on or off', () => {
    const shape = (): number[][] => [box('.atlas-dropdown-content'), box('.atlas-dropdown-toggle-row'), box('.atlas-segmented'), box('.atlas-swatch--picker')];
    const off = shape();
    act(() => store.getState().setSceneLighting({ enabled: true }));
    expect(shape()).toEqual(off);
    act(() => store.getState().setSceneLighting({ enabled: false }));
    expect(shape()).toEqual(off);
  });

  it('spans the time of day in its top corners and stands everything else on the text edge', () => {
    const row = document.querySelector<HTMLElement>('.atlas-dropdown-menu-item')!.getBoundingClientRect();
    const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
    // The time of day is the menu's first thing: it reaches out as far as the rows, concentric with the corners.
    const time = rect('.atlas-segmented');
    expect(time.left).toBeCloseTo(row.left, 1);
    expect(time.right).toBeCloseTo(row.right, 1);
    expect(getComputedStyle(document.querySelector('.atlas-segmented')!).borderTopLeftRadius)
      .toBe(getComputedStyle(document.querySelector('.atlas-dropdown-menu-item')!).borderTopLeftRadius);
    // The ambient slider, its colour and the dynamic lighting switch stand 12px inside the rows on both sides.
    const [start, end] = [row.left + 12, row.right - 12];
    expect(rect('.atlas-scene-lighting__ambient .slider-track').left).toBeCloseTo(start, 1);
    expect(rect('.atlas-swatch--picker').right).toBeCloseTo(end, 1);
    expect(rect('.atlas-dropdown-toggle-row__label').left).toBeCloseTo(start, 1);
    // The dynamic lighting switch is the menu's last thing: it stands in the bottom corner, as far out as the rows.
    expect(rect('.atlas-dropdown-toggle-row .atlas-toggle').right).toBeCloseTo(row.right, 1);
    const menu = rect('.atlas-dropdown-content');
    expect(menu.bottom - rect('.atlas-dropdown-toggle-row .atlas-toggle').bottom).toBeCloseTo(menu.right - row.right, 1);
    // The time of day's options run concentric inside it.
    const option = document.querySelector('.atlas-segmented__option')!;
    expect(parseFloat(getComputedStyle(option).borderTopLeftRadius)).toBe(parseFloat(getComputedStyle(document.querySelector('.atlas-segmented')!).borderTopLeftRadius) - 4);
  });

  it('moves the time of day to the text edge once a row stands above it', () => {
    act(() => {
      store.getState().setLightingTool({ mode: 'rooms' });
      store.getState().setRoomTool({ shape: 'brush' });
    });
    const row = document.querySelector<HTMLElement>('.atlas-dropdown-menu-item')!.getBoundingClientRect();
    const time = document.querySelector<HTMLElement>('.atlas-segmented')!;
    expect(time.getBoundingClientRect().left).toBeCloseTo(row.left + 12, 1);
    expect(time.getBoundingClientRect().right).toBeCloseTo(row.right - 12, 1);
    expect(getComputedStyle(time).borderTopLeftRadius).toBe('10px');
  });
});
