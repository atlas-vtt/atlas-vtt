import '../setup/obsidianDom';
import { act } from '@testing-library/react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { Dashboard } from '../../src/app/dashboard-view';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The asset service reaches for Node modules a browser lacks; the dashboard only lists scenes with it
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ getCollections: async () => [] }) },
}));
vi.mock('../../src/app/services/GlobalAssetManagerService', () => ({ GlobalAssetManagerService: class {} }));

/** The variables stand in for Obsidian's theme. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --text-normal: #dadada; --text-muted: #b3b3b3; --interactive-accent: #7f6df2;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --h1-size: 2em; }
`;
/** The window the report was made in: wide enough for two columns, whatever the tab's own width. */
const WINDOW = { width: 1440, height: 900 };

const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
const cards = (): DOMRect[] => [...document.querySelectorAll('.action-card')].map((card) => card.getBoundingClientRect());

describe('the dashboard in a tab narrower than its window', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  let leaf: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    await page.viewport(WINDOW.width, WINDOW.height);
    document.head.append(style);
    leaf = document.body.appendChild(document.createElement('div'));
    leaf.className = 'workspace-leaf-content atlas-vtt-plugin atlas-dashboard-view';
    root = createRoot(leaf);
  });

  afterEach(() => {
    act(() => root.unmount());
    leaf.remove();
    style.remove();
  });

  async function open(width: number): Promise<void> {
    leaf.style.width = `${width}px`;
    const { app } = createInMemoryApp({ files: {} });
    const nothing = (): void => {};
    act(() => root.render(React.createElement(Dashboard, { app, onOpenScene: nothing, onCreateMap: nothing, onOpenAssetManager: nothing })));
    await expect.poll(() => document.querySelector('.recent-empty')).not.toBeNull();
  }

  // Both sidebars open leave a tab between a third and two thirds of the window
  it.each([480, 620, 760, 900, 1040, 1200])('keeps every tile beside or above the recent scenes at %i px', async (width) => {
    await open(width);
    const recent = rect('.dashboard-recent');
    const frame = rect('.dashboard-container');
    for (const card of cards()) {
      const beside = card.right <= recent.left + 0.5;
      const above = card.bottom <= recent.top + 0.5;
      expect(beside || above, `a tile ends at ${card.right}, the recent scenes begin at ${recent.left}`).toBe(true);
      expect(card.right).toBeLessThanOrEqual(frame.right + 0.5);
    }
    expect(leaf.scrollWidth).toBeLessThanOrEqual(leaf.clientWidth);
  });

  it('stacks the columns by the width of the tab, not of the window', async () => {
    await open(760);
    expect(rect('.dashboard-recent').top).toBeGreaterThanOrEqual(rect('.dashboard-actions').bottom);
    expect(rect('.dashboard-recent').width).toBeCloseTo(rect('.dashboard-actions').width, 0);
  });
});
