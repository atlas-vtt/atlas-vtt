import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { CTRL_KEY, centreOf, mouse } from './realMouse';
import { installToolbarStyles, mountToolbar, query, rectOf, settle, type Rect } from './toolbarEditorHarness';
import { scrollOnCtrlWheel } from '../../src/app/services/previewWheel';

vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ openPlayerWindow: vi.fn(), presentActiveTab: vi.fn(), presentTab: vi.fn(), frameSourceOf: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

/** A preview as they all are: a fixed box with one scrolling body, which a wheel over its padding misses. */
function preview(): { element: HTMLElement; body: HTMLElement } {
  const element = document.body.createDiv();
  element.style.cssText = 'position: fixed; left: 50px; top: 50px; width: 300px; padding: 8px;';
  const body = element.createDiv();
  body.style.cssText = 'height: 200px; overflow-y: auto;';
  body.createDiv().style.height = '2000px';
  return { element, body };
}

describe('Ctrl+wheel in a real browser', () => {
  afterEach(() => {
    document.body.empty();
  });

  it('scrolls a preview once per wheel, where macOS scrolls by itself too, and stops at its end', async () => {
    const { element, body } = preview();
    scrollOnCtrlWheel(element);
    const { x, y } = centreOf(body);
    const widthBefore = document.documentElement.clientWidth;
    await mouse.hover(x, y);

    await mouse.wheel(x, y, 120, CTRL_KEY);
    await vi.waitFor(() => expect(body.scrollTop).toBe(120));

    await mouse.wheel(x, y, 5000, CTRL_KEY);
    await vi.waitFor(() => expect(body.scrollTop).toBe(1800));
    await mouse.wheel(x, y, 120, CTRL_KEY);
    await settle(1);
    expect(body.scrollTop).toBe(1800);
    expect(document.documentElement.clientWidth).toBe(widthBefore);
  });
});

describe('the bottom row and Obsidian\'s font size', () => {
  let removeStyles: () => void = () => undefined;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    removeStyles = installToolbarStyles();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(() => {
    cleanup();
    removeStyles();
    document.documentElement.style.removeProperty('font-size');
  });

  it('keeps its size when Obsidian sets another root font size, as its Ctrl+wheel font action does', async () => {
    await mountToolbar();
    const measured = (): Record<string, Pick<Rect, 'width' | 'height'>> => Object.fromEntries(
      ['.atlas-main-toolbar', '.atlas-undo-bar'].map((selector) => {
        const { width, height } = rectOf(query(selector));
        return [selector, { width, height }];
      }),
    );
    const before = measured();

    document.documentElement.style.setProperty('font-size', '24px');
    await settle(10);

    expect(measured()).toEqual(before);
  });
});
