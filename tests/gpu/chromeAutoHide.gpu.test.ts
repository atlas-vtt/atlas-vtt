import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import autoHideCss from '../../src/app/react/components/chrome-auto-hide/chrome-auto-hide.scss?inline';
import switcherCss from '../../src/app/react/components/levels/level-switcher.scss?inline';

/** The map's bars as `UIRoot` lays them out, with "Show toolbar on hover" on, styled by the real stylesheets. */
const MAP_UI = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" data-chrome-auto-hide style="position: relative; width: 100%; height: 100%">
      <div class="atlas-bottom-toolbar-row">
        <div class="atlas-bottom-toolbar-row__lead"></div>
        <div class="atlas-bottom-toolbar-row__start"><button style="width: 80px; height: 48px; pointer-events: auto">undo</button></div>
        <div class="atlas-vtt-toolbar atlas-main-toolbar" style="width: 300px; height: 48px"><button aria-expanded="false">dice</button><div class="atlas-dropdown-menu" data-state="closed"></div></div>
        <div class="atlas-bottom-toolbar-row__end"></div>
        <div class="atlas-bottom-toolbar-row__options"><div class="atlas-tool-bar" style="width: 200px; height: 40px"><div class="atlas-dropdown-menu" data-state="closed"></div></div></div>
      </div>
      <div class="atlas-level-switcher"><div class="atlas-level-switcher__level">Ground</div></div>
    </div>
  </div>
`;

const settle = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const shown = (selector: string): boolean => {
  const style = getComputedStyle(element(selector));
  return style.visibility === 'visible' && Number(style.opacity) > 0.99;
};

describe('bars that show on hover', () => {
  const styles = [css, switcherCss, autoHideCss].map((text) => {
    const style = document.createElement('style');
    style.textContent = text;
    return style;
  });
  const leaf = document.createElement('div');
  leaf.style.cssText = 'position: relative; width: 900px; height: 600px; contain: strict';

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(...styles);
    document.body.append(leaf);
    leaf.innerHTML = MAP_UI;
    await settle(500);
  });

  afterEach(() => {
    leaf.remove();
    for (const style of styles) style.remove();
  });

  it('hides every bar away from the pointer, out of reach of clicks', () => {
    for (const selector of ['.atlas-main-toolbar', '.atlas-bottom-toolbar-row__start', '.atlas-level-switcher']) {
      expect(shown(selector)).toBe(false);
      expect(getComputedStyle(element(selector)).visibility).toBe('hidden');
    }
    const undo = element('.atlas-bottom-toolbar-row__start button').getBoundingClientRect();
    expect(document.elementFromPoint(undo.x + 10, undo.y + 10)?.textContent).not.toBe('undo');
  });

  it('shows a bar near the pointer quickly, and only that one', async () => {
    element('.atlas-main-toolbar').toggleAttribute('data-near', true);
    await settle(160);
    expect(Number(getComputedStyle(element('.atlas-main-toolbar')).opacity)).toBeGreaterThan(0.95);
    await settle(300);
    expect(shown('.atlas-main-toolbar')).toBe(true);
    expect(shown('.atlas-level-switcher')).toBe(false);
  });

  it('keeps a bar whose menu is open', async () => {
    element('.atlas-main-toolbar button').setAttribute('aria-expanded', 'true');
    await settle(500);
    expect(shown('.atlas-main-toolbar')).toBe(true);
  });

  it('hides a bar the pointer left within half a second', async () => {
    const bar = element('.atlas-level-switcher');
    bar.toggleAttribute('data-near', true);
    await settle(450);
    expect(shown('.atlas-level-switcher')).toBe(true);
    bar.toggleAttribute('data-near', false);
    await settle(450);
    expect(getComputedStyle(bar).visibility).toBe('hidden');
  });

  it('shows the toolbar alone while the tool just changed', async () => {
    element('.atlas-main-toolbar').toggleAttribute('data-peek', true);
    await settle(450);
    expect(shown('.atlas-main-toolbar')).toBe(true);
    expect(shown('.atlas-bottom-toolbar-row__start')).toBe(false);
  });

  it('keeps the toolbar while a tool menu is open, and the tool bars with it', async () => {
    element('.atlas-main-toolbar .atlas-dropdown-menu').dataset.state = 'open';
    await settle(500);
    expect(shown('.atlas-main-toolbar')).toBe(true);
    expect(shown('.atlas-bottom-toolbar-row__options')).toBe(true);
    expect(shown('.atlas-bottom-toolbar-row__start')).toBe(false);
  });

  it('keeps the toolbar while a menu of the tool bars is open', async () => {
    element('.atlas-bottom-toolbar-row__options .atlas-dropdown-menu').dataset.state = 'open';
    await settle(500);
    expect(shown('.atlas-main-toolbar')).toBe(true);
    expect(shown('.atlas-bottom-toolbar-row__options')).toBe(true);
  });

  it('hides them again once the menu closes', async () => {
    const menu = element('.atlas-main-toolbar .atlas-dropdown-menu');
    menu.dataset.state = 'open';
    await settle(450);
    menu.dataset.state = 'closed';
    await settle(450);
    expect(getComputedStyle(element('.atlas-main-toolbar')).visibility).toBe('hidden');
  });
});
