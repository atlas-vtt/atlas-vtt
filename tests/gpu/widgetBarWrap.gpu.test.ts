import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tabsCss from '../../src/app/react/components/scene-tab-bar.scss?inline';
import { DASHBOARD_THEME } from './dashboardTheme';

/**
 * Many widgets in a narrow view: the cards wrap into rows inside the view, right-aligned, and never
 * run past its edge or under the scene tabs; the dice rolls still hang below them. A few widgets keep
 * their row in the top right corner. The player window's bar wraps inside the window the same way.
 * Styled by the plugin's real stylesheet; screenshots in `__screenshots__`.
 */

const LABELS = ['Key cutter prog (STR)', 'Key cutter prog (DEX)', 'Key cutter prog (WIS)', 'Key cutter prog (CHA)', 'Key cutter prog (INT)',
  'Purple team respawn', 'White team respawn', 'Green team respawn', 'Red team respawn', 'Torches', 'Arrows left', 'Torch burns out'];

const card = (label: string, index: number): string => `
  <div class="atlas-widget atlas-widget-counter">
    <div class="atlas-widget-icon-wrapper"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg></div>
    <div class="atlas-widget-content">
      <div class="atlas-widget-value-row"><span class="atlas-widget-value">${index + 1}</span></div>
      <div class="atlas-widget-label"><span class="atlas-widget-label-text">${label}</span></div>
    </div>
  </div>`;

const bar = (count: number): string => `<div class="atlas-widget-bar active"><div class="atlas-widget-container">${LABELS.slice(0, count).map(card).join('')}</div></div>`;

/** The map UI as `UIRoot` lays it out: scene tabs and the widgets in the top bar row, rolls hanging below. */
const mapUi = (count: number): string => `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-scene-tab-bar">
          <div class="atlas-scene-tab-bar__strip">
            <div class="atlas-scene-tab atlas-scene-tab--active"><span class="atlas-scene-tab__name">Blue Mouth Caves</span></div>
            <div class="atlas-scene-tab atlas-scene-tab--loaded"><span class="atlas-scene-tab__name">The Citadel</span></div>
          </div>
          <button type="button" class="atlas-scene-tab atlas-scene-tab-bar__button atlas-scene-tab-bar__add">+</button>
        </div>
        <div class="atlas-top-bar-end">
          ${bar(count)}
          <div class="atlas-dice-rolls atlas-vtt-plugin"><div class="atlas-dice-roll"><div class="atlas-dice-roll__sheet" style="height: 120px"></div></div></div>
        </div>
      </div>
    </div>
  </div>`;

interface Box { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }

const boxOf = (element: Element): Box => element.getBoundingClientRect();
const boxesOf = (selector: string): Box[] => [...document.querySelectorAll(selector)].map(boxOf);
const query = (selector: string): Element => document.querySelector(selector)!;
const overlaps = (a: Box, b: Box): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const INSET = 8;

describe('a widget bar with many widgets', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css + tabsCss;
  const leaf = document.createElement('div');

  beforeEach(async () => {
    await page.viewport(1300, 800);
    document.head.append(style);
  });

  afterEach(() => {
    leaf.remove();
    style.remove();
    document.body.className = '';
  });

  /** A map view `width` wide holding `count` widgets. */
  function mount(width: number, count: number, theme: 'light' | 'dark'): Box {
    document.body.className = `theme-${theme}`;
    leaf.style.cssText = `position: relative; width: ${width}px; height: 700px; contain: strict`;
    leaf.innerHTML = mapUi(count);
    document.body.append(leaf);
    return boxOf(leaf);
  }

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1280, 640, 360]) {
      it(`keeps every card inside a view ${width} px wide and clear of the scene tabs (${theme})`, async () => {
        const view = mount(width, LABELS.length, theme);
        await page.screenshot({ path: `__screenshots__/atlas-widget-bar-many-${width}-${theme}.png`, element: leaf });
        const tabs = boxOf(query('.atlas-scene-tab-bar'));
        const cards = boxesOf('.atlas-widget');
        expect(cards).toHaveLength(LABELS.length);
        // Rows past half the view scroll: the scroller stands inside the view, and the wheel moves it.
        const rows = query('.atlas-widget-container') as HTMLElement;
        const shown = boxOf(rows);
        const padding = parseFloat(getComputedStyle(rows).paddingBottom);
        expect(shown.bottom - padding).toBeLessThanOrEqual(view.top + INSET + 0.5 * innerHeight + 0.5);
        if (rows.scrollHeight > rows.clientHeight + 1) {
          rows.scrollBy({ top: 100 });
          expect(rows.scrollTop).toBeGreaterThan(0);
          rows.scrollTo({ top: 0 });
        }
        for (const [index, box] of cards.entries()) {
          expect.soft(box.left, `card ${index}`).toBeGreaterThanOrEqual(view.left + INSET - 0.5);
          expect.soft(box.right, `card ${index}`).toBeLessThanOrEqual(view.right - INSET + 0.5);
          expect.soft(overlaps(box, tabs), `card ${index} under the tabs`).toBe(false);
        }
        // The rows stand right-aligned at the view's edge, the tabs in the left corner, the rolls below the rows.
        expect(Math.max(...cards.map((box) => box.right))).toBeCloseTo(view.right - INSET, 0);
        expect(tabs.left).toBeCloseTo(view.left + INSET, 0);
        expect(tabs.top).toBeCloseTo(view.top + INSET, 0);
        expect(Math.min(...cards.map((box) => box.top))).toBeCloseTo(view.top + INSET, 0);
        expect(boxOf(query('.atlas-dice-rolls')).top).toBeGreaterThanOrEqual(Math.min(shown.bottom - padding, Math.max(...cards.map((box) => box.bottom))) + INSET - 0.5);
      });
    }
  }

  it('keeps a few widgets in one row in the top right corner, beside the tabs', () => {
    const view = mount(1280, 2, 'dark');
    const row = boxOf(query('.atlas-widget-bar'));
    const cards = boxesOf('.atlas-widget');
    expect(row.right).toBeCloseTo(view.right - INSET, 0);
    expect(row.top).toBeCloseTo(view.top + INSET, 0);
    expect(cards[0]!.top).toBeCloseTo(cards[1]!.top, 0);
    expect(boxOf(query('.atlas-scene-tab-bar')).right).toBeLessThanOrEqual(row.left);
  });

  it('wraps the player window\'s cards inside the window', async () => {
    await page.viewport(640, 600);
    document.body.className = 'theme-dark';
    leaf.style.cssText = '';
    leaf.innerHTML = `<div class="atlas-vtt-plugin" id="atlas-player-widgets">${bar(LABELS.length)}</div>`;
    document.body.append(leaf);
    await page.screenshot({ path: '__screenshots__/atlas-widget-bar-player-window.png' });
    for (const [index, box] of boxesOf('.atlas-widget').entries()) {
      expect.soft(box.left, `card ${index}`).toBeGreaterThanOrEqual(INSET - 0.5);
      expect.soft(box.right, `card ${index}`).toBeLessThanOrEqual(640 - INSET + 0.5);
    }
  });
});
