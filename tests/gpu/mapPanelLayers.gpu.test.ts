import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import initiativeCss from '../../src/app/react/components/initiative-tracker.scss?inline';

/**
 * A map view as Obsidian and `UIRoot` lay it out, reduced to what decides the stacking: the bars
 * of the map, the toolbar row with the command palette in it, and a floating panel over all of
 * them. Styled by the plugin's real stylesheets.
 */
const MAP_VIEW = (row: string): string => `
  <div class="workspace-leaf-content atlas-vtt-plugin atlas-vtt-view" data-type="atlas-vtt" style="width: 900px; height: 600px">
    <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0; z-index: 1000">
      <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
        <div class="atlas-top-bar-row">
          <div class="atlas-top-bar-start"><div class="atlas-scene-tab-bar" style="width: 400px; height: 39px; pointer-events: auto"></div></div>
          <div class="atlas-top-bar-end"><div class="atlas-widget-bar" style="width: 300px; height: 60px; pointer-events: auto"></div></div>
        </div>
        <div class="atlas-bottom-toolbar-row">
          <div class="atlas-vtt-toolbar atlas-main-toolbar" style="width: 300px; height: 48px">${row}</div>
        </div>
        <div class="atlas-initiative-tracker" style="position: absolute; top: 100px; right: 8px; width: 200px; height: 300px"></div>
        <div class="atlas-docs-panel" style="left: 0; top: 0; width: 900px; height: 600px"></div>
      </div>
    </div>
  </div>
`;

const PALETTE = '<div class="atlas-command-palette-overlay"><div class="palette-pane" style="position: absolute; inset: 100px"></div></div>';
const OPEN_MENU = '<div class="atlas-dropdown-menu" data-state="open"><div class="menu-pane" style="position: fixed; left: 300px; top: 300px; width: 200px; height: 200px"></div></div>';

/** The class of the element drawn on top at the middle of `selector`'s box. */
function onTopOf(selector: string): string | undefined {
  const box = document.querySelector(selector)!.getBoundingClientRect();
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.className;
}

describe('the floating panels of a map view', () => {
  const styles = [css, initiativeCss].map((text) => {
    const style = document.createElement('style');
    style.textContent = text;
    return style;
  });
  const host = document.createElement('div');
  host.style.cssText = 'position: relative; width: 900px; height: 600px; contain: strict';

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(...styles);
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    for (const style of styles) style.remove();
  });

  it('stand over the scene tabs, the widgets, the initiative tracker and the toolbar', () => {
    host.innerHTML = MAP_VIEW('');
    for (const bar of ['.atlas-scene-tab-bar', '.atlas-widget-bar', '.atlas-initiative-tracker', '.atlas-main-toolbar']) {
      expect(onTopOf(bar), bar).toContain('atlas-docs-panel');
    }
  });

  it('stand over the command palette', () => {
    host.innerHTML = MAP_VIEW(PALETTE);
    expect(onTopOf('.palette-pane')).toContain('atlas-docs-panel');
  });

  it('let a menu open from the toolbar stand over them', () => {
    host.innerHTML = MAP_VIEW(OPEN_MENU);
    expect(onTopOf('.menu-pane')).toBe('menu-pane');
  });

  it('never let a focus scroll the view sideways', () => {
    host.innerHTML = MAP_VIEW('');
    const view = host.querySelector<HTMLElement>('.atlas-vtt-view')!;
    const poking = document.createElement('button');
    poking.style.cssText = 'position: absolute; left: 1200px; top: 10px; width: 40px; height: 40px';
    view.append(poking);
    poking.focus();
    view.scrollLeft = 200;
    expect(view.scrollLeft).toBe(0);
  });
});
