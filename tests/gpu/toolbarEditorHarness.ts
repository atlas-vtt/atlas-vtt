import '../setup/obsidianDom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { frame } from 'framer-motion';
import { expect, vi } from 'vitest';
import { cdp } from 'vitest/browser';
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

/**
 * The toolbar editor's browser tests share this: the bottom row as UIRoot lays it out (undo and
 * redo, the main toolbar, the view actions), styled by the real stylesheet, and helpers to watch
 * it frame by frame. Each test file mocks what MainToolbar pulls in but these tests never open.
 */

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --shadow-l: 0 8px 24px rgba(0, 0, 0, 0.5); --text-error: #fb464c; }
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

export const DEFAULT_BAR = ['move', 'fog', 'draw', 'text', 'measure', 'pin', 'dice', 'loot', 'assets', 'palette'];
/** Longer than any of the editor's springs. */
export const SETTLE_FRAMES = 90;

export interface Rect { left: number; top: number; width: number; height: number }

export function rectOf(element: Element | null): Rect {
  if (!element) throw new Error('missing element');
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

export const query = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element;
};

export const barIds = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.atlas-main-toolbar > [data-toolbar-item]:not([hidden])')).map((item) => item.dataset.toolbarItem ?? '');

/** Runs `sample` after Motion has drawn each of the next `frames` frames. */
export function eachFrame(frames: number, sample: () => void): Promise<void> {
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

export const settle = (frames = SETTLE_FRAMES): Promise<void> => eachFrame(frames, () => undefined);

export function matrixOf(element: Element): DOMMatrixReadOnly {
  const transform = getComputedStyle(element).transform;
  return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
}

/** Elements drawn out of their laid-out shape or place: what a layout size morph or a stray glide leaves. */
export function transformed(selector: string, allowTranslation: boolean): string[] {
  return Array.from(document.querySelectorAll(selector)).flatMap((element) => {
    const { a, b, c, d, e, f } = matrixOf(element);
    const stretched = a !== 1 || d !== 1 || b !== 0 || c !== 0;
    return stretched || (!allowTranslation && (e !== 0 || f !== 0)) ? [`${selector} ${element.outerHTML.slice(0, 80)}`] : [];
  });
}

/** The ghost's box without its swell or lift (it scales about its centre). */
export function ghostBox(): Rect | null {
  const ghost = document.querySelector('.atlas-toolbar-ghost');
  if (!ghost) return null;
  const rect = rectOf(ghost);
  const scale = matrixOf(ghost).a;
  const width = rect.width / scale;
  const height = rect.height / scale;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
}

export function expectSameBox(actual: Rect, expected: Rect): void {
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(0.5);
  }
}

export const handle = (id: string, where: 'bar' | 'tray'): HTMLElement =>
  query(`${where === 'bar' ? '.atlas-main-toolbar' : '.atlas-toolbar-tray'} .atlas-toolbar-handle[data-control="${id}"]`);

/** The stylesheet the tests render with; returns its removal. */
export function installToolbarStyles(): () => void {
  const style = document.createElement('style');
  style.textContent = THEME + UTILITIES + css + tooltipCss + contextMenuCss;
  document.head.append(style);
  return () => style.remove();
}

export interface ToolbarHarness {
  store: ViewAtlasStore;
  settings: SettingsService;
  startEditing: () => Promise<void>;
}

export async function mountToolbar(stored: StoredToolbarLayout = {}): Promise<ToolbarHarness> {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  // Its file is read first, as at startup: a write before that would be lost to the read.
  await settings.initialize();
  settings.completeTutorial('palette');
  settings.setToolbarLayout(stored);
  const store = createViewAtlasStore(app, `toolbar-editor-gpu-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const view = {
    viewId: 'view-1',
    getViewType: () => 'atlas-vtt',
    serviceManager: {
      getEventBus: () => ({ on: vi.fn(), off: vi.fn(), emit: () => true }),
      getToolController: () => null,
      getNotePreviewUIManager: () => null,
      getRendererService: () => null,
    },
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
  return {
    store,
    settings,
    startEditing: async () => {
      act(() => store.getState().setToolbarEditing(true));
      // The tray waits for the palette to go, then rises.
      await settle(40);
    },
  };
}

/** Keys held with a mouse event, as the browser's input protocol counts them. */
export const CTRL_KEY = 2;

/**
 * The real mouse, through the browser: points are in this frame's client coordinates, which the
 * test runner shows scaled inside its own page, where the input lands.
 */
export const mouse = {
  async send(type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number, pressed: boolean, modifiers = 0): Promise<void> {
    const host = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    await cdp().send('Input.dispatchMouseEvent', {
      type,
      x: host.left + x * host.width / window.innerWidth,
      y: host.top + y * host.height / window.innerHeight,
      button: type === 'mouseMoved' && !pressed ? 'none' : 'left',
      buttons: pressed ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      modifiers,
    });
  },
  down: (x: number, y: number): Promise<void> => mouse.send('mousePressed', x, y, true),
  move: (x: number, y: number): Promise<void> => mouse.send('mouseMoved', x, y, true),
  up: (x: number, y: number): Promise<void> => mouse.send('mouseReleased', x, y, false),
};

export function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
