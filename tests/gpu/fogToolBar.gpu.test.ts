import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { FogToolBar } from '../../src/app/packages/components/toolbar/FogToolBar';
import { MeasureToolBar } from '../../src/app/packages/components/toolbar/MeasureToolBar';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryPluginData } from '../mocks/pluginData';

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
  /* The utility the buttons' names are hidden with, as the plugin's stylesheet has it. */
  .atlas-vtt-plugin .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
`;
const h = React.createElement;
const WHATS = '.atlas-tool-bar--modes';
const TOOLS = '.atlas-tool-bar--tools';

/** The bottom row as the map has it: undo/redo at the left, the toolbar, and the fog tool's bars above beside the measure tool's. */
describe('the fog tool\'s bars above the toolbar', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;
  let settings: SettingsService;

  const mount = (toolbarWidth = 420): void => {
    const { app } = createInMemoryApp({ files: {} });
    settings = new SettingsService(app, undefined, memoryPluginData({}));
    store = createViewAtlasStore(app, `fog-bar-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'fog', isMapLoading: false });
    const ui = { app, view: null, pixiApp: null, renderer: { getMapRect: () => ({ x: 0, y: 0, width: 700, height: 700 }) } } as unknown as AtlasUIContextValue;
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
        store,
        children: h(BottomToolbarRow, {
          start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 104, height: 48 } }),
          // Both tools' bars share the slot, outside any tooltip provider, as on the map.
          options: h(React.Fragment, null, h(FogToolBar), h(MeasureToolBar, { playerView: false })),
          children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: toolbarWidth, height: 48 } }),
        }),
      }))));
  };

  beforeEach(async () => {
    await page.viewport(1400, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const rects = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
  const settled = (): Promise<void> => vi.waitFor(() => {
    // The bars have risen into place once they stand their gap above the toolbar.
    expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect(WHATS).bottom)).toBeLessThan(0.05);
  });
  const button = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('.atlas-tool-bar button')].find((item) => item.textContent === name)!;
  const centre = (box: DOMRect): { x: number; y: number } => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

  it('puts what the tool does and its tools in two bars from the toolbar\'s left edge, groups a doubled gap apart', async () => {
    mount();
    await settled();
    const toolbar = rect('.atlas-main-toolbar');
    const whats = rect(WHATS);
    const tools = rect(TOOLS);
    expect(whats.left).toBeCloseTo(toolbar.left, 0);
    expect(tools.left).toBeCloseTo(whats.right + 8, 0);
    expect(tools.bottom).toBeCloseTo(whats.bottom, 0);
    expect(tools.height).toBeCloseTo(whats.height, 1);
    expect(rects(`${WHATS} .atlas-tool-button`).map((item) => Math.round(item.width))).toEqual([32, 32]);
    const controls = rects(`${TOOLS} .atlas-tool-button`);
    expect(controls.map((item) => [Math.round(item.width), Math.round(item.height)])).toEqual(Array.from({ length: 10 }, () => [32, 32]));
    // Brush, Rectangle, Polygon, Lasso, Cells, Room, the size | Cover all, Delete all fog | More
    expect(controls.slice(1).map((item, index) => Math.round(item.left - controls[index]!.right))).toEqual([4, 4, 4, 4, 4, 4, 8, 4, 8]);
    expect(controls[0]!.left - tools.left).toBeCloseTo(tools.right - controls[9]!.right, 1);
  });

  it('shows the brush\'s size as a round dot in the middle of its button, which grows with the brush', async () => {
    mount();
    await settled();
    const dot = (): DOMRect => rect('.atlas-fog-size-dot');
    const holder = (): DOMRect => button('Brush size').getBoundingClientRect();
    const sizes: number[] = [];
    for (const brushSize of [10, 50, 200]) {
      act(() => store.getState().setFogTool({ brushSize }));
      expect(dot().width).toBeCloseTo(dot().height, 1);
      expect(centre(dot()).x).toBeCloseTo(centre(holder()).x, 0);
      expect(centre(dot()).y).toBeCloseTo(centre(holder()).y, 0);
      sizes.push(dot().width);
    }
    expect(sizes[0]).toBeGreaterThanOrEqual(4);
    expect(sizes[1]).toBeGreaterThan(sizes[0]!);
    expect(sizes[2]).toBeGreaterThan(sizes[1]!);
    expect(sizes[2]).toBeLessThanOrEqual(16);
    const look = getComputedStyle(document.querySelector('.atlas-fog-size-dot')!);
    expect(look.borderTopLeftRadius).toBe('50%');
    // In the button's own ink: seen on the bar.
    expect(look.backgroundColor).toBe(getComputedStyle(button('Brush size')).color);
    expect(look.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  it('moves nothing when what the tool does, the shape or the brush\'s size changes, or fog comes on the map', async () => {
    mount();
    await settled();
    const whats = rect(WHATS);
    const tools = rect(TOOLS);
    const places = (): number[] => rects('.atlas-tool-bar .atlas-tool-button').map((item) => item.left);
    const buttons = places();
    const same = (): void => {
      expect(rect(WHATS)).toEqual(whats);
      expect(rect(TOOLS)).toEqual(tools);
      expect(places()).toEqual(buttons);
    };
    for (const name of ['Eraser', 'Fog', 'Rectangle', 'Polygon', 'Lasso', 'Cells', 'Brush']) {
      act(() => button(name).click());
      same();
    }
    // Room is off without walls and on with them, in the same place.
    expect(button('Room').getAttribute('aria-disabled')).toBe('true');
    act(() => {
      for (const [x1, y1, x2, y2] of [[70, 70, 350, 70], [350, 70, 350, 350], [350, 350, 70, 350], [70, 350, 70, 70]] as const) {
        store.getState().addWall({ type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
      }
    });
    same();
    for (const name of ['Room', 'Eraser', 'Fog', 'Brush']) {
      act(() => button(name).click());
      same();
    }
    expect(store.getState().fogTool.shape).toBe('brush');
    for (const brushSize of [10, 200]) {
      act(() => store.getState().setFogTool({ brushSize }));
      same();
    }
    expect(button('Delete all fog').getAttribute('aria-disabled')).toBe('true');
    act(() => button('Cover all').click());
    expect(Object.keys(store.getState().objects.fog)).toHaveLength(1);
    expect(button('Delete all fog').getAttribute('aria-disabled')).toBeNull();
    same();
  });

  it('opens the brush\'s size and the More menu above the bar, inside the view, and closes one for the other', async () => {
    mount();
    await settled();
    const menus = (): DOMRect[] => rects(`${TOOLS} .atlas-dropdown-content`);
    act(() => button('Brush size').click());
    expect(menus()).toHaveLength(1);
    const size = menus()[0]!;
    expect(size.bottom).toBeLessThanOrEqual(rect(TOOLS).top);
    expect(centre(size).x).toBeCloseTo(centre(button('Brush size').getBoundingClientRect()).x, 0);
    const track = rect(`${TOOLS} .atlas-dropdown-content .slider-root`);
    expect(track.left).toBeGreaterThanOrEqual(size.left + 8);
    expect(track.right).toBeLessThanOrEqual(size.right - 8);

    // A press outside the open menu closes it, as on any other control of the bar.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await vi.waitFor(() => expect(menus()).toHaveLength(0));
    act(() => button('More').click());
    expect(menus()).toHaveLength(1);
    const more = menus()[0]!;
    expect(more.bottom).toBeLessThanOrEqual(rect(TOOLS).top);
    expect(more.left).toBeGreaterThanOrEqual(0);
    expect(more.right).toBeLessThanOrEqual(1400);
    // The hint under the party switch wraps on the rows' width: the menu is no wider for it.
    const hint = document.querySelector<HTMLElement>(`${TOOLS} .atlas-dropdown-hint`)!;
    const row = rect(`${TOOLS} .atlas-dropdown-toggle-row`);
    expect(hint.getBoundingClientRect().left).toBeCloseTo(row.left, 1);
    expect(hint.getBoundingClientRect().right).toBeCloseTo(row.right, 1);
    expect(hint.getBoundingClientRect().height).toBeGreaterThan(1.5 * parseFloat(getComputedStyle(hint).fontSize));
    expect(more.width).toBeLessThan(300);
    // The menu has one text edge: its action begins on it with its icon, where the switch's and the sliders' names begin.
    const edge = rect(`${TOOLS} .atlas-dropdown-toggle-row__label`).left;
    expect(rect(`${TOOLS} .atlas-dropdown-slider-row .atlas-dropdown-label`).left + parseFloat(getComputedStyle(document.querySelector(`${TOOLS} .atlas-dropdown-slider-row .atlas-dropdown-label`)!).paddingLeft)).toBeCloseTo(edge, 1);
    const across = rect(`${TOOLS} .atlas-dropdown-content .slider-root`);
    const actions = [...document.querySelectorAll<HTMLElement>(`${TOOLS} .atlas-dropdown-content .atlas-dropdown-menu-item`)];
    expect(actions.map((action) => action.textContent)).toEqual(['Hide all rooms']);
    for (const action of actions) {
      const [icon, label] = [action.querySelector('svg')!.getBoundingClientRect(), action.querySelector('span')!.getBoundingClientRect()];
      expect(icon.left).toBeCloseTo(edge, 1);
      expect(label.left).toBeCloseTo(icon.right + 8, 1);
      // The row itself spans the menu, as a slider's track does.
      expect(action.getBoundingClientRect().left).toBeCloseTo(across.left, 1);
      expect(action.getBoundingClientRect().right).toBeCloseTo(across.right, 1);
    }
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-slider-row__value`)!.textContent).toBe('50%');
    act(() => settings.setGmFogOpacity(0.8));
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-slider-row__value`)!.textContent).toBe('80%');
  });

  it('keeps every button inside its bar and the bars and the More menu inside a narrow view', async () => {
    // Three things the tool does and ten buttons beside them: 580 px with the gap between the bars.
    await page.viewport(600, 700);
    mount(320);
    await settled();
    expect(rect(WHATS).left).toBeGreaterThanOrEqual(0);
    expect(rect(TOOLS).right).toBeLessThanOrEqual(600);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(600);
    for (const selector of [WHATS, TOOLS]) {
      const bar = rect(selector);
      for (const item of rects(`${selector} .atlas-tool-button`)) {
        expect(item.left).toBeGreaterThanOrEqual(bar.left + 4);
        expect(item.right).toBeLessThanOrEqual(bar.right - 4);
      }
    }
    act(() => button('More').click());
    await vi.waitFor(() => {
      const menu = rect(`${TOOLS} .atlas-dropdown-content`);
      expect(menu.left).toBeGreaterThanOrEqual(0);
      expect(menu.right).toBeLessThanOrEqual(600);
    });
  });
});
