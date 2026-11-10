import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { LightingSettingsPanel } from '../../src/app/react/components/command-palette/LightingSettingsPanel';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #dadada; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --input-height: 30px; --line-height-tight: 1.3; }
`;
const h = React.createElement;
const ui = { app: undefined, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;

/** The Lighting page inside the palette's own frame, at the size the palette gives its pages. */
describe('the command palette\'s Lighting page', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;

  beforeEach(async () => {
    await page.viewport(1100, 700);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `lighting-page-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setSceneLighting({ enabled: true });
    render(h('div', { className: 'atlas-vtt-plugin', style: { padding: 40 } },
      h('div', { className: 'atlas-command-palette-container atlas-command-palette-container--expanded' },
        h('div', { className: 'atlas-command-palette-options' },
          h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, { store, children: h(LightingSettingsPanel) }))))));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const all = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)];

  it('fits the palette: no label is cut off and nothing scrolls sideways', async () => {
    const panel = document.querySelector<HTMLElement>('.atlas-command-palette-panel')!;
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    for (const option of all('.atlas-segmented__option')) expect(option.scrollWidth, option.textContent ?? '').toBeLessThanOrEqual(option.clientWidth);
    for (const label of all('.atlas-setting-label')) expect(label.scrollWidth, label.textContent ?? '').toBeLessThanOrEqual(label.clientWidth);
    // The page needs no scrolling at the palette's own height.
    const frame = document.querySelector<HTMLElement>('.atlas-command-palette-container')!;
    expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.getBoundingClientRect().bottom);
  });

  it('ends every control on its column\'s right edge, and moves nothing when dynamic lighting goes off', async () => {
    const edges = (): number[][] => all('.atlas-command-palette-panel-column').map((column) => {
      const right = column.getBoundingClientRect().right;
      return [...column.children].map((row) => Math.round((right - (row.lastElementChild ?? row).getBoundingClientRect().right) * 10) / 10);
    });
    for (const column of edges()) for (const gap of column) expect(gap).toBe(0);
    const places = (): number[] => all('.atlas-command-palette-panel-column > *').map((row) => Math.round(row.getBoundingClientRect().top));
    const before = places();
    act(() => store.getState().setSceneLighting({ enabled: false }));
    expect(places()).toEqual(before);
  });
});
