import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { Frame } from '../../src/app/annotations/annotationFrame';
import { HANDLE_LOOK } from '../../src/app/annotations/annotationHandles';
import { BAR_GAP } from '../../src/app/packages/components/toolbar/selectionBarPlacement';
import { SelectionBarHost } from '../../src/app/packages/components/toolbar/SelectionBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'D', useAtlasSettings: () => undefined }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --icon-m: 18px; --icon-opacity: 0.85; --icon-opacity-hover: 1; --icon-opacity-active: 1; }
  .map-area { position: relative; width: 1200px; height: 800px; }
  .map-area canvas { position: absolute; inset: 0; width: 1200px; height: 800px; }
`;
const h = React.createElement;
const BAR = '.atlas-selection-bar';
const TEXT = { x: 600, y: 300, text: 'Gate', fontSize: 24, fontFamily: 'Atlas Fantaisie Artistique', color: '#ffffff' };

/** The bar on a map area 1200 × 800 px, with a canvas that shows world pixels as screen pixels and a frame the test sets. */
describe('the bar under a selection on the map', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let store: ViewAtlasStore;
  let frame: Frame | null = null;
  const ticks = new Set<() => void>();
  let clock: ReturnType<typeof setInterval> | undefined;

  const mount = (): void => {
    const canvas = document.createElement('canvas');
    const renderer = {
      getAnnotations: () => ({ barFrame: () => frame }),
      getViewportInstance: () => ({ scale: { x: 1 }, toScreen: (x: number, y: number) => ({ x, y }) }),
      getCanvasElement: () => canvas,
    };
    const pixiApp = { ticker: { add: (tick: () => void) => ticks.add(tick), remove: (tick: () => void) => ticks.delete(tick) } };
    const ui = { app: undefined, view: null, pixiApp, renderer } as unknown as AtlasUIContextValue;
    render(h('div', { className: 'atlas-vtt-plugin' },
      h('div', { className: 'map-area', ref: (area: HTMLDivElement | null) => area?.prepend(canvas) },
        h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, { store, children: h(SelectionBarHost) })))));
  };
  /** Frames the box around (x, y), `width` × `height`, and selects `ids`. */
  const select = (ids: string[], x: number, y: number, width = 120, height = 40): void => {
    frame = { centre: { x, y }, halfWidth: width / 2, halfHeight: height / 2, rotation: 0 };
    act(() => store.getState().setSelection(ids));
  };
  const bar = (): HTMLElement | null => document.querySelector<HTMLElement>(BAR);
  const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
  const nameOf = (item: HTMLElement): string => item.querySelector('.sr-only')?.textContent ?? '';
  const buttons = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`${BAR} .atlas-tool-button button`)];
  const button = (name: string): HTMLElement => buttons().find((item) => nameOf(item) === name)!;
  const disabled = (): string[] => buttons().filter((item) => item.getAttribute('aria-disabled') === 'true').map(nameOf);
  /** The bar has grown into its place. */
  const settled = (): Promise<void> => vi.waitFor(() => {
    expect(bar()).not.toBeNull();
    expect(getComputedStyle(bar()!).opacity).toBe('1');
    expect(getComputedStyle(bar()!).transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  }, { timeout: 3000 });

  beforeEach(async () => {
    await page.viewport(1200, 800);
    document.head.append(style);
    store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `selection-bar-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ activeTool: 'move', isMapLoading: false, isGMView: true });
    frame = null;
    clock = setInterval(() => ticks.forEach((tick) => tick()), 16);
  });

  afterEach(() => {
    clearInterval(clock);
    ticks.clear();
    cleanup();
    style.remove();
  });

  it('grows in under a selected text, centred, the gap below its handles, with the text\'s tools in groups', async () => {
    const id = store.getState().addText(TEXT);
    mount();
    expect(bar()).toBeNull();
    select([id], 600, 300);
    await settled();
    const shown = rect(BAR);
    // Under the frame's corner handles, by the gap.
    expect(shown.top).toBeCloseTo(300 + 20 + HANDLE_LOOK.gap + HANDLE_LOOK.grip + BAR_GAP, 0);
    expect(shown.left + shown.width / 2).toBeCloseTo(600, 0);
    expect(buttons().map(nameOf)).toEqual(['Colour', 'Size', 'Font', 'Look', 'To front', 'To back', 'Players see it', 'Under tokens', 'Lock', 'Delete']);
    const controls = [...document.querySelectorAll(`${BAR} .atlas-tool-button`)].map((item) => item.getBoundingClientRect());
    expect(controls.map((item) => [Math.round(item.width), Math.round(item.height)])).toEqual(controls.map(() => [32, 32]));
    expect(controls.slice(1).map((item, index) => Math.round(item.left - controls[index]!.right))).toEqual([4, 4, 4, 8, 4, 8, 4, 4, 8]);
    // The look of a tool's bars: its padding all round, its buttons concentric with it.
    expect(controls[0]!.left - shown.left).toBeCloseTo(shown.right - controls.at(-1)!.right, 1);
    expect(controls[0]!.top - shown.top).toBeCloseTo(shown.bottom - controls[0]!.bottom, 1);
    const radii = buttons().map((item) => getComputedStyle(item).borderTopLeftRadius);
    expect(new Set(radii).size).toBe(1);
    // It grows out of the middle of its top edge, under the selection.
    expect(getComputedStyle(bar()!).transformOrigin).toBe(`${shown.width / 2}px 0px`);
  });

  it('offers what a stamp and a text have together, and follows the selection to its new place', async () => {
    const text = store.getState().addText(TEXT);
    const stamp = store.getState().addDrawing({ type: 'icon', icon: 'skull', points: [{ x: 300, y: 200 }], color: '#e93147', width: 70, opacity: 1 });
    mount();
    select([text, stamp], 450, 250, 400, 160);
    await settled();
    expect(buttons().map(nameOf)).toEqual(['Colour', 'Size', 'To front', 'To back', 'Players see it', 'Under tokens', 'Lock', 'Delete']);
    select([stamp], 300, 200, 70, 70);
    await vi.waitFor(() => expect(rect(BAR).left + rect(BAR).width / 2).toBeCloseTo(300, 0), { timeout: 2000 });
    expect(buttons().map(nameOf)).toEqual(['Colour', 'Size', 'Symbol', 'To front', 'To back', 'Players see it', 'Under tokens', 'Lock', 'Delete']);
  });

  it('opens its menus below itself, away from the selection; a pick changes the selection alone', async () => {
    const id = store.getState().addText(TEXT);
    mount();
    select([id], 600, 300);
    await settled();
    act(() => button('Colour').closest<HTMLElement>('.atlas-dropdown-menu')!.querySelector<HTMLElement>('span')!.click());
    const menu = await vi.waitFor(() => document.querySelector<HTMLElement>(`${BAR} .atlas-dropdown-content`)!);
    expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(rect(BAR).bottom);
    act(() => menu.querySelectorAll<HTMLElement>('button')[2]!.click());
    expect(store.getState().objects.texts[id]!.color).toBe('#e93147');
    // What the Draw tool makes next stays as it was.
    expect(store.getState().drawTool.color).toBe('#ffffff');
  });

  it('stands above the selection where the room below runs out, and opens its menus upward there', async () => {
    const id = store.getState().addText(TEXT);
    mount();
    select([id], 600, 740);
    await settled();
    expect(rect(BAR).bottom).toBeLessThanOrEqual(740 - 20 - HANDLE_LOOK.gap - HANDLE_LOOK.stem - HANDLE_LOOK.turnRadius - BAR_GAP + 0.5);
    expect(getComputedStyle(bar()!).transformOrigin).toBe(`${rect(BAR).width / 2}px ${rect(BAR).height}px`);
    act(() => button('Size').closest<HTMLElement>('.atlas-dropdown-menu')!.querySelector<HTMLElement>('span')!.click());
    const menu = await vi.waitFor(() => document.querySelector<HTMLElement>(`${BAR} .atlas-dropdown-content`)!);
    expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(rect(BAR).top);
  });

  it('keeps its shape for a locked selection: everything but the lock waits for it to be unlocked', async () => {
    const id = store.getState().addText({ ...TEXT, locked: true });
    mount();
    select([id], 600, 300);
    await settled();
    const shown = rect(BAR);
    expect(disabled()).toEqual(['Colour', 'Size', 'Font', 'Look', 'To front', 'To back', 'Players see it', 'Under tokens', 'Delete']);
    expect(button('Lock').getAttribute('aria-pressed')).toBe('true');
    act(() => button('Lock').click());
    expect(store.getState().objects.texts[id]).not.toHaveProperty('locked');
    expect(disabled()).toEqual([]);
    expect(rect(BAR)).toEqual(shown);
  });

  it('deletes what is selected, and goes when nothing is framed and in the session view', async () => {
    const [first, second] = [store.getState().addText(TEXT), store.getState().addText({ ...TEXT, y: 500 })];
    mount();
    select([first], 600, 300);
    await settled();
    act(() => button('Delete').click());
    expect(store.getState().objects.texts[first]).toBeUndefined();
    frame = null;
    await vi.waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
    select([second], 600, 500);
    await settled();
    act(() => store.getState().setGMView(false));
    await vi.waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
  });
});
