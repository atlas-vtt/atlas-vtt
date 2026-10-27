import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import switcherCss from '../../src/app/react/components/levels/level-switcher.scss?inline';

/**
 * The map UI as `UIRoot` lays it out, reduced to what decides the stacking: the main toolbar's
 * row, which holds the toolbar's overlays (the asset manager and with it the map creator and the
 * New scene dialog, the command palette), and the level switcher after it, at the map's left edge.
 * Styled by the plugin's real stylesheets.
 */
const MAP_UI = (overlay: string): string => `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0; z-index: 1000">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-scene-tab-bar" style="width: 200px; height: 39px; pointer-events: auto"></div>
      </div>
      <div class="atlas-bottom-toolbar-row">
        <div class="atlas-vtt-toolbar" style="width: 300px; height: 48px"></div>
        ${overlay}
      </div>
      <div class="atlas-level-switcher"><div class="atlas-level-switcher__level">Ground</div></div>
    </div>
  </div>
`;

const ASSET_MANAGER = `
  <div class="atlas-asset-manager-modal">
    <div class="atlas-asset-manager-backdrop"></div>
    <div class="atlas-asset-manager-window"></div>
  </div>
`;

const COMMAND_PALETTE = '<div class="atlas-command-palette-overlay"></div>';

/** The element drawn on top at the middle of `selector`'s box. */
function onTopOf(selector: string): Element | null {
  const box = document.querySelector(selector)!.getBoundingClientRect();
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
}

describe('the layer of the level switcher', () => {
  const styles = [css, switcherCss].map((text) => {
    const style = document.createElement('style');
    style.textContent = text;
    return style;
  });
  // Obsidian's workspace leaf: it holds the view's fixed elements and their stacking.
  const leaf = document.createElement('div');
  leaf.style.cssText = 'position: relative; width: 900px; height: 600px; contain: strict';

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(...styles);
    document.body.append(leaf);
  });

  afterEach(() => {
    leaf.remove();
    for (const style of styles) style.remove();
  });

  it('stands on the map, beside the toolbar', () => {
    leaf.innerHTML = MAP_UI('');

    expect(onTopOf('.atlas-level-switcher__level')?.className).toBe('atlas-level-switcher__level');
  });

  it.each([
    ['the asset manager', ASSET_MANAGER, 'atlas-asset-manager-window'],
    ['the command palette', COMMAND_PALETTE, 'atlas-command-palette-overlay'],
  ])('lies below %s', (_name, overlay, onTop) => {
    leaf.innerHTML = MAP_UI(overlay);

    expect(onTopOf('.atlas-level-switcher__level')?.className).toBe(onTop);
  });
});
