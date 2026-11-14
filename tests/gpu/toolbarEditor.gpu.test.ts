import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page } from 'vitest/browser';
import {
  barIds, DEFAULT_BAR, eachFrame, expectSameBox, ghostBox, handle, installToolbarStyles, mountToolbar, query, rectOf,
  settle, SETTLE_FRAMES, transformed, type Rect,
} from './toolbarEditorHarness';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ openPlayerWindow: vi.fn(), presentActiveTab: vi.fn(), presentTab: vi.fn(), frameSourceOf: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/PlayerViewSettingsPanel', () => ({ PlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

describe('the toolbar editor in a real layout', () => {
  let settings: SettingsService;
  let startEditing: () => Promise<void>;
  let removeStyles: () => void = () => undefined;

  async function mount(stored: StoredToolbarLayout = {}): Promise<void> {
    ({ settings, startEditing } = await mountToolbar(stored));
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

  it('shows the untouched default layout at 1280 px in today\'s order, without "More tools"', async () => {
    await mount();
    expect(barIds()).toEqual(DEFAULT_BAR);
    expect(document.querySelector('.atlas-toolbar-overflow')).toBeNull();
  });

  it('hangs the tray 8 px above the bar, centred on it, with the toolbar\'s corner and concentric ends', async () => {
    await mount({ hidden: ['loot'] });
    await startEditing();
    const bar = rectOf(query('.atlas-main-toolbar'));
    const tray = rectOf(query('.atlas-toolbar-tray'));
    expect(Math.abs(bar.top - (tray.top + tray.height) - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bar.left + bar.width / 2 - (tray.left + tray.width / 2))).toBeLessThanOrEqual(0.5);
    expect(tray.height).toBeLessThan(48);
    expect(getComputedStyle(query('.atlas-toolbar-tray')).borderTopLeftRadius).toBe(getComputedStyle(query('.atlas-main-toolbar')).borderTopLeftRadius);
    // 16 px less the border (1.5) and the inset (4)
    expect(getComputedStyle(query('.atlas-toolbar-tray [data-tray-item="loot"] .btn')).borderTopLeftRadius).toBe('10.5px');
    expect(getComputedStyle(query('.atlas-toolbar-tray__done')).borderTopRightRadius).toBe('10.5px');
  });

  it('keeps every control\'s corners concentric with the bar\'s, on every side, in and out of edit mode', async () => {
    await mount();
    const allCorners = (element: Element): string[] => {
      const style = getComputedStyle(element);
      return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
    };
    const toggle = query('.atlas-main-toolbar > .atlas-toolbar-end > .atlas-toggle');
    const corners = (): string[] => [
      ...allCorners(query('.atlas-main-toolbar > [data-toolbar-item="move"] .atlas-tool-group')),
      ...[...document.querySelectorAll('.atlas-main-toolbar .atlas-tool-button > span > .btn')].flatMap(allCorners),
      ...allCorners(toggle),
    ];
    expect(new Set(corners())).toEqual(new Set(['10.5px']));
    // The switch's thumb stands 4 px inside it, its corner concentric with the switch's: 10.5 - 4
    const thumb = toggle.querySelector<HTMLElement>('.atlas-toggle__thumb')!;
    expect(getComputedStyle(thumb).borderTopLeftRadius).toBe('6.5px');
    const switchBox = toggle.querySelector('.atlas-toggle__switch')!.getBoundingClientRect();
    const thumbBox = thumb.getBoundingClientRect();
    expect(thumbBox.top - switchBox.top).toBeCloseTo(4, 1);
    expect(switchBox.bottom - thumbBox.bottom).toBeCloseTo(4, 1);
    // At either end, as far from that edge as from the top
    expect(Math.abs(switchBox.right - thumbBox.right - 4) < 0.5 || Math.abs(thumbBox.left - switchBox.left - 4) < 0.5).toBe(true);
    await startEditing();
    expect(new Set(corners())).toEqual(new Set(['10.5px']));
    expect(getComputedStyle(handle('move', 'bar')).borderTopLeftRadius).toBe('10.5px');
  });

  it('leaves the bar and the undo bar where they are as editing starts', async () => {
    await mount();
    const boxes = (): Rect[] => [rectOf(query('.atlas-main-toolbar')), rectOf(query('.atlas-undo-redo-controls'))];
    const before = boxes();
    await startEditing();
    expect(boxes()).toEqual(before);
  });

  it('moves no control with a transform when the window is resized', async () => {
    await mount();
    await startEditing();
    // A move glides: Motion has measured every control since.
    fireEvent.keyDown(handle('fog', 'bar'), { key: 'ArrowRight', altKey: true });
    await settle();
    expect(barIds().slice(0, 3)).toEqual(['move', 'draw', 'fog']);
    for (const width of [900, 520, 1280]) {
      await page.viewport(width, 800);
      await settle(1);
      expect(transformed('.atlas-toolbar-item', false), `at ${width} px`).toEqual([]);
      await settle(10);
    }
  });

  it('hides, shows and resets without stretching the bar, its controls or the tray', async () => {
    await mount();
    await startEditing();
    const barHeight = rectOf(query('.atlas-main-toolbar')).height;
    const trayHeight = rectOf(query('.atlas-toolbar-tray')).height;
    const problems: string[] = [];
    // The ghost's last box, and in that same frame the box of the face it lands on.
    const flight: { ghost: Rect | null; landing: Rect | null; frames: number } = { ghost: null, landing: null, frames: 0 };
    const watch = (destination: () => Element | null) => (): void => {
      problems.push(
        ...transformed('.atlas-toolbar-item', true),
        ...transformed('.atlas-vtt-toolbar', false),
        ...transformed('.atlas-toolbar-tray, .atlas-toolbar-tray__item, .atlas-toolbar-editor__tray-row', false),
      );
      if (rectOf(query('.atlas-main-toolbar')).height !== barHeight) problems.push('bar height');
      if (rectOf(query('.atlas-toolbar-tray')).height !== trayHeight) problems.push('tray height');
      const box = ghostBox();
      const target = destination();
      if (!box) return;
      flight.frames += 1;
      flight.ghost = box;
      flight.landing = target && rectOf(target);
    };
    const expectLanded = (face: string): void => {
      expect(flight.frames).toBeGreaterThan(5);
      expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
      if (!flight.ghost || !flight.landing) throw new Error('the ghost never stood over its landing place');
      expectSameBox(flight.ghost, flight.landing);
      // Revealed where the ghost left it.
      expectSameBox(rectOf(query(face)), flight.landing);
      flight.frames = 0;
    };

    const trayFace = '.atlas-toolbar-tray [data-tray-item="fog"] > .atlas-toolbar-face';
    fireEvent.keyDown(handle('fog', 'bar'), { key: 'Delete' });
    await eachFrame(SETTLE_FRAMES, watch(() => document.querySelector(trayFace)));
    expect(settings.getToolbarLayout().hidden).toEqual(['fog']);
    expect(query('.atlas-main-toolbar > [data-toolbar-item="fog"]').hidden).toBe(true);
    expectLanded(trayFace);

    const barFace = '.atlas-main-toolbar > [data-toolbar-item="fog"] > .atlas-toolbar-item__content';
    fireEvent.keyDown(handle('fog', 'tray'), { key: 'Enter' });
    await eachFrame(SETTLE_FRAMES, watch(() => document.querySelector(barFace)));
    expect(settings.getToolbarLayout()).toEqual({});
    expect(barIds()).toEqual(DEFAULT_BAR);
    expectLanded(barFace);

    fireEvent.keyDown(handle('draw', 'bar'), { key: 'Delete' });
    fireEvent.keyDown(handle('pin', 'bar'), { key: 'Delete' });
    await eachFrame(SETTLE_FRAMES, watch(() => null));
    // A hidden Draw tool is stored with the id of the Text control it took in.
    expect(settings.getToolbarLayout().hidden).toEqual(['draw', 'pin', 'text']);
    fireEvent.click(screen.getByRole('button', { name: 'Reset toolbar' }));
    await eachFrame(SETTLE_FRAMES, watch(() => null));
    expect(settings.getToolbarLayout()).toEqual({});
    expect(barIds()).toEqual(DEFAULT_BAR);
    expect(problems).toEqual([]);
  });

  it('with reduced motion, hides a tool at once and fades its ghost out where it was', async () => {
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    // Motion hears of the change from the media query's change event.
    await settle(5);
    await mount();
    await startEditing();
    const takeOff = rectOf(query('.atlas-main-toolbar > [data-toolbar-item="fog"] > .atlas-toolbar-item__content'));
    const problems: string[] = [];
    const ghosts: Rect[] = [];
    fireEvent.keyDown(handle('fog', 'bar'), { key: 'Delete' });
    await eachFrame(1, () => {
      if (!query('.atlas-main-toolbar > [data-toolbar-item="fog"]').hidden) problems.push('the bar slot is still there');
      const slot = rectOf(query('.atlas-toolbar-tray [data-tray-item="fog"]'));
      const face = rectOf(query('.atlas-toolbar-tray [data-tray-item="fog"] > .atlas-toolbar-face'));
      if (slot.width !== face.width) problems.push(`the tray slot opens: ${slot.width} of ${face.width}`);
    });
    await eachFrame(SETTLE_FRAMES / 3, () => {
      problems.push(...transformed('.atlas-toolbar-item', false));
      const box = ghostBox();
      if (box) ghosts.push(box);
    });
    expect(problems).toEqual([]);
    expect(ghosts.length).toBeGreaterThan(0);
    for (const box of ghosts) expectSameBox(box, takeOff);
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
    expect(settings.getToolbarLayout().hidden).toEqual(['fog']);
  });
});
