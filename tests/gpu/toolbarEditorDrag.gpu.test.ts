import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import {
  barIds, centreOf, DEFAULT_BAR, eachFrame, expectSameBox, ghostBox, handle, installToolbarStyles, mountToolbar, mouse, query, rectOf,
  settle, SETTLE_FRAMES, transformed, type Rect, type ToolbarHarness,
} from './toolbarEditorHarness';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

const slot = (id: string): HTMLElement => query(`.atlas-main-toolbar > [data-toolbar-item="${id}"]`);
const traySlots = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.atlas-toolbar-tray [data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');
const spacers = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.atlas-main-toolbar > .atlas-toolbar-spacer'));
/** The open well: a spacer that is not closing. */
const openWell = (): HTMLElement | undefined => spacers().find(spacer => spacer.dataset.collapsing === undefined);

/** Moves the held mouse from `from` to `to` in steps of about 8 px, waiting a frame after each. */
async function glide(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
  for (let step = 1; step <= steps; step += 1) {
    await mouse.move(from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps);
    await settle(1);
  }
}

/** The bar's controls that started closing while `during` ran, in the order they did. */
async function closingDuring(during: () => Promise<void>): Promise<string[]> {
  const bar = query('.atlas-main-toolbar');
  const closing = new Set<string>();
  const note = (element: Element): void => {
    const item = element as HTMLElement;
    if (item.parentElement === bar && item.dataset.toolbarItem && item.dataset.collapsing !== undefined) closing.add(item.dataset.toolbarItem);
  };
  const observer = new MutationObserver(records => records.forEach(record => note(record.target as Element)));
  observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['data-collapsing'] });
  try {
    await during();
  } finally {
    observer.disconnect();
  }
  return [...closing];
}

/** Moves along the bar's middle from `fromX` to the right until `done` holds; returns where it stopped. */
async function sweepUntil(fromX: number, y: number, done: () => boolean): Promise<{ x: number; y: number }> {
  const right = rectOf(query('.atlas-main-toolbar')).left + rectOf(query('.atlas-main-toolbar')).width + 40;
  for (let x = fromX; x < right; x += 4) {
    await mouse.move(x, y);
    await settle(2);
    if (done()) return { x, y };
  }
  throw new Error('the well never got there');
}

