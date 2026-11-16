import '../setup/obsidianDom';
import { createElement } from 'react';
import { act } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import { DungeonGeneratorPage } from '../../src/app/packages/components/dungeon-generator/DungeonGeneratorPage';

/**
 * The dungeon generator's own tab, laid out by the plugin's real stylesheet and drawn by the real
 * worker. The variables stand in for Obsidian's theme.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --divider-color: #363636; --text-normal: #dadada; --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --mono-100: #ffffff; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 24px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; }
  button, input { font: inherit; }
  button { height: 30px; }
  .view-content { padding: 16px; }
`;

const app = {} as App;
let root: Root | null = null;
let tab: HTMLElement;
const closed = vi.fn();
const style = document.createElement('style');
style.textContent = THEME + css;

/** The generator in a tab of `width` × `height` px. */
async function openTab(width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  tab = document.body.createDiv({ cls: 'view-content atlas-vtt-plugin atlas-dungeon-generator-view' });
  tab.style.cssText = `position: fixed; inset: 0;`;
  root = createRoot(tab);
  act(() => root!.render(createElement(DungeonGeneratorPage, { app, collectionId: 'Dungeons', onCollectionChange: () => {}, onCreated: () => {}, onClose: closed })));
  // Measured once the map has slid into place and is drawn
  const preview = (): Element => tab.querySelector('.atlas-dungeon-wizard-preview--page')!;
  await expect.poll(() => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(preview()).transform), { timeout: 2000 }).toBe(true);
  await expect.poll(() => tab.querySelector('.atlas-dungeon-preview__skeleton'), { timeout: 15000 }).toBeNull();
}

const box = (selector: string): DOMRect => tab.querySelector(selector)!.getBoundingClientRect();

describe('the dungeon generator in its own tab', () => {
  beforeEach(() => {
    MotionGlobalConfig.skipAnimations = true;
    document.head.append(style);
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    tab.remove();
    style.remove();
    DungeonWorkerClient.release(app);
    MotionGlobalConfig.skipAnimations = false;
  });

  it('stands the panel the tab\'s height on the left and the map in the room beside it', async () => {
    await openTab(1400, 860);
    const panel = box('.atlas-dungeon-wizard--page');
    const room = box('.atlas-dungeon-wizard-preview--page');
    const map = box('.atlas-dungeon-preview__map');
    expect(panel.left).toBeCloseTo(24, 0);
    expect(panel.top).toBeCloseTo(24, 0);
    expect(panel.bottom).toBeCloseTo(860 - 24, 0);
    expect(room.left).toBeCloseTo(panel.right + 24, 0);
    expect(room.right).toBeCloseTo(1400 - 24, 0);
    // The map is large, within its room and in its middle
    expect(map.width).toBeGreaterThan(700);
    expect(map.left).toBeGreaterThanOrEqual(room.left - 0.5);
    expect(map.right).toBeLessThanOrEqual(room.right + 0.5);
    expect(map.top).toBeGreaterThanOrEqual(room.top - 0.5);
    expect(map.bottom).toBeLessThanOrEqual(room.bottom + 0.5);
    expect(Math.abs((map.left + map.right) / 2 - (room.left + room.right) / 2)).toBeLessThan(1);
    // Its close button closes the tab
    act(() => tab.querySelector<HTMLButtonElement>('.atlas-dungeon-wizard__header .atlas-close-btn')!.click());
    expect(closed).toHaveBeenCalledOnce();
  });

  it('stands the map above the panel in a narrow tab', async () => {
    await openTab(600, 900);
    const panel = box('.atlas-dungeon-wizard--page');
    const room = box('.atlas-dungeon-wizard-preview--page');
    expect(room.bottom).toBeLessThanOrEqual(panel.top);
    expect(panel.left).toBeCloseTo(16, 0);
    expect(panel.right).toBeCloseTo(600 - 16, 0);
    expect(panel.bottom).toBeCloseTo(900 - 16, 0);
  });

  it('fades a new picture in on a surface of its own, none of them changing size on the way', async () => {
    await openTab(1400, 860);
    MotionGlobalConfig.skipAnimations = false;
    const sizes = new Map<Element, Set<string>>();
    let fadedOut = false;
    let watching = true;
    const watch = (): void => {
      const surfaces = [...tab.querySelectorAll('.atlas-dungeon-preview__map')];
      for (const surface of surfaces) {
        const { width, height } = surface.getBoundingClientRect();
        sizes.set(surface, (sizes.get(surface) ?? new Set()).add(`${Math.round(width)}x${Math.round(height)}`));
      }
      if (surfaces.length > 1) fadedOut ||= Number(getComputedStyle(surfaces[0]!).opacity) < 1;
      if (watching) requestAnimationFrame(watch);
    };
    watch();
    const first = tab.querySelector('.atlas-dungeon-preview__map');
    // New layout, the last of the map's tools
    act(() => [...tab.querySelectorAll<HTMLButtonElement>('.atlas-dungeon-wizard-preview__tool')].at(-1)!.click());
    await expect.poll(() => tab.querySelector('.atlas-dungeon-preview__map') !== first && tab.querySelectorAll('.atlas-dungeon-preview__map').length === 1, { timeout: 15000 }).toBe(true);
    watching = false;
    expect(fadedOut).toBe(true);
    for (const seen of sizes.values()) expect([...seen]).toHaveLength(1);
  });
});
