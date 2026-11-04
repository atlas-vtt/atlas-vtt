import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';

/**
 * The map UI as `UIRoot` lays it out, reduced to what decides the stacking:
 * the top bar row with the dice rolls at its right end, and the DM
 * screen over the whole view. Styled by the plugin's real stylesheet.
 */
const MAP_UI = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0; z-index: 1000">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-scene-tab-bar" style="width: 200px; height: 39px; pointer-events: auto"></div>
        <div class="atlas-top-bar-end">
          <div class="atlas-widget-bar" style="width: 120px; height: 44px"></div>
          <div class="atlas-dice-rolls atlas-vtt-plugin">
            <div class="atlas-dice-roll"><div class="atlas-dice-roll__sheet" style="height: 200px"></div></div>
          </div>
        </div>
      </div>
      <div class="atlas-dm-screen-wrapper"><div class="atlas-dm-screen-backdrop" style="pointer-events: auto"></div></div>
    </div>
  </div>
`;

function boxOf(selector: string): DOMRect {
  return document.querySelector(selector)!.getBoundingClientRect();
}

/** The element drawn on top at the middle of `selector`'s box. */
function onTopOf(selector: string): Element | null {
  const box = boxOf(selector);
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
}

describe('the layer of the dice rolls', () => {
  const style = document.createElement('style');
  style.textContent = css;
  // Obsidian's workspace leaf: it holds the view's fixed elements and their stacking.
  const leaf = document.createElement('div');
  leaf.style.cssText = 'position: relative; width: 900px; height: 600px; contain: strict';

  beforeEach(async () => {
    // Room for the whole leaf: nothing is on top of a point outside the viewport.
    await page.viewport(1000, 700);
    document.head.append(style);
    leaf.innerHTML = MAP_UI;
    document.body.append(leaf);
  });

  afterEach(() => {
    leaf.remove();
    style.remove();
  });

  it('shows a roll above the DM screen and the widgets, and the scene tabs below the DM screen', () => {
    expect(onTopOf('.atlas-dice-roll__sheet')?.className).toBe('atlas-dice-roll__sheet');
    expect(onTopOf('.atlas-scene-tab-bar')?.className).toBe('atlas-dm-screen-backdrop');
    expect(onTopOf('.atlas-widget-bar')?.className).toBe('atlas-dice-roll__sheet');
  });

  it('keeps the bars in the corners of the view and lays the rolls in the top right corner, over the widgets', () => {
    const view = leaf.getBoundingClientRect();
    const inset = 8;
    expect(boxOf('.atlas-scene-tab-bar').left).toBe(view.left + inset);
    expect(boxOf('.atlas-scene-tab-bar').top).toBe(view.top + inset);
    expect(boxOf('.atlas-widget-bar').right).toBe(view.right - inset);
    expect(boxOf('.atlas-widget-bar').top).toBe(view.top + inset);
    expect(boxOf('.atlas-dice-rolls').right).toBe(view.right - inset);
    expect(boxOf('.atlas-dice-rolls').top).toBe(view.top + inset);
  });
});
