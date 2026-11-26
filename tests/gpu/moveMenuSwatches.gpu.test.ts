import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { MoveToolGroup } from '../../src/app/packages/components/toolbar/MoveToolGroup';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'L', useAtlasSettings: () => undefined }));

/** The Move tool's menu as the main toolbar shows it, styled by the plugin's real stylesheet; buttons get Obsidian's height. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
  button { height: 30px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;

describe('the Move tool\'s menu', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('keeps the gap between the laser colours, each swatch as wide as its column', async () => {
    await page.viewport(600, 700);
    document.head.append(style);
    const store: ViewAtlasStore = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `move-menu-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    render(h('div', { className: 'atlas-vtt-plugin' },
      h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { position: 'fixed', left: 40, bottom: 20 } },
        h(TooltipProvider, null, h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
          store,
          children: h(MoveToolGroup, { activeTool: 'select', selectTool: () => undefined, menuOpen: true, toggleMenu: () => undefined }),
        }))))));
    const swatches = [...document.querySelectorAll<HTMLElement>('.atlas-swatch')].map((swatch) => swatch.getBoundingClientRect());
    expect(swatches).toHaveLength(8);
    for (let i = 1; i < swatches.length; i++) expect(swatches[i]!.left - swatches[i - 1]!.right).toBeCloseTo(4, 1);
    for (const swatch of swatches) expect(swatch.width).toBeCloseTo(swatch.height, 1);
    // The chosen colour's ring lies inside it, so it takes nothing of the gaps to its neighbours.
    const chosen = getComputedStyle(document.querySelector('.atlas-swatch--active')!).boxShadow;
    expect(chosen.split('inset').length - 1).toBe(2);
  });
});
