import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
// Where the row puts what stands above it: the turn banner's stylesheet, which the map always has.
import '../../src/app/initiative/banner/turn-banner.scss';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DrawToolBar } from '../../src/app/packages/components/toolbar/DrawToolBar';
import { openShapeOf } from '../../src/app/pixi/utils/openShape';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { OpenShapeStrip } from '../../src/app/react/components/OpenShapeStrip';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'K', useAtlasSettings: () => undefined }));
vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => true }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const ui = { app: undefined, view: { serviceManager: { getEventBus: () => ({ emit: () => true }) } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
const STRIP = '.atlas-placement-strip';
/** An iPad held upright. */
const VIEW = { width: 820, height: 1180 };

/** The bottom row under a finger, the Draw tool in hand with its bars, and a line that waits for its next corner. */
describe('the strip of a shape under way, on a tablet', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;
  const calls: string[] = [];
  const tool = {};
  const controls = { finish: (): void => { calls.push('finish'); }, back: (): void => { calls.push('back'); } };

  beforeEach(async () => {
    await page.viewport(VIEW.width, VIEW.height);
    document.head.append(style);
    document.body.setAttribute('data-atlas-pointer', 'coarse');
    calls.length = 0;
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `open-shape-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'draw', isMapLoading: false });
    render(h('div', { className: 'atlas-vtt-plugin', style: { position: 'fixed', inset: 0 } },
      h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, {
        store,
        children: h(BottomToolbarRow, {
          start: h('div', { className: 'atlas-vtt-toolbar', style: { width: 104, height: 56 } }),
          options: h(DrawToolBar),
          above: h(OpenShapeStrip),
          children: h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', style: { width: 420, height: 56 } }, h(TooltipProvider, null)),
        }),
      }))));
  });

  afterEach(() => {
    openShapeOf(store).end(tool);
    cleanup();
    style.remove();
    document.body.removeAttribute('data-atlas-pointer');
  });

  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const button = (name: string): HTMLButtonElement => [...document.querySelectorAll<HTMLButtonElement>(`${STRIP} button`)].find((item) => item.textContent === name)!;
  const shown = async (): Promise<void> => {
    await vi.waitFor(() => {
      // Risen into place above the tool's bars, which have risen above the toolbar.
      const bars = document.querySelector('.atlas-tool-bars');
      expect(bars).not.toBeNull();
      expect(getComputedStyle(document.querySelector(STRIP)!).opacity).toBe('1');
      expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect('.atlas-tool-bar--modes').bottom)).toBeLessThan(0.05);
    }, { timeout: 3000 });
  };

  it('stands above the tool\'s bars, centred, inside the view, and moves no bar when it comes', async () => {
    await vi.waitFor(() => expect(Math.abs(rect('.atlas-main-toolbar').top - 8 - rect('.atlas-tool-bar--modes').bottom)).toBeLessThan(0.05), { timeout: 3000 });
    const before = [...document.querySelectorAll('.atlas-tool-bar')].map((bar) => bar.getBoundingClientRect());
    expect(document.querySelector(STRIP)).toBeNull();
    act(() => openShapeOf(store).show(tool, controls, { canFinish: true, canGoBack: true }));
    await shown();
    const strip = rect(STRIP);
    const bars = [...document.querySelectorAll('.atlas-tool-bar')].map((bar) => bar.getBoundingClientRect());
    expect(bars).toEqual(before);
    // Above every bar of the tool, by the row's gap, and no bar under it.
    const barsTop = Math.min(...bars.map((bar) => bar.top));
    expect(barsTop - strip.bottom).toBeGreaterThanOrEqual(7.5);
    expect(barsTop - strip.bottom).toBeLessThan(9);
    expect(strip.left).toBeGreaterThanOrEqual(0);
    expect(strip.right).toBeLessThanOrEqual(VIEW.width);
    expect((strip.left + strip.right) / 2).toBeCloseTo(VIEW.width / 2, 0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(VIEW.width);
    // Every bar of the tool stays within the view too.
    for (const bar of bars) {
      expect(bar.left).toBeGreaterThanOrEqual(0);
      expect(bar.right).toBeLessThanOrEqual(VIEW.width);
    }
  });

  it('has two buttons a finger can press, inside the strip by its inset, and takes the press', async () => {
    act(() => openShapeOf(store).show(tool, controls, { canFinish: true, canGoBack: true }));
    await shown();
    const strip = rect(STRIP);
    const boxes = ['Undo point', 'Done'].map((name) => button(name).getBoundingClientRect());
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.top - strip.top).toBeCloseTo(strip.bottom - box.bottom, 1);
    }
    // The same distance inside the strip's border on every side, and between the two.
    const border = parseFloat(getComputedStyle(document.querySelector(STRIP)!).borderLeftWidth);
    const inset = boxes[0]!.left - strip.left - border;
    expect(inset).toBeGreaterThan(0);
    expect(strip.right - boxes[1]!.right - border).toBeCloseTo(inset, 1);
    expect(boxes[0]!.top - strip.top - border).toBeCloseTo(inset, 1);
    expect(boxes[1]!.left - boxes[0]!.right).toBeCloseTo(inset, 1);
    for (const name of ['Undo point', 'Done']) {
      const box = button(name).getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      expect(hit?.closest('button')).toBe(button(name));
      act(() => button(name).click());
    }
    expect(calls).toEqual(['back', 'finish']);
  });

  it('keeps Undo point in its place, disabled, while the shape has only its first point', async () => {
    act(() => openShapeOf(store).show(tool, controls, { canFinish: true, canGoBack: true }));
    await shown();
    const before = ['Undo point', 'Done'].map((name) => button(name).getBoundingClientRect());
    act(() => openShapeOf(store).show(tool, controls, { canFinish: true, canGoBack: false }));
    expect(button('Undo point').disabled).toBe(true);
    expect(['Undo point', 'Done'].map((name) => button(name).getBoundingClientRect())).toEqual(before);
    act(() => button('Undo point').click());
    expect(calls).toEqual([]);
  });
});
