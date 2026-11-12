import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { MeasureToolBar } from '../../src/app/packages/components/toolbar/MeasureToolBar';
import { MeasureToolGroup } from '../../src/app/packages/components/toolbar/MeasureToolGroup';
import { MEASURE_MODES } from '../../src/app/packages/components/toolbar/measureToolChoices';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'K', useAtlasSettings: () => undefined }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
const MODES = '.atlas-tool-bar--modes';
const CHOICES = '.atlas-tool-bar--tools';

/** The bottom row as the map has it: undo/redo at the left, the measure tool in the toolbar, its bars above beside the lighting tool's. */
describe('the measure tool\'s bars above the toolbar', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;

  const mount = (options: { toolbarWidth?: number; menuOpen?: boolean } = {}): void => {
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
        store,
        children: h(BottomToolbarRow, {
          start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 104, height: 52 } }),
          // Both tools' bars share the slot, outside any tooltip provider, as on the map.
          options: h(React.Fragment, null, h(LightingToolBar), h(MeasureToolBar, { playerView: false })),
          children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: options.toolbarWidth ?? 420 } }, h(TooltipProvider, null,
            h(MeasureToolGroup, { activeTool: 'measure', selectTool: () => undefined, menuOpen: options.menuOpen ?? false, toggleMenu: () => undefined, closeMenu: () => undefined }))),
        }),
      }))));
  };

  beforeEach(async () => {
    await page.viewport(1400, 800);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `measure-bar-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'measure', isMapLoading: false });
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const rects = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
  const settled = (): Promise<void> => vi.waitFor(() => {
    // The bars have risen into place once they stand their gap above the toolbar.
    expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect(MODES).bottom)).toBeLessThan(0.05);
  });
  const button = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('.atlas-tool-bar button')].find((item) => item.textContent === name)!;

  it('puts the modes and the four choices in two bars from the toolbar\'s left edge, the toolbar drawn smaller', async () => {
    mount();
    await settled();
    const toolbar = rect('.atlas-main-toolbar');
    const modes = rect(MODES);
    const choices = rect(CHOICES);
    expect(modes.left).toBeCloseTo(toolbar.left, 0);
    expect(choices.left).toBeCloseTo(modes.right + 8, 0);
    expect(choices.bottom).toBeCloseTo(modes.bottom, 0);
    expect(choices.height).toBeCloseTo(modes.height, 1);
    expect(modes.height).toBeCloseTo(50, 0);
    // Buttons of 32 px in 8 px of padding, 8 px apart, the colour's among them.
    expect(rects(`${MODES} .atlas-tool-button`).map((item) => Math.round(item.width))).toEqual(MEASURE_MODES.map(() => 32));
    const controls = rects(`${CHOICES} .atlas-tool-button`);
    expect(controls.map((item) => [Math.round(item.width), Math.round(item.height)])).toEqual([[32, 32], [32, 32], [32, 32], [32, 32]]);
    expect(controls.slice(1).map((item, index) => Math.round(item.left - controls[index]!.right))).toEqual([8, 8, 8]);
    expect(controls[0]!.left - choices.left).toBeCloseTo(choices.right - controls[3]!.right, 1);
    const corner = (selector: string): number => parseFloat(getComputedStyle(document.querySelector(selector)!).borderTopLeftRadius);
    expect(corner(CHOICES) / choices.height).toBeCloseTo(corner('.atlas-main-toolbar') / toolbar.height, 2);
    // The dot shows the colour the next measurement takes: the theme's accent until one is chosen.
    const dot = document.querySelector<HTMLElement>('.atlas-tool-bar__dot')!;
    expect(getComputedStyle(dot).backgroundColor).toBe('rgb(127, 109, 242)');
    act(() => store.getState().setMeasureTool({ color: '#e93147' }));
    expect(getComputedStyle(dot).backgroundColor).toBe('rgb(233, 49, 71)');
    expect(dot.getBoundingClientRect().width).toBeCloseTo(16, 0);
  });

  it('moves nothing when the mode changes, Keep or Players switch, or Clear comes on', async () => {
    mount();
    await settled();
    const modes = rect(MODES);
    const choices = rect(CHOICES);
    const places = (): number[] => rects('.atlas-tool-bar .atlas-tool-button').map((item) => item.left);
    const buttons = places();
    const same = (): void => {
      expect(rect(MODES)).toEqual(modes);
      expect(rect(CHOICES)).toEqual(choices);
      expect(places()).toEqual(buttons);
    };
    for (const mode of ['circle', 'cone', 'ruler'] as const) {
      act(() => store.getState().setMeasureTool({ mode }));
      same();
    }
    act(() => button('Keep').click());
    expect(store.getState().measureTool.keep).toBe(true);
    same();
    act(() => button('Players see it').click());
    expect(store.getState().measureTool.players).toBe(false);
    same();
    expect(button('Clear').getAttribute('aria-disabled')).toBe('true');
    act(() => { store.getState().addMeasure({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }); });
    expect(button('Clear').getAttribute('aria-disabled')).toBeNull();
    same();
  });

  it('stands where the lighting tool\'s bars stand, from the moment the tool is chosen', async () => {
    store.setState({ activeTool: 'wall' });
    mount();
    await settled();
    const lighting = rect(MODES);
    act(() => store.setState({ activeTool: 'measure' }));
    // While the lighting tool's bars fade, the measure tool's already start at the toolbar's left edge.
    const measure = [...document.querySelectorAll<HTMLElement>(MODES)].find((bar) => bar.getAttribute('aria-label') === 'Measure modes')!;
    expect(measure.getBoundingClientRect().left).toBeCloseTo(rect('.atlas-main-toolbar').left, 0);
    await vi.waitFor(() => expect(document.querySelectorAll(MODES)).toHaveLength(1), { timeout: 2000 });
    await settled();
    const modes = rect(MODES);
    expect(document.querySelector(MODES)).toBe(measure);
    expect(modes.left).toBeCloseTo(lighting.left, 1);
    expect(modes.top).toBeCloseTo(lighting.top, 1);
    expect(modes.bottom).toBeCloseTo(lighting.bottom, 1);
    const row = document.querySelector<HTMLElement>('.atlas-bottom-toolbar-row')!;
    expect(parseFloat(row.style.getPropertyValue('--atlas-toolbar-lift'))).toBeCloseTo(modes.height + 8, 0);
  });

  it('keeps every button inside its bar and the bars inside a narrow view', async () => {
    await page.viewport(520, 700);
    mount({ toolbarWidth: 320 });
    await settled();
    const choices = rect(CHOICES);
    // The six modes and the four choices need more room than the toolbar's left edge leaves: they move left by what they lack.
    expect(rect(MODES).left).toBeLessThan(rect('.atlas-main-toolbar').left);
    expect(choices.right).toBeCloseTo(rect('.atlas-bottom-toolbar-row').right, 0);
    expect(rect(MODES).left).toBeGreaterThanOrEqual(0);
    expect(choices.right).toBeLessThanOrEqual(520);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(520);
    for (const selector of [MODES, CHOICES]) {
      const bar = rect(selector);
      for (const item of rects(`${selector} .atlas-tool-button`)) {
        expect(item.left).toBeGreaterThanOrEqual(bar.left + 8);
        expect(item.right).toBeLessThanOrEqual(bar.right - 8);
      }
    }
  });

  it('opens the colours above the bar, inside the view, eight in a row, and takes a click on one', async () => {
    mount();
    await settled();
    act(() => button('Colour').click());
    const colours = rect(`${CHOICES} .atlas-dropdown-content`);
    expect(colours.bottom).toBeLessThan(rect(CHOICES).top);
    expect(colours.left).toBeGreaterThanOrEqual(0);
    expect(colours.top).toBeGreaterThanOrEqual(0);
    const swatches = rects(`${CHOICES} .atlas-swatch`);
    expect(swatches).toHaveLength(8);
    expect(new Set(swatches.map((swatch) => Math.round(swatch.top))).size).toBe(1);
    // The first is the theme's accent.
    expect(getComputedStyle(document.querySelector(`${CHOICES} .atlas-swatch`)!).backgroundColor).toBe('rgb(127, 109, 242)');
    const red = swatches[2]!;
    const hit = document.elementFromPoint(red.left + red.width / 2, red.top + red.height / 2);
    expect(hit?.closest('.atlas-swatch')).not.toBeNull();
    act(() => hit!.closest<HTMLElement>('.atlas-swatch')!.click());
    expect(store.getState().measureTool.color).toBe('#e93147');
    expect(document.querySelector(`${CHOICES} .atlas-dropdown-content`)).toBeNull();
    // Opening and closing the colours moved neither bar.
    await settled();
  });

  it('fits when a dragged token shows its distance into the menu as one row', async () => {
    mount({ menuOpen: true });
    await settled();
    const menu = document.querySelector<HTMLElement>('.atlas-main-toolbar .atlas-dropdown-content')!;
    const track = menu.querySelector<HTMLElement>('.atlas-segmented')!;
    const options = [...track.querySelectorAll<HTMLElement>('.atlas-segmented__option')];
    expect(options.map((option) => option.textContent)).toEqual(['Always', 'In combat', 'Never']);
    expect(new Set(options.map((option) => Math.round(option.getBoundingClientRect().top))).size).toBe(1);
    for (const option of options) expect(option.scrollWidth).toBeLessThanOrEqual(option.clientWidth);
    const inner = menu.getBoundingClientRect();
    expect(track.getBoundingClientRect().left).toBeGreaterThanOrEqual(inner.left + 8);
    expect(track.getBoundingClientRect().right).toBeLessThanOrEqual(inner.right - 8);
    expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth);
    // Its label starts on the menu's text edge, where the rules row's text does not start left of it.
    const label = menu.querySelector<HTMLElement>('.atlas-dropdown-label')!;
    expect(parseFloat(getComputedStyle(label).paddingLeft)).toBe(12);
  });
});