describe('dragging in the toolbar editor', () => {
  let harness: ToolbarHarness;
  let removeStyles: () => void = () => undefined;

  async function mount(stored: StoredToolbarLayout = {}): Promise<void> {
    harness = await mountToolbar(stored);
    await harness.startEditing();
  }

  beforeEach(async () => {
    await page.viewport(1280, 800);
    removeStyles = installToolbarStyles();
    // Animations update React outside `act`, as in the app.
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(async () => {
    cleanup();
    removeStyles();
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  });

  it('drags a tool into the tray and back between two controls, stretching nothing on the way', async () => {
    await mount({ hidden: ['loot'] });
    const barHeight = rectOf(query('.atlas-main-toolbar')).height;
    const trayHeight = rectOf(query('.atlas-toolbar-tray')).height;
    const problems: string[] = [];
    let lastGhost: Rect | null = null;
    const watch = (): void => {
      problems.push(
        ...transformed('.atlas-toolbar-item, .atlas-toolbar-spacer', true),
        ...transformed('.atlas-vtt-toolbar, .atlas-toolbar-tray', false),
      );
      if (rectOf(query('.atlas-main-toolbar')).height !== barHeight) problems.push('bar height');
      if (rectOf(query('.atlas-toolbar-tray')).height !== trayHeight) problems.push('tray height');
      lastGhost = ghostBox() ?? lastGhost;
    };

    // Below the threshold nothing lifts; past it a ghost does.
    const start = centreOf(handle('fog', 'bar'));
    await mouse.down(start.x, start.y);
    await mouse.move(start.x + 3, start.y);
    await settle(2);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    await mouse.move(start.x + 6, start.y);
    await settle(2);
    expect(document.querySelector('.atlas-toolbar-ghost')).not.toBeNull();
    expect(slot('fog').dataset.lifted).toBe('');

    // Over the tray the bar's well closes and the tray opens one at the tool's remembered place.
    const tray = centreOf(query('.atlas-toolbar-tray'));
    await glide({ x: start.x + 6, y: start.y }, tray);
    await eachFrame(SETTLE_FRAMES / 2, watch);
    expect(slot('fog').hidden).toBe(true);
    expect(openWell()).toBeUndefined();
    expect(traySlots()).toEqual(['fog', 'loot']);

    await mouse.up(tray.x, tray.y);
    await eachFrame(SETTLE_FRAMES, watch);
    expect(harness.settings.getToolbarLayout().hidden).toEqual(['fog', 'loot']);
    expect(slot('fog').hidden).toBe(true);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();

    // Back onto the bar, between Measure and Note pin.
    const pickup = centreOf(handle('fog', 'tray'));
    await mouse.down(pickup.x, pickup.y);
    const bar = rectOf(query('.atlas-main-toolbar'));
    const overBar = { x: bar.left + 40, y: bar.top + bar.height / 2 };
    await glide(pickup, overBar);
    const stop = await sweepUntil(overBar.x, overBar.y, () => openWell()?.previousElementSibling === slot('measure'));
    await eachFrame(SETTLE_FRAMES / 2, watch);
    expect(openWell()?.previousElementSibling).toBe(slot('measure'));

    lastGhost = null;
    await mouse.up(stop.x, stop.y);
    await eachFrame(SETTLE_FRAMES, watch);
    expect(harness.settings.getToolbarLayout().hidden).toEqual(['loot']);
    expect(barIds()).toEqual(['move', 'draw', 'text', 'measure', 'fog', 'pin', 'dice', 'assets', 'palette']);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    if (!lastGhost) throw new Error('no ghost settled');
    expectSameBox(rectOf(query('.atlas-main-toolbar > [data-toolbar-item="fog"] > .atlas-toolbar-item__content')), lastGhost);
    expect(spacers()).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('cancels on Escape: the ghost goes back, nothing is stored and edit mode stays', async () => {
    await mount();
    const start = centreOf(handle('fog', 'bar'));
    const takeOff = rectOf(query('.atlas-main-toolbar > [data-toolbar-item="fog"] > .atlas-toolbar-item__content'));
    await mouse.down(start.x, start.y);
    await glide(start, centreOf(query('.atlas-toolbar-tray')));
    await settle(10);
    await userEvent.keyboard('{Escape}');
    let lastGhost: Rect | null = null;
    await eachFrame(SETTLE_FRAMES, () => { lastGhost = ghostBox() ?? lastGhost; });
    await mouse.up(start.x, start.y);
    expect(harness.store.getState().isToolbarEditing).toBe(true);
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(barIds()).toEqual(DEFAULT_BAR);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    if (!lastGhost) throw new Error('no ghost went back');
    expectSameBox(lastGhost, takeOff);
    expect(document.body.classList.contains('atlas-toolbar-grabbing')).toBe(false);
  });

  it('overflows from the right at 520 px, and a tool dragged onto the full bar lands in "More tools"', async () => {
    await page.viewport(520, 800);
    await mount({ hidden: ['draw'] });
    // The active tool (Move) and the Command palette are pinned; everything else left from the right.
    expect(barIds()).toEqual(['move', 'palette']);
    const pickup = centreOf(handle('draw', 'tray'));
    await mouse.down(pickup.x, pickup.y);
    const bar = rectOf(query('.atlas-main-toolbar'));
    const overBar = { x: bar.left + 30, y: bar.top + bar.height / 2 };
    await glide(pickup, overBar);
    await settle(10);
    const overflow = query('.atlas-main-toolbar > .atlas-toolbar-overflow');
    expect(overflow.dataset.dropTarget).toBe('true');
    expect(openWell()).toBeUndefined();
    let lastGhost: Rect | null = null;
    await mouse.up(overBar.x, overBar.y);
    await eachFrame(SETTLE_FRAMES, () => { lastGhost = ghostBox() ?? lastGhost; });
    expect(harness.settings.getToolbarLayout().hidden).toBeUndefined();
    expect(barIds()).toEqual(['move', 'palette']);
    if (!lastGhost) throw new Error('no ghost settled');
    expectSameBox(lastGhost, rectOf(overflow));
  });

  it('closes the rightmost control live to make room on a full bar, and never the Command palette', async () => {
    await page.viewport(760, 800);
    await mount({ hidden: ['draw'] });
    expect(barIds()).toEqual(['move', 'fog', 'text', 'palette']);
    const pickup = centreOf(handle('draw', 'tray'));
    await mouse.down(pickup.x, pickup.y);
    const bar = rectOf(query('.atlas-main-toolbar'));
    // Watched from the first step on: on a busy machine a control may close before the glide ends.
    const closing = await closingDuring(async () => {
      await glide(pickup, { x: bar.left + 30, y: bar.top + bar.height / 2 });
      await eachFrame(SETTLE_FRAMES / 2, () => undefined);
    });
    expect(closing).toEqual(['text']);
    expect(barIds()).toEqual(['move', 'fog', 'palette']);
    expect(openWell()).toBeDefined();

    // The Command palette is pinned: dragged to the start it stays on the bar, and its well too.
    await userEvent.keyboard('{Escape}');
    await mouse.up(bar.left, bar.top);
    await settle();
    const palette = centreOf(handle('palette', 'bar'));
    await mouse.down(palette.x, palette.y);
    await glide(palette, { x: bar.left + 4, y: palette.y });
    await settle(30);
    expect(openWell()?.getBoundingClientRect().width).toBeGreaterThan(30);
    await mouse.up(bar.left + 4, palette.y);
    await settle();
    expect(barIds()[0]).toBe('palette');
    expect(barIds()).toContain('palette');
  });

  it('gives a well at either end of the bar the bar\'s concentric corners', async () => {
    await mount({ hidden: ['dice'] });
    const pickup = centreOf(handle('dice', 'tray'));
    await mouse.down(pickup.x, pickup.y);
    const bar = rectOf(query('.atlas-main-toolbar'));
    const y = bar.top + bar.height / 2;
    await glide(pickup, { x: bar.left + 2, y });
    await settle(30);
    const well = openWell();
    if (!well) throw new Error('no well at the start');
    expect(query('.atlas-main-toolbar').firstElementChild).toBe(well);
    expect(getComputedStyle(well).borderTopLeftRadius).toBe('14.5px');
    expect(getComputedStyle(well).borderBottomLeftRadius).toBe('14.5px');

    await glide({ x: bar.left + 2, y }, { x: bar.left + bar.width - 2, y });
    await settle(30);
    const last = openWell();
    if (!last) throw new Error('no well at the end');
    expect(last.previousElementSibling).toBe(slot('palette'));
    // After the last control comes the GM view switch, which keeps the bar's end corner.
    expect(getComputedStyle(query('.atlas-main-toolbar > .atlas-toolbar-end > .atlas-toggle')).borderTopRightRadius).toBe('14.5px');
    expect(getComputedStyle(query('[data-toolbar-item="move"] .atlas-tool-group')).borderTopLeftRadius).toBe('14.5px');
    await userEvent.keyboard('{Escape}');
    await mouse.up(bar.left, y);
  });

  it('with reduced motion, opens each well at full width at once and drops without a settling ghost', async () => {
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await settle(5);
    await mount({ hidden: ['draw'] });
    const pickup = centreOf(handle('draw', 'tray'));
    await mouse.down(pickup.x, pickup.y);
    const bar = rectOf(query('.atlas-main-toolbar'));
    const y = bar.top + bar.height / 2;
    await glide(pickup, { x: bar.left + 20, y });
    await settle(5);
    const wellWidth = query('.atlas-toolbar-ghost .atlas-toolbar-face--bar').offsetWidth;
    const widths = new Set<number>();
    const wells = new Set<HTMLElement>();
    for (let x = bar.left + 20; x < bar.left + bar.width - 20; x += 6) {
      await mouse.move(x, y);
      // The frame after the move: a well that opened is already open all the way.
      await eachFrame(1, () => {
        const well = openWell();
        if (!well) return;
        wells.add(well);
        widths.add(Math.round(well.getBoundingClientRect().width));
      });
    }
    expect(wells.size).toBeGreaterThan(3);
    expect([...widths]).toEqual([wellWidth]);
    await mouse.up(bar.left + bar.width - 30, y);
    await settle(20);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    expect(harness.settings.getToolbarLayout().hidden).toBeUndefined();
    expect(spacers()).toEqual([]);
  });
});
