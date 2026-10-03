import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { centreOf, handle, installToolbarStyles, mountToolbar, mouse, query, rectOf, settle } from './toolbarEditorHarness';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

const card = (): HTMLElement => query('.atlas-toolbar-card');
const opacity = (): number => (card().hidden ? 0 : Number(getComputedStyle(card()).opacity));
const label = (): string => card().querySelector('.atlas-toolbar-card__label')?.textContent ?? '';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Waits frame by frame until `done` holds; fails after `timeoutMs`. */
async function until(done: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = performance.now();
  while (!done()) {
    if (performance.now() - start > timeoutMs) throw new Error('timed out');
    await settle(1);
  }
}

/** Moves the mouse, no button held, from a corner of the window onto `element`'s middle. */
async function hover(element: Element): Promise<{ x: number; y: number }> {
  await mouse.send('mouseMoved', 4, 4, false);
  const point = centreOf(element);
  await mouse.send('mouseMoved', point.x, point.y, false);
  return point;
}

describe('the toolbar editor\'s card in a real layout', () => {
  let removeStyles: () => void = () => undefined;

  async function mount(): Promise<void> {
    const harness = await mountToolbar();
    await harness.startEditing();
  }

  beforeEach(async () => {
    await page.viewport(1280, 800);
    removeStyles = installToolbarStyles();
    // Animations update React outside `act`, as in the app.
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(async () => {
    await mouse.send('mouseMoved', 4, 4, false);
    cleanup();
    removeStyles();
  });

  it('opens after 500 ms of hover with its heading, sentence and screenshot, and a press hides it within a frame', async () => {
    await mount();
    const point = await hover(handle('measure', 'bar'));
    const hoveredAt = performance.now();
    await sleep(350);
    expect(opacity()).toBe(0);
    await until(() => opacity() === 1);
    expect(performance.now() - hoveredAt).toBeGreaterThanOrEqual(500);

    expect(label()).toBe('Measure');
    expect(card().textContent).toContain('Measure a distance, or the reach of a circle or cone');
    const image = card().querySelector('img');
    if (!image) throw new Error('no screenshot');
    await image.decode();
    expect(image.naturalWidth).toBe(560);
    // Concentric with the card's corners on the two that face them.
    expect(getComputedStyle(image).borderTopLeftRadius).toBe('14.5px');
    expect(getComputedStyle(image).borderBottomLeftRadius).toBe('8px');

    // Above the tray, centred over its tool.
    const box = rectOf(card());
    const tray = rectOf(query('.atlas-toolbar-tray'));
    expect(Math.abs(tray.top - (box.top + box.height) - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.left + box.width / 2 - point.x)).toBeLessThanOrEqual(0.5);
    expect(box.width).toBeCloseTo(299, 0);

    await mouse.down(point.x, point.y);
    await settle(1);
    expect(opacity()).toBe(0);
    await mouse.up(point.x, point.y);
  });

  it('moves to a neighbour at once, and gives a dropped tool no card until the pointer has left it', async () => {
    await mount();
    await hover(handle('measure', 'bar'));
    await until(() => opacity() === 1);
    const pin = centreOf(handle('pin', 'bar'));
    await mouse.send('mouseMoved', pin.x, pin.y, false);
    await until(() => label() === 'Note pin' && opacity() === 1, 100);

    // A drag that ends where it began: the ghost settles back onto Note pin, under the pointer.
    await mouse.down(pin.x, pin.y);
    await mouse.move(pin.x + 10, pin.y);
    await settle(1);
    expect(opacity()).toBe(0);
    await mouse.move(pin.x, pin.y);
    await mouse.up(pin.x, pin.y);
    await sleep(900);
    expect(opacity()).toBe(0);

    await mouse.send('mouseMoved', 4, 4, false);
    await mouse.send('mouseMoved', pin.x, pin.y, false);
    await until(() => label() === 'Note pin' && opacity() === 1);
  });

  it('leaves the screenshot out where the room above the tray is too low for it, and stays in the window', async () => {
    await page.viewport(1280, 300);
    await mount();
    await hover(handle('move', 'bar'));
    await until(() => opacity() === 1);
    expect(card().querySelector('img')).toBeNull();
    expect(label()).toBe('Move and select');
    expect(rectOf(card()).top).toBeGreaterThanOrEqual(0);
    expect(rectOf(card()).left).toBeGreaterThanOrEqual(8);
  });
});
