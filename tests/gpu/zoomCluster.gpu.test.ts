import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
// The tracker's stylesheet comes with its component; it places the tracker and moves the zoom buttons beside it
import trackerCss from '../../src/app/react/components/initiative-tracker.scss?inline';
import { ZoomButtonsChoice } from '../../src/app/input/zoomButtons';
import { ZoomCluster } from '../../src/app/react/components/ZoomCluster';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { touch, wait } from './touchHarness';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'Shift+1', useAtlasSettings: () => undefined }));

// The device's pointer: the test's to change. The stylesheet reads it from the body's attribute, as in the app.
const device = vi.hoisted(() => ({ coarse: true }));
vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => device.coarse }));

const zoomViewByNotch = vi.hoisted(() => vi.fn());
const fitMapInView = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/pixi/mapZoomActions', () => ({ zoomViewByNotch, fitMapInView }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --divider-color: #363636; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; }
`;
const h = React.createElement;
const VIEWPORT = { viewport: true };
const MAP_RECT = { x: 0, y: 0, width: 2000, height: 1000 };

interface Box { left: number; top: number; right: number; bottom: number }
const boxOf = (selector: string): Box => {
  const rect = document.querySelector(selector)!.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
};
const meet = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * The zoom buttons on a map view of a tablet's size, beside what else stands at the view's edges:
 * the row of the scene tabs and widgets at the top, the toolbar's row at the bottom, the level
 * switcher at the left edge and, when it is open at the right edge, the initiative tracker.
 */
describe('the zoom buttons', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + trackerCss;
  const { app } = createInMemoryApp({ files: {} });
  const ui = { app, view: null, pixiApp: null, renderer: { getViewportInstance: () => VIEWPORT, getMapRect: () => MAP_RECT } } as unknown as AtlasUIContextValue;

  /** The chrome's own classes, so the stylesheet places each as on the map; their contents are blocks of the real sizes. */
  const mount = (size: { width: number; height: number }, tracker: string | null = null): void => {
    const block = (width: number, height: number): React.ReactElement => h('div', { style: { width, height, pointerEvents: 'auto' } });
    render(h('div', { className: 'atlas-vtt-plugin', style: { position: 'fixed', left: 0, top: 0, ...size } },
      h('div', { className: 'atlas-ui', style: { position: 'relative', width: '100%', height: '100%' } },
        h('div', { className: 'atlas-top-bar-row' },
          h('div', { className: 'atlas-top-bar-start', 'data-part': 'tabs' }, block(360, 48)),
          h('div', { className: 'atlas-top-bar-end', 'data-part': 'widgets', style: { marginLeft: 'auto' } }, block(200, 56))),
        h('div', { className: 'atlas-bottom-toolbar-row' },
          h('div', { className: 'atlas-vtt-toolbar atlas-main-toolbar', 'data-part': 'toolbar' }, block(520, 44))),
        h('div', { className: 'atlas-level-switcher' }, block(120, 28), block(120, 28), block(120, 28)),
        h(AtlasUIContext.Provider, { value: ui }, h(ZoomCluster)),
        tracker === null ? null : h('div', { className: `atlas-initiative-tracker ${tracker}` }, block(80, 420)))));
  };

  beforeEach(() => {
    device.coarse = true;
    document.body.setAttribute('data-atlas-pointer', 'coarse');
    document.head.append(style);
    zoomViewByNotch.mockClear();
    fitMapInView.mockClear();
    ZoomButtonsChoice.forApp(app).setShown(false);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.removeAttribute('data-atlas-pointer');
  });

  for (const size of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    it(`stand at the right edge at mid-height of a ${size.width} × ${size.height} view, clear of the bars at its other edges`, async () => {
      await page.viewport(size.width, size.height);
      mount(size);
      const cluster = boxOf('.atlas-zoom-cluster');
      expect(size.width - cluster.right).toBeCloseTo(8, 0);
      expect((cluster.top + cluster.bottom) / 2).toBeCloseTo(size.height / 2, 0);
      // Upright: three buttons a finger can hit, one under the other
      const buttons = Array.from(document.querySelectorAll('.atlas-zoom-cluster button')).map((button) => button.getBoundingClientRect());
      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      expect(buttons[1]!.top).toBeGreaterThanOrEqual(buttons[0]!.bottom);
      expect(buttons[2]!.top).toBeGreaterThanOrEqual(buttons[1]!.bottom);
      expect(cluster.right - cluster.left).toBeLessThan(60);
      for (const other of ['[data-part="tabs"]', '[data-part="widgets"]', '[data-part="toolbar"]', '.atlas-level-switcher']) {
        expect(meet(cluster, boxOf(other)), other).toBe(false);
      }
      // Every button stands the bar's inset inside it, on all sides alike
      expect(buttons[0]!.top - cluster.top).toBeCloseTo(buttons[0]!.left - cluster.left, 0);
      expect(cluster.bottom - buttons[2]!.bottom).toBeCloseTo(cluster.right - buttons[2]!.right, 0);
    });

    it(`stand beside the initiative tracker while it is docked at the right edge of a ${size.width} × ${size.height} view`, async () => {
      await page.viewport(size.width, size.height);
      for (const tracker of ['', 'atlas-initiative-tracker--named']) {
        mount(size, tracker);
        const cluster = boxOf('.atlas-zoom-cluster');
        const panel = boxOf('.atlas-initiative-tracker');
        expect(meet(cluster, panel), tracker).toBe(false);
        expect(panel.left - cluster.right, tracker).toBeCloseTo(8, 0);
        cleanup();
      }
      mount(size, 'atlas-initiative-tracker--left');
      expect(size.width - boxOf('.atlas-zoom-cluster').right).toBeCloseTo(8, 0);
    });
  }

  it('zoom in, zoom out and fit under a finger\'s tap', async () => {
    await page.viewport(1180, 820);
    mount({ width: 1180, height: 820 });
    const buttons = Array.from(document.querySelectorAll('.atlas-zoom-cluster button')).map((button) => button.getBoundingClientRect());
    const tap = async (rect: DOMRect): Promise<void> => {
      await touch.down({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      await touch.up();
      await wait(120);
    };
    await tap(buttons[0]!);
    expect(zoomViewByNotch).toHaveBeenLastCalledWith(VIEWPORT, 1);
    await tap(buttons[1]!);
    expect(zoomViewByNotch).toHaveBeenLastCalledWith(VIEWPORT, -1);
    expect(zoomViewByNotch).toHaveBeenCalledTimes(2);
    await tap(buttons[2]!);
    expect(fitMapInView).toHaveBeenCalledExactlyOnceWith(VIEWPORT, MAP_RECT);
    await touch.send('touchCancel', []).catch(() => undefined);
  });

  it('show with a mouse only where the GM switched them on, at the toolbar\'s button size', async () => {
    await page.viewport(1180, 820);
    device.coarse = false;
    document.body.removeAttribute('data-atlas-pointer');
    mount({ width: 1180, height: 820 });
    expect(document.querySelector('.atlas-zoom-cluster')).toBeNull();

    act(() => ZoomButtonsChoice.forApp(app).setShown(true));
    const button = document.querySelector('.atlas-zoom-cluster button')!.getBoundingClientRect();
    expect(button.width).toBe(40);
    expect(button.height).toBe(40);
    // The choice is this device's
    expect(app.loadLocalStorage('atlas-vtt:zoom-buttons')).toBe('shown');

    act(() => ZoomButtonsChoice.forApp(app).setShown(false));
    expect(document.querySelector('.atlas-zoom-cluster')).toBeNull();
    expect(app.loadLocalStorage('atlas-vtt:zoom-buttons')).toBeNull();
  });
});
