import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { frame } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tooltipCss from '../../src/app/packages/components/primitives/tooltip.css?inline';
import contextMenuCss from '../../src/app/react/components/context-menu/atlas-context-menu.scss?inline';
import { MainToolbar } from '../../src/app/packages/components/MainToolbar';
import { BottomToolbarRow } from '../../src/app/react/components/BottomToolbarRow';
import { UndoRedoControls } from '../../src/app/react/components/UndoRedoControls';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { StoredToolbarLayout } from '../../src/app/toolbar/toolbarLayout';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

/** The bottom row as UIRoot lays it out (undo and redo, the main toolbar, the view actions), styled by the real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --shadow-l: 0 8px 24px rgba(0, 0, 0, 0.5); }
`;
/**
 * The Tailwind utilities the bar's controls use, as the plugin's build generates them (scoped to
 * `.atlas-vtt-plugin`): Tailwind runs on styles/index.css only when it is built as the entry.
 */
const UTILITIES = `
  .atlas-vtt-plugin .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
  .atlas-vtt-plugin .relative { position: relative; }
  .atlas-vtt-plugin .flex { display: flex; }
  .atlas-vtt-plugin .items-center { align-items: center; }
  .atlas-vtt-plugin .pointer-events-auto { pointer-events: auto; }
  .atlas-vtt-plugin .h-9 { height: 2.25rem; }
  .atlas-vtt-plugin .w-5 { width: 1.25rem; }
  .atlas-vtt-plugin .p-0 { padding: 0; }
  .atlas-vtt-plugin .ml-0 { margin-left: 0; }
`;
const h = React.createElement;
const DEFAULT_BAR = ['move', 'fog', 'draw', 'text', 'measure', 'pin', 'dice', 'loot', 'assets', 'palette'];
/** Longer than any of the editor's springs. */
const SETTLE_FRAMES = 90;

interface Rect { left: number; top: number; width: number; height: number }

function rectOf(element: Element | null): Rect {
  if (!element) throw new Error('missing element');
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

const query = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element;
};

const barIds = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.atlas-main-toolbar > [data-toolbar-item]:not([hidden])')).map((item) => item.dataset.toolbarItem ?? '');

/** Runs `sample` after Motion has drawn each of the next `frames` frames. */
function eachFrame(frames: number, sample: () => void): Promise<void> {
  return new Promise((resolve) => {
    let left = frames;
    const step = (): void => {
      sample();
      left -= 1;
      if (left <= 0) resolve();
      else frame.postRender(step);
    };
    frame.postRender(step);
  });
}

const settle = (frames = SETTLE_FRAMES): Promise<void> => eachFrame(frames, () => undefined);

function matrixOf(element: Element): DOMMatrixReadOnly {
  const transform = getComputedStyle(element).transform;
  return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
}

/** Elements drawn out of their laid-out shape or place: what a layout size morph or a stray glide leaves. */
function transformed(selector: string, allowTranslation: boolean): string[] {
  return Array.from(document.querySelectorAll(selector)).flatMap((element) => {
    const { a, b, c, d, e, f } = matrixOf(element);
    const stretched = a !== 1 || d !== 1 || b !== 0 || c !== 0;
    return stretched || (!allowTranslation && (e !== 0 || f !== 0)) ? [`${selector} ${element.outerHTML.slice(0, 80)}`] : [];
  });
}

/** The ghost's box without the swell of its flight (it scales about its centre). */
function ghostBox(): Rect | null {
  const ghost = document.querySelector('.atlas-toolbar-ghost');
  if (!ghost) return null;
  const rect = rectOf(ghost);
  const scale = matrixOf(ghost).a;
  const width = rect.width / scale;
  const height = rect.height / scale;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

function expectSameBox(actual: Rect, expected: Rect): void {
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(0.5);
  }
}

