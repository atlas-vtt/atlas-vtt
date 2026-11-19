import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import type { Application } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { MEASURE_HANDLE_RADIUS } from '../../src/app/pixi/measure/measureHandle';
import { MeasurePopoverHost } from '../../src/app/react/components/measure/MeasurePopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const VIEW = { width: 1200, height: 800 };
/** Between the handle's edge and the popover, and between the popover and the view's edges and bars. */
const GAP = 12;
const MARGIN = 8;
const WIDTH = 272;
/** A tool's bar above the toolbar, as high as it stands over the view's bottom edge. */
const BAR_TOP = VIEW.height - 120;
/** `VITE_MEASURE_POPOVER_CAPTURE=1` writes pictures of the popover with a look and with its light's fields open. */
const capture = import.meta.env.VITE_MEASURE_POPOVER_CAPTURE === '1';
const OUT = '../../out/measure-effects/mounted';

/** The measurement's popover on a map view of 1200 × 800 at zoom 1, the canvas filling the view, with a tool's bar and the toolbar at its bottom. */
describe('the popover of a kept measurement', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;
  const ticks = new Set<() => void>();

  const mount = (): void => {
    const viewport = { scale: { x: 1 }, toScreen: (x: number, y: number) => ({ x, y }) };
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: `${VIEW.width}px`, height: `${VIEW.height}px` });
    const ui = {
      app: createInMemoryApp({ files: {} }).app,
      view: null,
      pixiApp: { ticker: { add: (tick: () => void) => ticks.add(tick), remove: (tick: () => void) => ticks.delete(tick) } } as unknown as Application,
      renderer: { getViewportInstance: () => viewport, getCanvasElement: () => canvas, tokensInMeasure: () => [] },
    } as unknown as AtlasUIContextValue;
    const bars = h('div', { className: 'atlas-bottom-toolbar-row', style: { position: 'static', display: 'block' } },
      h('div', { className: 'atlas-tool-bar', style: { position: 'absolute', left: 16, top: BAR_TOP, width: 300, height: 40 } }),
      h('div', { className: 'atlas-vtt-toolbar', style: { position: 'absolute', left: 16, top: VIEW.height - 68, width: 420, height: 52 } }));
    const { container } = render(h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', width: VIEW.width, height: VIEW.height } },
      bars,
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, { store, children: h(MeasurePopoverHost) }))));
    container.firstElementChild!.prepend(canvas);
  };

  beforeEach(async () => {
    await page.viewport(1400, 900);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `measure-popover-layout-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ isMapLoading: false });
    store.getState().setSnapToGrid(true);
  });

  afterEach(() => {
    cleanup();
    ticks.clear();
    style.remove();
  });

  const keep = (x: number, y: number, shape: 'ruler' | 'circle' = 'ruler'): string =>
    store.getState().addMeasure({ shape, points: [{ x, y }, { x: x + 210, y }], ...(shape === 'circle' && { color: '#e93147', hidden: true as const }) })!;
  const popover = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-measure-popover')!;
  /** Opens the popover of `id` and waits until it has grown to its size and, coming from another measurement, arrived. */
  const open = async (id: string): Promise<void> => {
    await act(async () => { store.getState().openMeasurePopover(id); });
    await vi.waitFor(() => expect(popover().getBoundingClientRect().width).toBe(WIDTH));
    await Promise.all(popover().getAnimations().map((animation) => animation.finished));
    await act(async () => { ticks.forEach((tick) => tick()); });
  };
  const rect = (selector: string): DOMRect => popover().querySelector(selector)!.getBoundingClientRect();
  const view = (): DOMRect => document.querySelector('.atlas-vtt-plugin')!.getBoundingClientRect();
  /** The popover's box in the view's own pixels. */
  const box = (): { left: number; top: number; right: number; bottom: number; width: number; height: number } => {
    const own = popover().getBoundingClientRect();
    const { left, top } = view();
    return { left: own.left - left, top: own.top - top, right: own.right - left, bottom: own.bottom - top, width: own.width, height: own.height };
  };

  it('stands beside its handle, a gap from the handle\'s edge and level with it', async () => {
    mount();
    await open(keep(300, 400));
    const { left, top, height } = box();
    expect(left).toBe(300 + MEASURE_HANDLE_RADIUS + GAP);
    // The placement counts in whole pixels, and the popover's height is a fraction of one off.
    expect(Math.abs(top + height / 2 - 400)).toBeLessThan(1);
    // On the right half of the view it stands on the handle's left, the roomier side.
    const circle = keep(900, 400, 'circle');
    await open(circle);
    expect(box().right).toBe(900 - MEASURE_HANDLE_RADIUS - GAP);
  });

  it('stays inside the view and clear of the tool\'s bar and the toolbar for a handle near the bottom edge', async () => {
    mount();
    await open(keep(300, VIEW.height - 30));
    expect(box().bottom).toBeLessThan(BAR_TOP - MARGIN + 1);
    expect(box().bottom).toBeGreaterThan(BAR_TOP - MARGIN - 1);
    await open(keep(300, 6));
    expect(box().top).toBeGreaterThanOrEqual(MARGIN);
    await open(keep(VIEW.width - 4, 400));
    expect(box().right).toBeLessThanOrEqual(VIEW.width - MARGIN);
  });

  it('holds its parts in order inside one padding that is also the gap between them, the swatches in one row', async () => {
    mount();
    await open(keep(300, 400));
    const own = popover().getBoundingClientRect();
    const padding = Number.parseFloat(getComputedStyle(popover()).paddingLeft);
    const border = Number.parseFloat(getComputedStyle(popover()).borderLeftWidth);
    const inset = padding + border;
    expect(padding).toBe(8);
    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom'] as const) expect(Number.parseFloat(getComputedStyle(popover())[side])).toBe(padding);
    const swatches = rect('.atlas-swatch-grid');
    const players = rect('.atlas-light-popover__flicker');
    const remove = rect('.atlas-light-popover__delete');
    for (const part of [swatches, players, remove]) {
      expect(part.left).toBeGreaterThanOrEqual(own.left + inset - 0.5);
      expect(part.right).toBeLessThanOrEqual(own.right - inset + 0.5);
    }
    // The swatches come first: the popover has no heading and the swatches no label above them.
    expect(popover().querySelector('.atlas-light-popover__heading')).toBeNull();
    expect(Math.abs(swatches.top - (own.top + inset))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(own.bottom - inset - remove.bottom)).toBeLessThanOrEqual(0.5);
    expect(swatches.bottom).toBeLessThanOrEqual(players.top);
    expect(players.bottom).toBeLessThanOrEqual(remove.top);
    // Delete is the last thing in it, in its right corner.
    expect(Math.abs(own.right - inset - remove.right)).toBeLessThanOrEqual(0.5);
    const cells = [...popover().querySelectorAll('.atlas-swatch')].map((swatch) => swatch.getBoundingClientRect());
    expect(cells).toHaveLength(8);
    expect(new Set(cells.map((cell) => Math.round(cell.top))).size).toBe(1);
    expect(Math.max(...cells.map((cell) => cell.width)) - Math.min(...cells.map((cell) => cell.width))).toBeLessThanOrEqual(0.5);
    // The swatches take the chips' radius, concentric with the popover's corner, not a small square one.
    const corner = (selector: string): number => Number.parseFloat(getComputedStyle(popover().querySelector(selector)!).borderTopLeftRadius);
    expect(corner('.atlas-swatch')).toBeGreaterThanOrEqual(cells[0]!.width / 2 - 0.5);
    // The switch ends where the swatches end.
    const toggle = rect('.atlas-toggle');
    expect(Math.abs(toggle.right - swatches.right)).toBeLessThanOrEqual(0.5);
  });

  it('holds an area\'s looks in one row under its colours, seven chips across the popover, the chosen one ringed', async () => {
    mount();
    const circle = keep(300, 400, 'circle');
    await open(circle);
    const swatches = rect('.atlas-swatch-grid');
    const row = rect('.atlas-light-popover__kinds');
    const chips = [...popover().querySelectorAll('.atlas-light-kind')].map((chip) => chip.getBoundingClientRect());
    expect(chips).toHaveLength(7);
    expect(new Set(chips.map((chip) => Math.round(chip.top))).size).toBe(1);
    expect(row.top).toBeGreaterThanOrEqual(swatches.bottom);
    expect(Math.abs(row.left - swatches.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(row.right - swatches.right)).toBeLessThanOrEqual(0.5);
    expect(Math.max(...chips.map((chip) => chip.width)) - Math.min(...chips.map((chip) => chip.width))).toBeLessThanOrEqual(0.5);
    for (const chip of chips) expect(chip.width).toBeGreaterThanOrEqual(28);
    // A look's chip is as large as a colour's swatch, and the row runs from edge to edge like the swatches'.
    const swatch = popover().querySelector('.atlas-swatch')!.getBoundingClientRect();
    expect(Math.abs(chips[0]!.width - swatch.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(chips[0]!.left - row.left)).toBeLessThanOrEqual(0.5);
    // Each chip is a square, not a slot of the row's height.
    for (const chip of chips) expect(Math.abs(chip.width - chip.height)).toBeLessThanOrEqual(0.5);
    expect(chips.at(-1)!.right).toBeLessThanOrEqual(row.right + 0.5);
    const before = box();
    await act(async () => { store.getState().updateMeasure(circle, { effect: 'frost', color: '#8ad1f8' }); });
    expect(box()).toEqual(before);
    const pressed = [...popover().querySelectorAll('.atlas-light-kind[aria-pressed="true"]')];
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.getAttribute('aria-label')).toBe('Frost');
    if (capture) await page.screenshot({ path: `${OUT}/popover-frost.png` });
  });

  it('grows downward when the light is switched on: its top, its width and the switch stay where they are, and it shrinks back as it was', async () => {
    mount();
    await act(async () => { store.getState().setSceneLighting({ enabled: true }); });
    await open(keep(300, 400, 'circle'));
    const light = (): HTMLElement => [...popover().querySelectorAll<HTMLElement>('.atlas-light-popover__flicker')].find((row) => row.textContent === 'Gives light')!.querySelector<HTMLElement>('.atlas-toggle')!;
    const closed = box();
    const at = light().getBoundingClientRect();
    await act(async () => { light().click(); });
    await vi.waitFor(() => expect(box().height).toBeGreaterThan(closed.height + 60));
    await act(async () => { ticks.forEach((tick) => tick()); });
    const opened = box();
    expect(opened).toMatchObject({ left: closed.left, top: closed.top, width: closed.width });
    const after = light().getBoundingClientRect();
    expect([after.left, after.top]).toEqual([at.left, at.top]);
    // The two ranges on one line, their slider and the flicker under them, all inside the padding.
    const fields = [...popover().querySelectorAll('.atlas-light-popover__ranges, .slider-root, .atlas-select')].map((part) => part.getBoundingClientRect());
    expect(fields.length).toBeGreaterThanOrEqual(3);
    for (const part of fields) {
      expect(part.left).toBeGreaterThanOrEqual(popover().getBoundingClientRect().left + 8);
      expect(part.right).toBeLessThanOrEqual(popover().getBoundingClientRect().right - 8);
    }
    if (capture) await page.screenshot({ path: `${OUT}/popover-light.png` });
    await act(async () => { light().click(); });
    await vi.waitFor(() => expect(box().height).toBe(closed.height));
    await act(async () => { ticks.forEach((tick) => tick()); });
    expect(box()).toEqual(closed);
    // Reopened on a measurement that gives light, it stands level with its handle again.
    const lit = keep(700, 300, 'circle');
    await act(async () => { store.getState().updateMeasure(lit, { light: { bright: 10, dim: 20, color: '#e93147', intensity: 1, animation: 'none' } }); });
    await open(lit);
    expect(Math.abs(box().top + box().height / 2 - 300)).toBeLessThan(1);
    expect(box().height).toBe(opened.height);
  });

  it('stays clear of the bars when the fold opens near them: there it moves up rather than under them', async () => {
    mount();
    await act(async () => { store.getState().setSceneLighting({ enabled: true }); });
    await open(keep(300, VIEW.height - 260, 'circle'));
    const light = [...popover().querySelectorAll<HTMLElement>('.atlas-light-popover__flicker')].find((row) => row.textContent === 'Gives light')!.querySelector<HTMLElement>('.atlas-toggle')!;
    const closed = box();
    await act(async () => { light.click(); });
    await vi.waitFor(() => expect(box().height).toBeGreaterThan(closed.height + 60));
    await act(async () => { ticks.forEach((tick) => tick()); });
    expect(box().bottom).toBeLessThanOrEqual(BAR_TOP - MARGIN + 1);
    expect(box().left).toBe(closed.left);
  });

  it('keeps its size whatever is chosen in it, and for another measurement of its kind: an area\'s has one row more, for the walls', async () => {
    mount();
    const ruler = keep(300, 400);
    const circle = keep(300, 600, 'circle');
    const other = keep(700, 600, 'circle');
    await open(ruler);
    const { width, height } = box();
    expect(width).toBe(WIDTH);
    await act(async () => { store.getState().updateMeasure(ruler, { color: '#08b94e', hidden: true }); });
    expect(box()).toMatchObject({ width, height });
    await open(circle);
    const area = box();
    expect(area.width).toBe(width);
    expect(area.height).toBeGreaterThan(height + 20);
    await act(async () => { store.getState().updateMeasure(circle, { walls: false, hidden: undefined }); });
    expect(box()).toMatchObject({ width, height: area.height });
    await open(other);
    expect(box()).toMatchObject({ width, height: area.height });
  });
});
