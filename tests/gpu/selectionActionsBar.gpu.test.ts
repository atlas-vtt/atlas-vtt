import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cdp } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import coarseCss from '../../styles/_coarse-pointer.scss?inline';
import { LONG_PRESS_MS } from '../../src/app/input/longPress';
import { SelectionActionsBarHost } from '../../src/app/packages/components/toolbar/SelectionActionsBar';
import { BAR_GAP } from '../../src/app/packages/components/toolbar/selectionBarPlacement';
import { SelectionBarSource } from '../../src/app/pixi/selection/selectionBarSource';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { closeContextMenuGlobal, ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { getHistoryStore } from '../../src/app/stores/history';
import type { Character } from '../../src/app/types';
import { frame, GRID, TOKEN, touch, touchMaps, wait, type Point, type TouchMap } from './touchHarness';

// The pointer is the test's to choose: a finger, or a mouse.
const pointer = vi.hoisted(() => ({ coarse: true }));
vi.mock('../../src/app/platform/deviceProfile', async (original) => {
  const real = await original<typeof import('../../src/app/platform/deviceProfile')>();
  const profile = real.createDeviceProfile({ isMobile: false, isPhone: false }, { coarse: () => pointer.coarse, mouse: () => !pointer.coarse, onChange: () => () => undefined });
  return { ...real, deviceProfile: () => profile };
});

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-error: #fb464c; --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --icon-m: 18px; --icon-opacity: 0.85; --icon-opacity-hover: 1; --icon-opacity-active: 1; }
  .ui-area { position: fixed; left: 0; top: 0; width: 1180px; height: 820px; pointer-events: none; }
  .atlas-vtt-plugin .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
`;
/** A tablet in landscape. */
const VIEW = { width: 1180, height: 820 };
const h = React.createElement;
const BAR = '.atlas-selection-actions';
/** The second token of the scenes that select two. */
const OTHER: Point = { x: 600, y: 400 };
const EMPTY: Point = { x: 900, y: 650 };

const { map } = touchMaps();
const style = document.createElement('style');
style.textContent = THEME + css + coarseCss;

afterAll(() => cdp().send('Emulation.clearDeviceMetricsOverride'));

afterEach(() => {
  cleanup();
  style.remove();
  document.body.removeAttribute('data-atlas-pointer');
  pointer.coarse = true;
});

/** The map with the bar over it, as the view's UI root mounts it; `prepare` has the map before the bar is mounted. */
async function scene(prepare?: (m: TouchMap) => void): Promise<TouchMap> {
  // The runner's page is made larger than the tablet's view: it shows a frame that does not fit scaled down, and a
  // finger in a scaled frame is taken from the map by the runner's own page. A failed test's screenshot undoes it.
  await cdp().send('Emulation.clearDeviceMetricsOverride');
  await cdp().send('Emulation.setDeviceMetricsOverride', { width: VIEW.width + 200, height: VIEW.height + 200, deviceScaleFactor: 1, mobile: false });
  const m = await map(VIEW);
  expect(window.frameElement?.getBoundingClientRect().width ?? window.innerWidth).toBeCloseTo(window.innerWidth, 0);
  document.head.append(style);
  if (pointer.coarse) document.body.setAttribute('data-atlas-pointer', 'coarse');
  prepare?.(m);
  const source = new SelectionBarSource({ store: m.store, viewport: m.viewport, tokens: () => m.tokens, selection: () => m.selection, annotations: () => null });
  const renderer = { getSelectionBar: () => source, getViewportInstance: () => m.viewport, getCanvasElement: () => m.canvas };
  const ui = { app: m.obsidian, view: null, pixiApp: m.app, renderer } as unknown as AtlasUIContextValue;
  render(h('div', { className: 'atlas-vtt-plugin ui-area' },
    h(AtlasUIContext.Provider, { value: ui }, h(ViewStoreProvider, { store: m.store, children: h(ContextMenuProvider, null, h(SelectionActionsBarHost)) }))));
  // The page is laid out with the plugin's whole stylesheet before a finger comes down: that work between a
  // finger's down and up would make a tap a long press.
  void document.body.offsetHeight;
  await frame();
  await frame();
  return m;
}

const bar = (): HTMLElement | null => document.querySelector<HTMLElement>(BAR);
const buttons = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`${BAR} .atlas-tool-button button`)];
const nameOf = (button: HTMLElement): string => button.querySelector('.sr-only')?.textContent ?? '';
const button = (name: string): HTMLElement => {
  const found = buttons().find((one) => nameOf(one) === name);
  if (!found) throw new Error(`no "${name}" in the bar: ${buttons().map(nameOf).join(', ')}`);
  return found;
};
const middle = (element: Element): Point => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
/** A finger's tap. */
async function tap(at: Point): Promise<void> {
  await touch.down(at);
  await wait(30);
  await touch.up();
  await frame();
}
/** The bar has grown into its place. */
const settled = (): Promise<void> => vi.waitFor(() => {
  expect(bar()).not.toBeNull();
  expect(getComputedStyle(bar()!).opacity).toBe('1');
  expect(getComputedStyle(bar()!).transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
}, { timeout: 8000 });
const gone = (): Promise<void> => vi.waitFor(() => expect(bar()).toBeNull(), { timeout: 8000 });

describe('the bar above a selection, under a finger', () => {
  it('shows above a tapped token, centred on it, with buttons a finger wide that say what they do, evenly set and concentric', async () => {
    const m = await scene();
    expect(bar()).toBeNull();
    await tap(TOKEN);
    expect(m.store.getState().selectedIds).toEqual(['token']);
    await settled();
    const shown = bar()!.getBoundingClientRect();
    // Above the token and its handles, by the gap at least
    expect(shown.bottom).toBeLessThanOrEqual(TOKEN.y - GRID / 2 - BAR_GAP + 0.5);
    expect(shown.bottom).toBeGreaterThan(TOKEN.y - GRID / 2 - 80);
    expect(shown.left + shown.width / 2).toBeCloseTo(TOKEN.x, 0);
    // It grows out of the middle of its bottom edge, above the token
    const [originX, originY] = getComputedStyle(bar()!).transformOrigin.split(' ').map(parseFloat);
    expect(originX).toBeCloseTo(shown.width / 2, 0);
    expect(originY).toBeCloseTo(shown.height, 0);
    expect(buttons().map(nameOf)).toEqual(['Select more', 'Edit token', 'Duplicate', 'Delete', 'More']);
    expect(buttons().map((one) => one.querySelector('.atlas-tool-button__caption')?.textContent)).toEqual(['Add', 'Edit', 'Duplicate', 'Delete', 'More']);
    const boxes = buttons().map((one) => one.getBoundingClientRect());
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // One inset all round, and the same between the buttons (twice that where a group ends)
    const inset = boxes[0]!.left - shown.left;
    expect(inset).toBeGreaterThan(0);
    expect(shown.right - boxes.at(-1)!.right).toBeCloseTo(inset, 1);
    expect(boxes[0]!.top - shown.top).toBeCloseTo(inset, 1);
    expect(shown.bottom - boxes[0]!.bottom).toBeCloseTo(inset, 1);
    const border = parseFloat(getComputedStyle(bar()!).borderLeftWidth);
    const gap = inset - border;
    expect(boxes.slice(1).map((box, index) => Math.round(box.left - boxes[index]!.right))).toEqual([2 * gap, gap, gap, gap]);
    // Concentric: the bar's corner is a button's corner and the inset between them
    const radii = buttons().map((one) => parseFloat(getComputedStyle(one).borderTopLeftRadius));
    expect(new Set(radii).size).toBe(1);
    // The border is 1.5 px, which a screen of one pixel a point draws as 1
    const between = parseFloat(getComputedStyle(bar()!).borderTopLeftRadius) - radii[0]! - gap;
    expect(between).toBeGreaterThanOrEqual(border);
    expect(between).toBeLessThanOrEqual(1.5);
    // Delete says what it does in the warning colour
    expect(getComputedStyle(button('Delete')).color).toBe('rgb(251, 70, 76)');
  });

  it('goes while the token is dragged and comes back above it where it was dropped', async () => {
    const m = await scene();
    await tap(TOKEN);
    await settled();
    const to = { x: TOKEN.x + 320, y: TOKEN.y + 240 };
    await touch.down(TOKEN);
    await touch.glide([TOKEN], [to], 10);
    await gone();
    await touch.up();
    await settled();
    expect(m.tokenAt().x).toBeCloseTo(to.x, 0);
    const shown = bar()!.getBoundingClientRect();
    expect(shown.left + shown.width / 2).toBeCloseTo(to.x, 0);
    expect(shown.bottom).toBeLessThanOrEqual(to.y - GRID / 2 - BAR_GAP + 0.5);
  });

  it('follows the map as it is panned, without a render of the bar', async () => {
    const m = await scene();
    await tap(TOKEN);
    await settled();
    const before = bar()!.getBoundingClientRect();
    const renders = vi.fn();
    const observer = new MutationObserver((records) => records.filter((record) => record.type === 'childList').forEach(renders));
    observer.observe(bar()!, { childList: true, subtree: true });
    act(() => m.viewport.moveCenter(m.viewport.center.x - 150, m.viewport.center.y - 100));
    await vi.waitFor(() => expect(bar()!.getBoundingClientRect().left).toBeCloseTo(before.left + 150, 0));
    expect(bar()!.getBoundingClientRect().top).toBeCloseTo(before.top + 100, 0);
    observer.disconnect();
    expect(renders).not.toHaveBeenCalled();
  });

  it('flips below a token at the top of the view, and stays inside the view beside one at its edge', async () => {
    const m = await scene();
    act(() => m.store.getState().setTokenPositions([{ id: 'token', x: 30, y: 40 }]));
    await frame();
    act(() => m.store.getState().setSelection(['token']));
    await settled();
    const shown = bar()!.getBoundingClientRect();
    expect(shown.top).toBeGreaterThanOrEqual(40 + GRID / 2 + BAR_GAP - 0.5);
    expect(shown.left).toBeGreaterThanOrEqual(0);
    expect(getComputedStyle(bar()!).transformOrigin.endsWith(' 0px')).toBe(true);
  });

  it('opens the token\'s whole menu from More, with what a keyboard does elsewhere, and stays while it is open', async () => {
    await scene();
    await tap(TOKEN);
    await settled();
    await tap(middle(button('More')));
    await vi.waitFor(() => expect(document.querySelector('.atlas-ctx-menu')).not.toBeNull());
    const rows = [...document.querySelectorAll('.atlas-ctx-menu .atlas-ctx-item, .atlas-ctx-menu .atlas-ctx-destructive-btn')].map((row) => row.textContent?.trim());
    expect(rows).toEqual(expect.arrayContaining(['Size', 'Hide', 'Duplicate', 'Copy', 'Paste', 'Edit token', 'Add to Initiative', 'Delete']));
    expect(bar()).not.toBeNull();
    expect(button('More').getAttribute('aria-expanded')).toBe('true');
  });

  it('makes way for the menu a long press opens on the token, and comes back when that closes', async () => {
    await scene();
    await tap(TOKEN);
    await settled();
    await touch.down(TOKEN);
    await wait(LONG_PRESS_MS + 150);
    await touch.up();
    await vi.waitFor(() => expect(document.querySelector('.atlas-ctx-menu')).not.toBeNull());
    await gone();
    act(() => closeContextMenuGlobal());
    await settled();
  });

  it('a finger held on the empty map and lifted there opens Paste here and Select all', async () => {
    const m = await scene();
    await touch.down(EMPTY);
    await wait(LONG_PRESS_MS + 150);
    await touch.up();
    await vi.waitFor(() => expect(document.querySelector('.atlas-ctx-menu')).not.toBeNull());
    const rows = [...document.querySelectorAll<HTMLElement>('.atlas-ctx-menu .atlas-ctx-item')];
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['Paste here', 'Select all']);
    // Nothing was copied yet
    expect(rows[0]!.getAttribute('aria-disabled')).toBe('true');
    await tap(middle(rows[1]!));
    await vi.waitFor(() => expect(m.store.getState().selectedIds).toEqual(['token']));
    await settled();
  });

  it('with Select more on, taps gather tokens, Delete removes them all in one undo step, and Done ends it', async () => {
    const m = await scene();
    const other: Character = { id: 'other', x: OTHER.x, y: OTHER.y, size: 1, imagePath: '', kind: 'character', name: 'Other' };
    act(() => m.store.getState().addToken(other));
    await expect.poll(() => Object.keys(m.tokens.getTokenSprites()).length).toBe(2);
    getHistoryStore(m.store)?.getState().clear();
    await tap(TOKEN);
    await settled();
    await tap(middle(button('Select more')));
    expect(m.store.getState().selectMore).toBe(true);
    expect(button('Select more').getAttribute('aria-pressed')).toBe('true');
    // Done joins at the end, and no button before it moves
    const before = button('Delete').getBoundingClientRect().left;
    expect(buttons().map(nameOf).at(-1)).toBe('Done');
    await frame();
    expect(button('Delete').getBoundingClientRect().left).toBeCloseTo(before, 0);
    await tap(OTHER);
    await vi.waitFor(() => expect(m.store.getState().selectedIds).toEqual(['token', 'other']));
    await settled();
    await tap(middle(button('Delete')));
    await vi.waitFor(() => expect(Object.keys(m.store.getState().objects.tokens)).toEqual([]));
    expect(m.steps()).toBe(1);
    await gone();
    // The selection is gone, and Select more with it
    expect(m.store.getState().selectMore).toBe(false);
    act(() => getHistoryStore(m.store)?.getState().undo());
    expect(Object.keys(m.store.getState().objects.tokens).sort()).toEqual(['other', 'token']);
  });

  it('Done leaves Select more and keeps what was gathered; a tap on the empty map lets go of it', async () => {
    const m = await scene();
    await tap(TOKEN);
    await settled();
    await tap(middle(button('Select more')));
    await tap(middle(button('Done')));
    expect(m.store.getState().selectMore).toBe(false);
    expect(m.store.getState().selectedIds).toEqual(['token']);
    expect(buttons().map(nameOf)).not.toContain('Done');
    await tap(EMPTY);
    await vi.waitFor(() => expect(m.store.getState().selectedIds).toEqual([]));
    await gone();
  });

  it('is not there in the session view, nor with a tool that selects nothing', async () => {
    const m = await scene();
    await tap(TOKEN);
    await settled();
    act(() => m.store.getState().setGMView(false));
    await gone();
    act(() => m.store.getState().setGMView(true));
    await settled();
    act(() => m.store.getState().setActiveTool('fog'));
    await gone();
  });
});

describe('the bar above a selection, under a mouse', () => {
  it('is not there while the device\'s setting is off', async () => {
    pointer.coarse = false;
    const m = await scene((made) => { new SettingsService(made.obsidian); });
    act(() => m.store.getState().setSelection(['token']));
    for (let i = 0; i < 20; i++) await frame();
    expect(bar()).toBeNull();
  });

  it('is there with the setting on: a tool bar\'s buttons without words, each with its tooltip', async () => {
    pointer.coarse = false;
    const m = await scene((made) => new SettingsService(made.obsidian).setSelectionBarShown(true));
    act(() => m.store.getState().setSelection(['token']));
    await settled();
    expect(buttons().map(nameOf)).toEqual(['Select more', 'Edit token', 'Duplicate', 'Delete', 'More']);
    expect(document.querySelector(`${BAR} .atlas-tool-button__caption`)).toBeNull();
    for (const box of buttons().map((one) => one.getBoundingClientRect())) expect([box.width, box.height]).toEqual([32, 32]);
    const shown = bar()!.getBoundingClientRect();
    expect(shown.left + shown.width / 2).toBeCloseTo(TOKEN.x, 0);
    expect(shown.bottom).toBeLessThanOrEqual(TOKEN.y - GRID / 2 - BAR_GAP + 0.5);
  });
});
