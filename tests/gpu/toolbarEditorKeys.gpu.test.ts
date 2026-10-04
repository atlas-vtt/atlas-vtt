import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import {
  centreOf, CTRL_KEY, eachFrame, handle, installToolbarStyles, mountToolbar, mouse, query, settle, SETTLE_FRAMES, type ToolbarHarness,
} from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

const slot = (id: string): HTMLElement => query(`.atlas-main-toolbar > [data-toolbar-item="${id}"]`);
const content = (id: string): HTMLElement => query(`.atlas-main-toolbar > [data-toolbar-item="${id}"] > .atlas-toolbar-item__content`);
const menuItems = (): string[] => Array.from(document.querySelectorAll('[role="menuitem"]')).map(item => item.textContent ?? '');
const reduceMotion = (value: 'reduce' | 'no-preference'): Promise<unknown> =>
  cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
/** The horizontal offset of an element's own `translate` (the refusal's shake). */
const translateX = (element: Element): number => {
  const value = getComputedStyle(element).translate;
  return value === 'none' ? 0 : parseFloat(value);
};

describe('the toolbar editor\'s keys and menus in a real browser', () => {
  let harness: ToolbarHarness;
  let removeStyles: () => void = () => undefined;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    removeStyles = installToolbarStyles();
    // Animations update React outside `act`, as in the app.
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
    harness = await mountToolbar();
    await harness.startEditing();
  });

  afterEach(async () => {
    cleanup();
    removeStyles();
    await reduceMotion('no-preference');
  });

  // Only macOS turns Ctrl+click into a context menu.
  it.skipIf(!navigator.userAgent.includes('Mac'))('opens the editor menu on Ctrl+click, ending the press', async () => {
    const at = centreOf(handle('fog', 'bar'));
    await mouse.send('mousePressed', at.x, at.y, true, CTRL_KEY);
    await mouse.send('mouseReleased', at.x, at.y, false, CTRL_KEY);
    await settle(10);
    expect(menuItems()).toEqual(['Hide']);
    expect(slot('fog').dataset.pressed).toBeUndefined();
    expect(document.querySelector('.atlas-toolbar-ghost')).toBeNull();
  });

  it('fades the well in where a tool was lifted off', async () => {
    const at = centreOf(handle('fog', 'bar'));
    await mouse.down(at.x, at.y);
    await mouse.move(at.x + 10, at.y);
    await settle(2);
    const well = getComputedStyle(slot('fog'), '::before');
    expect(well.animationName).toBe('atlas-toolbar-fade-in');
    expect(well.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    await userEvent.keyboard('{Escape}');
    await mouse.up(at.x + 10, at.y);
    await settle(SETTLE_FRAMES);
  });

  it('shakes the Command palette when Delete cannot hide it, and leaves it where it was', async () => {
    handle('palette', 'bar').focus();
    let widest = 0;
    await userEvent.keyboard('{Delete}');
    await eachFrame(30, () => { widest = Math.max(widest, Math.abs(translateX(content('palette')))); });
    expect(widest).toBeGreaterThan(1);
    expect(translateX(content('palette'))).toBe(0);
    expect(harness.settings.getToolbarLayout()).toEqual({});
  });

  it('with reduced motion, rings the Command palette in the error colour for a moment instead', async () => {
    await reduceMotion('reduce');
    handle('palette', 'bar').focus();
    await userEvent.keyboard('{Delete}');
    expect(slot('palette').dataset.refused).toBe('');
    expect(getComputedStyle(content('palette'), '::after').outlineColor).toBe('rgb(251, 70, 76)');
    expect(translateX(content('palette'))).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(slot('palette').dataset.refused).toBeUndefined();
  });

  it('with reduced motion, does not grow "More tools" as a landing place', async () => {
    await page.viewport(560, 800);
    await settle(10);
    const overflow = query('.atlas-main-toolbar .atlas-toolbar-overflow');
    overflow.dataset.dropTarget = 'true';
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(getComputedStyle(overflow).transform).toBe('matrix(1.06, 0, 0, 1.06, 0, 0)');
    await reduceMotion('reduce');
    expect(getComputedStyle(overflow).transform).toBe('none');
  });
});
