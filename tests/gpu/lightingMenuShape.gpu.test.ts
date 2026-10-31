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
});
