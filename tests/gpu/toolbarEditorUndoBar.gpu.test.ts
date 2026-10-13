import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  barIds, centreOf, DEFAULT_BAR, eachFrame, expectSameBox, ghostBox, handle, installToolbarStyles, mountToolbar, mouse, query, rectOf,
  settle, SETTLE_FRAMES, transformed, type Rect, type ToolbarHarness,
} from './toolbarEditorHarness';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

const undoSlot = (): HTMLElement => query('.atlas-bottom-toolbar-row__start > .atlas-undo-bar');
const undoBar = (): HTMLElement => query('.atlas-undo-bar > .atlas-undo-redo-controls');
const traySlots = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.atlas-toolbar-tray [data-tray-item]:not([hidden])')).map(item => item.dataset.trayItem ?? '');
const spacers = (): Element[] => Array.from(document.querySelectorAll('.atlas-main-toolbar > .atlas-toolbar-spacer'));

/** Moves the held mouse from `from` to `to` in steps of about 8 px, waiting a frame after each. */
async function glide(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
  for (let step = 1; step <= steps; step += 1) {
    await mouse.move(from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps);
    await settle(1);
  }
}

describe('dragging the undo/redo bar in the toolbar editor', () => {
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

  afterEach(() => {
    cleanup();
    removeStyles();
  });

  it('drags it into the tray and back onto the toolbar, which keeps its look and never opens a well for it', async () => {
    await mount();
    const home = rectOf(undoBar());
    const mainBar = rectOf(query('.atlas-main-toolbar'));
    const problems: string[] = [];
    let lastGhost: Rect | null = null;
    const watch = (): void => {
      problems.push(...transformed('.atlas-toolbar-item, .atlas-main-toolbar, .atlas-toolbar-tray', false));
      if (spacers().length > 0) problems.push('a well in the bar');
      lastGhost = ghostBox() ?? lastGhost;
    };

    // Past the threshold a ghost of the whole bar lifts off it; its place stays open, empty.
    const start = centreOf(handle('undo', 'bar'));
    await mouse.down(start.x, start.y);
    await mouse.move(start.x + 6, start.y);
    await settle(2);
    expect(undoSlot().dataset.lifted).toBe('');
    const pickup = ghostBox();
    if (!pickup) throw new Error('no ghost');
    expect(Math.abs(pickup.width - home.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(pickup.height - home.height)).toBeLessThanOrEqual(0.5);

    // Over the tray the tray opens its first slot for it; its place and the toolbar stay as they are.
    const tray = centreOf(query('.atlas-toolbar-tray'));
    await glide({ x: start.x + 6, y: start.y }, tray);
    await eachFrame(SETTLE_FRAMES / 2, watch);
    expect(traySlots()).toEqual(['undo']);
    expectSameBox(rectOf(undoSlot()), home);
    expectSameBox(rectOf(query('.atlas-main-toolbar')), mainBar);

    await mouse.up(tray.x, tray.y);
    await eachFrame(SETTLE_FRAMES, watch);
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['undo'] });
    expect(undoSlot().hidden).toBe(true);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    if (!lastGhost) throw new Error('no ghost settled');
    expectSameBox(lastGhost, rectOf(query('.atlas-toolbar-tray [data-tray-item="undo"] > .atlas-toolbar-face')));
    // The toolbar's own look is unchanged; only the room beside it grew.
    expect(rectOf(query('.atlas-main-toolbar')).height).toBe(mainBar.height);
    expect(barIds()).toEqual(DEFAULT_BAR);

    // Out of the tray and onto the middle of the toolbar: it settles at its own place.
    const fromTray = centreOf(handle('undo', 'tray'));
    await mouse.down(fromTray.x, fromTray.y);
    const overBar = centreOf(query('.atlas-main-toolbar'));
    await glide(fromTray, overBar);
    await eachFrame(SETTLE_FRAMES / 2, watch);
    expect(traySlots()).toEqual([]);
    lastGhost = null;
    await mouse.up(overBar.x, overBar.y);
    await eachFrame(SETTLE_FRAMES, watch);
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(undoSlot().hidden).toBe(false);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    if (!lastGhost) throw new Error('no ghost settled');
    expectSameBox(lastGhost, rectOf(undoBar()));
    expectSameBox(rectOf(undoBar()), home);
    expect(problems).toEqual([]);
  });

  it('shows it again when it is dropped on its own place left of the toolbar', async () => {
    await mount({ hidden: ['undo'] });
    const bar = rectOf(query('.atlas-main-toolbar'));
    const fromTray = centreOf(handle('undo', 'tray'));
    const ownPlace = { x: bar.left - 40, y: bar.top + bar.height / 2 };
    await mouse.down(fromTray.x, fromTray.y);
    await glide(fromTray, ownPlace);
    await settle(10);
    await mouse.up(ownPlace.x, ownPlace.y);
    await settle();
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(undoSlot().hidden).toBe(false);
  });

  it('goes back to its place when let go outside both zones, storing nothing', async () => {
    await mount();
    const home = rectOf(undoBar());
    const start = centreOf(handle('undo', 'bar'));
    await mouse.down(start.x, start.y);
    await glide(start, { x: start.x, y: start.y - 300 });
    await settle(10);
    let lastGhost: Rect | null = null;
    await mouse.up(start.x, start.y - 300);
    await eachFrame(SETTLE_FRAMES, () => { lastGhost = ghostBox() ?? lastGhost; });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    expect(undoSlot().hidden).toBe(false);
    if (!lastGhost) throw new Error('no ghost went back');
    expectSameBox(lastGhost, home);
  });

  it('flies to the tray with Hide from its menu and back with Show on toolbar', async () => {
    await mount();
    const home = rectOf(undoBar());
    const at = centreOf(handle('undo', 'bar'));
    handle('undo', 'bar').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: at.x, clientY: at.y }));
    await settle(5);
    query('[role="menuitem"]').click();
    let lastGhost: Rect | null = null;
    await eachFrame(SETTLE_FRAMES, () => { lastGhost = ghostBox() ?? lastGhost; });
    expect(harness.settings.getToolbarLayout()).toEqual({ hidden: ['undo'] });
    if (!lastGhost) throw new Error('no flight');
    expectSameBox(lastGhost, rectOf(query('.atlas-toolbar-tray [data-tray-item="undo"] > .atlas-toolbar-face')));

    const face = handle('undo', 'tray');
    face.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: at.x, clientY: at.y }));
    await settle(5);
    query('[role="menuitem"]').click();
    lastGhost = null;
    await eachFrame(SETTLE_FRAMES, () => { lastGhost = ghostBox() ?? lastGhost; });
    expect(harness.settings.getToolbarLayout()).toEqual({});
    if (!lastGhost) throw new Error('no flight');
    expectSameBox(lastGhost, home);
    expectSameBox(rectOf(undoBar()), home);
  });
});
