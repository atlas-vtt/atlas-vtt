import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { DrawMode } from '../../src/app/annotations/annotationTypes';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DrawToolBar } from '../../src/app/packages/components/toolbar/DrawToolBar';
import { DRAW_MODE_CHOICES, drawModeTools } from '../../src/app/packages/components/toolbar/drawToolChoices';
import { LightingToolBar } from '../../src/app/packages/components/toolbar/LightingToolBar';
import { MeasureToolBar } from '../../src/app/packages/components/toolbar/MeasureToolBar';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'D', useAtlasSettings: () => undefined }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
const MODES = '.atlas-tool-bar--modes';
const TOOLS = '.atlas-tool-bar--tools';
const MODE_NAMES = DRAW_MODE_CHOICES.map((choice) => choice.label);
const PEN = { type: 'pen' as const, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], color: '#e93147', width: 6, opacity: 1 };

/** The bottom row as the map has it: undo/redo at the left, the toolbar in the middle, the three tools' bars above it. */
describe('the Draw tool\'s bars above the toolbar', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;

  const mount = (toolbarWidth = 420): void => {
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
        store,
        children: h(BottomToolbarRow, {
          start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 104, height: 52 } }),
          // The tools' bars share the slot, outside any tooltip provider, as on the map.
          options: h(React.Fragment, null, h(LightingToolBar), h(MeasureToolBar, { playerView: false }), h(DrawToolBar)),
          children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: toolbarWidth, height: 58, boxSizing: 'border-box' } }, h(TooltipProvider, null)),
        }),
      }))));
  };

  beforeEach(async () => {
    await page.viewport(1400, 800);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `draw-bar-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'draw', isMapLoading: false });
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const rects = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
  /** A button's name: the text only screen readers get (a font's button also draws a letter as its icon). */
  const nameOf = (item: HTMLElement): string => item.querySelector('.sr-only')?.textContent ?? '';
  const names = (selector: string): string[] => [...document.querySelectorAll<HTMLElement>(`${selector} .atlas-tool-button button`)].map(nameOf);
  /** A button by its name: a tool of the mode's bar, else a mode (Line is both). */
  const button = (name: string): HTMLElement => [TOOLS, MODES].flatMap((bar) => [...document.querySelectorAll<HTMLElement>(`${bar} .atlas-tool-button button`)]).find((item) => nameOf(item) === name)!;
  /** The bars have risen into place, and the tools of `mode` have come out of the modes bar's side. */
  const settled = (mode: DrawMode = store.getState().drawTool.mode): Promise<void> => vi.waitFor(() => {
    expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect(MODES).bottom)).toBeLessThan(0.05);
    expect(document.querySelectorAll(TOOLS)).toHaveLength(1);
    expect(document.querySelector(TOOLS)!.getAttribute('aria-label')).toBe(`${DRAW_MODE_CHOICES.find((choice) => choice.value === mode)!.label} tools`);
    expect(names(TOOLS)).toHaveLength(drawModeTools(mode).flat().length);
    expect(Math.abs(rect(TOOLS).left - rect(MODES).right - 8)).toBeLessThan(0.05);
    expect(getComputedStyle(document.querySelector(TOOLS)!).opacity).toBe('1');
  }, { timeout: 3000 });
  const choose = async (mode: DrawMode): Promise<void> => {
    act(() => store.getState().setDrawTool({ mode }));
    await settled(mode);
  };

  it('puts the modes and the mode\'s tools in two bars from the toolbar\'s left edge, the toolbar drawn smaller', async () => {
    mount();
    await settled();
    const toolbar = rect('.atlas-main-toolbar');
    const modes = rect(MODES);
    const tools = rect(TOOLS);
    expect(modes.left).toBeCloseTo(toolbar.left, 0);
    expect(tools.bottom).toBeCloseTo(modes.bottom, 0);
    expect(tools.height).toBeCloseTo(modes.height, 1);
    expect(modes.height).toBeCloseTo(50, 0);
    expect(names(MODES)).toEqual(['Select', 'Pen', 'Line', 'Rectangle', 'Ellipse', 'Text', 'Stamp', 'Eraser']);
    expect(rects(`${MODES} .atlas-tool-button`).map((item) => Math.round(item.width))).toEqual(MODE_NAMES.map(() => 32));
    // The pen's tools: the four every drawing has, a doubled gap, and its see-through ink. Buttons of 32 px, 8 px apart, menus' buttons among them.
    expect(names(TOOLS)).toEqual(['Colour', 'Size', 'Players see it', 'On the map', 'See-through']);
    const controls = rects(`${TOOLS} .atlas-tool-button`);
    expect(controls.map((item) => [Math.round(item.width), Math.round(item.height)])).toEqual(controls.map(() => [32, 32]));
    expect(controls.slice(1).map((item, index) => Math.round(item.left - controls[index]!.right))).toEqual([8, 8, 8, 16]);
    expect(controls[0]!.left - tools.left).toBeCloseTo(tools.right - controls.at(-1)!.right, 1);
    const corner = (selector: string): number => parseFloat(getComputedStyle(document.querySelector(selector)!).borderTopLeftRadius);
    expect(corner(TOOLS) / tools.height).toBeCloseTo(corner(MODES) / modes.height, 2);
    // The end buttons are concentric with their bar, a menu's button too (the colour is the first tool).
    const radius = (name: string): string => getComputedStyle(button(name)).borderTopLeftRadius;
    expect(radius('Colour')).toBe(radius('Select'));
    expect(radius('Size')).not.toBe(radius('Colour'));
    // The dot shows the colour in hand.
    const dot = document.querySelector<HTMLElement>(`${TOOLS} .atlas-tool-bar__dot`)!;
    expect(getComputedStyle(dot).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(dot.getBoundingClientRect().width).toBeCloseTo(16, 0);
  });

  it('stands where the lighting tool\'s bars stand', async () => {
    store.setState({ activeTool: 'wall' });
    mount();
    await vi.waitFor(() => expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect(MODES).bottom)).toBeLessThan(0.05));
    const lighting = rect(MODES);
    act(() => store.setState({ activeTool: 'draw' }));
    await vi.waitFor(() => expect(document.querySelectorAll(MODES)).toHaveLength(1), { timeout: 2000 });
    await settled();
    expect(document.querySelector(MODES)!.getAttribute('aria-label')).toBe('Draw modes');
    const modes = rect(MODES);
    expect(modes.left).toBeCloseTo(lighting.left, 1);
    expect(modes.top).toBeCloseTo(lighting.top, 1);
    expect(modes.bottom).toBeCloseTo(lighting.bottom, 1);
    const row = document.querySelector<HTMLElement>('.atlas-bottom-toolbar-row')!;
    expect(parseFloat(row.style.getPropertyValue('--atlas-toolbar-lift'))).toBeCloseTo(modes.height + 8, 0);
  });

  it('never moves the modes bar when the mode changes, and keeps colour, size, players and layer in their place', async () => {
    mount();
    await settled();
    const modes = rect(MODES);
    const modeButtons = rects(`${MODES} .atlas-tool-button`).map((item) => item.left);
    const common = rects(`${TOOLS} .atlas-tool-button`).slice(0, 4).map((item) => item.left);
    const widths: Record<string, number> = {};
    for (const { value: mode } of DRAW_MODE_CHOICES) {
      await choose(mode);
      expect(rect(MODES)).toEqual(modes);
      expect(rects(`${MODES} .atlas-tool-button`).map((item) => item.left)).toEqual(modeButtons);
      widths[mode] = Math.round(rect(TOOLS).width);
      if (mode === 'eraser') continue;
      expect(names(TOOLS).slice(0, 4)).toEqual(['Colour', 'Size', 'Players see it', 'On the map']);
      expect(rects(`${TOOLS} .atlas-tool-button`).slice(0, 4).map((item) => item.left)).toEqual(common);
    }
    // Buttons of 32 px, 8 px apart and from the bar's edge, a group 8 px further: the widest pair is 330 + 8 + 378 px.
    expect(Math.round(modes.width)).toBe(330);
    expect(widths).toEqual({ select: 346, pen: 218, line: 378, rectangle: 258, ellipse: 258, text: 378, stamp: 218, eraser: 146 });
    // Line and Text have the most tools; no mode's bar is wider than theirs.
    expect(Math.max(...Object.values(widths))).toBe(widths.line);
    expect(widths.text).toBe(widths.line);
    // Rectangle and ellipse have the same tools: one bar, which stays mounted between them.
    await choose('rectangle');
    const bar = document.querySelector(TOOLS);
    await choose('ellipse');
    expect(document.querySelector(TOOLS)).toBe(bar);
  });

  it('names the tools of each mode, groups a doubled gap apart', async () => {
    mount();
    await settled();
    const gaps = (): number[] => {
      const controls = rects(`${TOOLS} .atlas-tool-button`);
      return controls.slice(1).map((item, index) => Math.round(item.left - controls[index]!.right));
    };
    await choose('line');
    expect(names(TOOLS)).toEqual(['Colour', 'Size', 'Players see it', 'On the map', 'Line', 'Ends', 'Curved', 'Fill', 'See-through']);
    expect(gaps()).toEqual([8, 8, 8, 16, 8, 8, 8, 8]);
    await choose('text');
    expect(names(TOOLS)).toEqual(['Colour', 'Size', 'Players see it', 'On the map', 'Font', 'Look', 'Align', 'Bold', 'Italic']);
    await choose('stamp');
    expect(names(TOOLS)).toEqual(['Colour', 'Size', 'Players see it', 'On the map', 'Symbol']);
    await choose('select');
    expect(names(TOOLS)).toEqual(['Colour', 'Size', 'Players see it', 'On the map', 'To front', 'To back', 'Lock', 'Clear']);
    expect(gaps()).toEqual([8, 8, 8, 16, 8, 8, 16]);
    await choose('eraser');
    expect(names(TOOLS)).toEqual(['Size', 'Whole drawings', 'Clear']);
    expect(gaps()).toEqual([16, 16]);
  });

  it('fits both bars of every mode in a row 900 px wide, every button inside its bar', async () => {
    await page.viewport(900, 700);
    mount(520);
    await settled();
    for (const { value: mode } of DRAW_MODE_CHOICES) {
      await choose(mode);
      const modes = rect(MODES);
      const tools = rect(TOOLS);
      expect(modes.left, mode).toBeGreaterThanOrEqual(0);
      expect(tools.right, mode).toBeLessThanOrEqual(900);
      expect(tools.top, mode).toBeCloseTo(modes.top, 0);
      expect(document.documentElement.scrollWidth, mode).toBeLessThanOrEqual(900);
      for (const selector of [MODES, TOOLS]) {
        const bar = rect(selector);
        for (const item of rects(`${selector} .atlas-tool-button`)) {
          expect(item.left).toBeGreaterThanOrEqual(bar.left + 8);
          expect(item.right).toBeLessThanOrEqual(bar.right - 8);
        }
      }
    }
    await choose('line');
    expect(rect(MODES).width + 8 + rect(TOOLS).width).toBeLessThanOrEqual(900);
  });

  it('opens a tool\'s choices above the bar, inside the view, shows the choice made as the button\'s face and closes on a pick', async () => {
    mount();
    await choose('line');
    const tools = rect(TOOLS);
    for (const [name, rows] of [['Size', ['Small', 'Medium', 'Large', 'Extra large']], ['Line', ['Solid', 'Dashed', 'Dotted']], ['Ends', ['No arrow', 'Arrow', 'Arrows at both ends']], ['Fill', ['No fill', 'Soft', 'Solid']]] as const) {
      act(() => button(name).click());
      const menu = rect(`${TOOLS} .atlas-dropdown-content`);
      expect(menu.bottom, name).toBeLessThan(tools.top);
      expect(menu.left, name).toBeGreaterThanOrEqual(0);
      expect(menu.top, name).toBeGreaterThanOrEqual(0);
      const items = [...document.querySelectorAll<HTMLElement>(`${TOOLS} .atlas-dropdown-content .atlas-dropdown-menu-item`)];
      expect(items.map((item) => item.textContent)).toEqual(rows);
      for (const item of items) expect(item.scrollWidth, name).toBeLessThanOrEqual(item.clientWidth);
      expect(button(name).getAttribute('aria-expanded')).toBe('true');
      const face = button(name).querySelector('svg')!.outerHTML;
      act(() => items.at(-1)!.click());
      expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();
      // Another choice, another face; the bar is as wide.
      expect(button(name).querySelector('svg')!.outerHTML).not.toBe(face);
      expect(rect(TOOLS)).toEqual(tools);
    }
    expect(store.getState().drawTool).toMatchObject({ size: 'xl', dash: 'dotted', ends: 'both', fill: 'solid' });

    // The colours: eight swatches in one row, black and white among them; a pick closes them and colours the dot.
    act(() => button('Colour').click());
    const swatches = rects(`${TOOLS} .atlas-swatch`);
    expect(swatches).toHaveLength(8);
    expect(new Set(swatches.map((swatch) => Math.round(swatch.top))).size).toBe(1);
    expect(rect(`${TOOLS} .atlas-dropdown-content`).bottom).toBeLessThan(tools.top);
    const red = swatches[2]!;
    act(() => document.elementFromPoint(red.left + red.width / 2, red.top + red.height / 2)!.closest<HTMLElement>('.atlas-swatch')!.click());
    expect(store.getState().drawTool.color).toBe('#e93147');
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();
    expect(getComputedStyle(document.querySelector(`${TOOLS} .atlas-tool-bar__dot`)!).backgroundColor).toBe('rgb(233, 49, 71)');

    // The symbols: twelve in two rows of six.
    await choose('stamp');
    act(() => button('Symbol').click());
    const symbols = rects(`${TOOLS} .atlas-icon-grid__item`);
    expect(symbols).toHaveLength(12);
    expect(new Set(symbols.map((symbol) => Math.round(symbol.top))).size).toBe(2);
    act(() => document.querySelectorAll<HTMLElement>(`${TOOLS} .atlas-icon-grid__item`)[5]!.click());
    expect(store.getState().drawTool.icon).toBe('skull');
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();
  });

  it('switches a two-state tool by a press, the bar as it was', async () => {
    mount();
    await choose('line');
    const tools = rect(TOOLS);
    for (const [name, field] of [['Players see it', 'players'], ['On the map', 'layer'], ['Curved', 'curved'], ['See-through', 'seeThrough']] as const) {
      const before = store.getState().drawTool[field];
      const pressed = button(name).getAttribute('aria-pressed');
      act(() => button(name).click());
      expect(store.getState().drawTool[field], name).not.toBe(before);
      expect(button(name).getAttribute('aria-pressed'), name).not.toBe(pressed);
      expect(rect(TOOLS)).toEqual(tools);
    }
    expect(store.getState().drawTool).toMatchObject({ players: false, layer: 'map', curved: true, seeThrough: true });
  });

  it('shows the style of what is selected, none where they differ, and a pick changes them', async () => {
    mount();
    const red = store.getState().addDrawing(PEN);
    const blue = store.getState().addDrawing({ ...PEN, color: '#086ddd', hidden: true });
    await choose('select');
    const dot = (): HTMLElement => document.querySelector<HTMLElement>(`${TOOLS} .atlas-tool-bar__dot`)!;
    expect(getComputedStyle(dot()).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(button('To front').getAttribute('aria-disabled')).toBe('true');

    act(() => store.getState().setSelection([red]));
    expect(getComputedStyle(dot()).backgroundColor).toBe('rgb(233, 49, 71)');
    expect(button('Players see it').getAttribute('aria-pressed')).toBe('true');
    expect(button('To front').getAttribute('aria-disabled')).toBeNull();

    act(() => store.getState().setSelection([red, blue]));
    expect(dot().classList.contains('atlas-tool-bar__dot--mixed')).toBe(true);
    expect(button('Players see it').getAttribute('aria-pressed')).toBe('false');
    const tools = rect(TOOLS);
    act(() => button('Players see it').click());
    expect(store.getState().objects.drawings[blue]!.hidden).toBeUndefined();
    expect(button('Players see it').getAttribute('aria-pressed')).toBe('true');
    act(() => button('Lock').click());
    expect(store.getState().objects.drawings[red]!.locked).toBe(true);
    expect(button('Lock').getAttribute('aria-pressed')).toBe('true');
    expect(rect(TOOLS)).toEqual(tools);
    // What is drawn next stays as it was.
    expect(store.getState().drawTool).toMatchObject({ color: '#ffffff', players: true });
  });

  it('offers Clear only what is there, each scope disabled while it has nothing', async () => {
    mount();
    await choose('eraser');
    expect(button('Clear').getAttribute('aria-disabled')).toBe('true');
    act(() => button('Clear').click());
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();

    let onMap = '';
    act(() => { onMap = store.getState().addDrawing({ ...PEN, layer: 'map' }); });
    expect(button('Clear').getAttribute('aria-disabled')).toBeNull();
    const rows = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>(`${TOOLS} .atlas-dropdown-content button`)];
    act(() => button('Clear').click());
    expect(rows().map((row) => row.textContent)).toEqual(['Drawings above the tokens', 'Everything on this map', 'Players\' drawings']);
    expect(rows().map((row) => row.disabled)).toEqual([true, false, true]);
    expect(rect(`${TOOLS} .atlas-dropdown-content`).bottom).toBeLessThan(rect(TOOLS).top);

    let above = '';
    act(() => { above = store.getState().addDrawing({ ...PEN, by: 'player-1' }); });
    expect(rows().map((row) => row.disabled)).toEqual([false, false, false]);
    act(() => rows()[0]!.click());
    expect(Object.keys(store.getState().objects.drawings)).toEqual([onMap]);
    expect(above).not.toBe('');
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();
  });

  it('stays in the session view and takes no choice, each button saying why; the players\' view has no bars', async () => {
    mount();
    await choose('line');
    const modes = rect(MODES);
    const tools = rect(TOOLS);
    act(() => store.getState().setGMView(false));
    expect(rect(MODES)).toEqual(modes);
    expect(rect(TOOLS)).toEqual(tools);
    const all = [...document.querySelectorAll<HTMLElement>('.atlas-tool-bar .atlas-tool-button button')];
    expect(all).toHaveLength(8 + 9);
    for (const item of all) expect(item.getAttribute('aria-disabled'), nameOf(item)).toBe('true');
    // A press opens no menu and changes nothing.
    act(() => button('Size').closest<HTMLElement>('.atlas-dropdown-menu')!.querySelector<HTMLElement>('span')!.click());
    expect(document.querySelector(`${TOOLS} .atlas-dropdown-content`)).toBeNull();
    expect(store.getState().drawTool.mode).toBe('line');

    act(() => store.setState({ isGMView: true, isPlayerView: true }));
    await vi.waitFor(() => expect(document.querySelector('.atlas-tool-bars')).toBeNull(), { timeout: 2000 });
  });
});