describe('the toolbar editor in a real layout', () => {
  const style = document.createElement('style');
  style.textContent = THEME + UTILITIES + css + tooltipCss + contextMenuCss;
  let store: ViewAtlasStore;
  let settings: SettingsService;

  async function mount(stored: StoredToolbarLayout = {}): Promise<void> {
    const { app } = createInMemoryApp({ files: {} });
    settings = new SettingsService(app);
    // Its file is read first, as at startup: a write before that would be lost to the read.
    await settings.initialize();
    settings.completeTutorial('palette');
    settings.setToolbarLayout(stored);
    store = createViewAtlasStore(app, `toolbar-editor-gpu-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const view = {
      viewId: 'view-1',
      getViewType: () => 'atlas-vtt',
      serviceManager: { getEventBus: () => ({ on: vi.fn(), off: vi.fn(), emit: () => true }), getToolController: () => null, getNotePreviewUIManager: () => null },
      setFogBrushSize: vi.fn(),
      clearAllFog: vi.fn(),
      openSceneBrowser: vi.fn(),
    };
    const ui = { app, view, pixiApp: null, renderer: { getTokenRenderer: () => ({ visibleTokenIds: () => [] }) } } as unknown as AtlasUIContextValue;
    render(h('div', { className: 'atlas-vtt-plugin' },
      h(AtlasUIContext.Provider, { value: ui },
        h(ViewStoreProvider, {
          store,
          children: h(ContextMenuProvider, null,
            h(BottomToolbarRow, {
              start: h(UndoRedoControls, { viewId: 'view-1' }),
              end: h('div', { className: 'atlas-view-actions-stub', style: { width: 120, height: 40 } }),
              children: h(MainToolbar, { viewId: 'view-1' }),
            })),
        }))));
    await settle(10);
  }

  async function startEditing(): Promise<void> {
    act(() => store.getState().setToolbarEditing(true));
    // The tray waits for the palette to go, then rises.
    await settle(40);
  }

  const handle = (id: string, where: 'bar' | 'tray'): HTMLElement =>
    query(`${where === 'bar' ? '.atlas-main-toolbar' : '.atlas-toolbar-tray'} .atlas-toolbar-handle[data-control="${id}"]`);

  beforeEach(async () => {
    await page.viewport(1280, 800);
    document.head.append(style);
    // Animations update React outside `act`, as in the app.
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(async () => {
    cleanup();
    style.remove();
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  });

  it('shows the untouched default layout at 1280 px in today\'s order, without "More tools"', async () => {
    await mount();
    expect(barIds()).toEqual(DEFAULT_BAR);
    expect(document.querySelector('.atlas-toolbar-overflow')).toBeNull();
  });

  it('hangs the tray 8 px above the bar, centred on it, as a capsule with concentric ends', async () => {
    await mount({ hidden: ['loot'] });
    await startEditing();
    const bar = rectOf(query('.atlas-main-toolbar'));
    const tray = rectOf(query('.atlas-toolbar-tray'));
    expect(Math.abs(bar.top - (tray.top + tray.height) - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bar.left + bar.width / 2 - (tray.left + tray.width / 2))).toBeLessThanOrEqual(0.5);
    expect(tray.height).toBeLessThan(48);
    expect(getComputedStyle(query('.atlas-toolbar-tray [data-tray-item="loot"] .btn')).borderTopLeftRadius).toBe('16px');
    expect(getComputedStyle(query('.atlas-toolbar-tray__done')).borderTopRightRadius).toBe('16px');
  });

  it('keeps the bar\'s end corners concentric with its own, in and out of edit mode', async () => {
    await mount();
    const corners = (): string[] => [
      getComputedStyle(query('.atlas-main-toolbar > [data-toolbar-item="move"] .atlas-tool-group')).borderTopLeftRadius,
      getComputedStyle(query('.atlas-main-toolbar > .atlas-toolbar-end > .atlas-toggle')).borderTopRightRadius,
    ];
    expect(corners()).toEqual(['14.5px', '14.5px']);
    await startEditing();
    expect(corners()).toEqual(['14.5px', '14.5px']);
    expect(getComputedStyle(handle('move', 'bar')).borderTopLeftRadius).toBe('14.5px');
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
    expect(settings.getToolbarLayout().hidden).toEqual(['draw', 'pin']);
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
