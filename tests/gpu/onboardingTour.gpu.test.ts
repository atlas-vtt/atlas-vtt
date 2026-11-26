import '../setup/obsidianDom';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { SettingsService } from '../../src/app/services/SettingsService';
import { Tutorial } from '../../src/app/onboarding/Tutorial';
import { HotkeyHelp } from '../../src/app/keyboard/HotkeyHelp';
import { mapSteps } from '../../src/app/onboarding/MapTours';
import { DASHBOARD_THEME } from './dashboardTheme';

/**
 * The map tour's card and spotlight with the plugin's stylesheet, over a stand-in of the map's bottom row: the
 * spotlight rings its target, the card stands beside it on screen without covering it, and the step's keys and
 * buttons sit on one line each. Screenshots go to `__screenshots__/onboarding/`.
 */

const SHOT_DIR = '__screenshots__/onboarding';
const W = 1280;
const H = 800;

const settings = (): SettingsService => new SettingsService({ vault: { adapter: { exists: async () => true, write: async () => {} } } } as never);
const keys = (): string => 'G';

function mapChrome(): HTMLElement {
  const view = document.body.createDiv({ cls: 'atlas-vtt-plugin tour-map' });
  view.createDiv({ cls: 'atlas-scene-tab-bar tour-tabs' });
  const bar = view.createDiv({ cls: 'atlas-main-toolbar tour-toolbar' });
  for (const id of ['move', 'fog', 'draw', 'measure', 'assets', 'palette']) bar.createDiv({ cls: 'tour-tool', attr: { 'data-toolbar-item': id } });
  bar.createDiv({ cls: 'atlas-toolbar-end tour-tool' });
  view.createDiv({ cls: 'atlas-hotkey-help-bar tour-help' });
  return view;
}

const box = (selector: string): DOMRect => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`${selector} did not render`);
  return element.getBoundingClientRect();
};
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function settle(): Promise<void> {
  // The spotlight and card glide for 300 ms; wait them out.
  await new Promise((resolve) => setTimeout(resolve, 450));
}

describe('the map tour', () => {
  const style = document.createElement('style');
  style.textContent = `${DASHBOARD_THEME}${css}
    .tour-map { position: fixed; inset: 0; background: #2b2b2b; }
    .tour-tabs { position: absolute; left: 16px; top: 8px; width: 420px; height: 36px; }
    .tour-toolbar { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 8px; padding: 8px; }
    .tour-tool { width: 40px; height: 40px; }
    .tour-help { position: absolute; right: 16px; bottom: 16px; width: 56px; height: 56px; }`;
  let host: HTMLElement;
  let root: Root;
  let view: HTMLElement;

  beforeEach(async () => {
    await page.viewport(W, H);
    document.head.append(style);
    view = mapChrome();
    host = document.body.createDiv();
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    view.remove();
    style.remove();
    document.body.className = '';
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`points at each target without covering it (${theme})`, async () => {
      document.body.className = `theme-${theme}`;
      const steps = mapSteps(keys, false);
      act(() => root.render(React.createElement(Tutorial, { settings: settings(), id: 'map', steps, root: view, label: 'Your map' })));
      await settle();
      // The first step has no target: the card stands in the middle and the spotlight is shut.
      const first = box('.atlas-onboarding-card');
      expect(Math.abs(first.left + first.width / 2 - W / 2)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${SHOT_DIR}/welcome-${theme}.png` });

      for (let i = 1; i < steps.length; i++) {
        act(() => (document.querySelector('[data-autofocus]') as HTMLButtonElement).click());
        await settle();
        const target = box(steps[i]!.selector!);
        const ring = box('.atlas-onboarding-spotlight');
        const card = box('.atlas-onboarding-card');
        expect(ring.left).toBeLessThanOrEqual(target.left);
        expect(ring.right).toBeGreaterThanOrEqual(target.right);
        expect(ring.top).toBeLessThanOrEqual(target.top);
        expect(ring.bottom).toBeGreaterThanOrEqual(target.bottom);
        expect(overlaps(card, target)).toBe(false);
        expect(card.left).toBeGreaterThanOrEqual(0);
        expect(card.right).toBeLessThanOrEqual(W);
        expect(card.top).toBeGreaterThanOrEqual(0);
        expect(card.bottom).toBeLessThanOrEqual(H);
        // The buttons stand on one line.
        const actions = box('.atlas-onboarding-actions');
        expect(actions.height).toBeLessThan(48);
        await page.screenshot({ path: `${SHOT_DIR}/step-${i}-${theme}.png` });
      }
      // Keys stand as caps on one line under the text.
      const caps = Array.from(document.querySelectorAll('.atlas-onboarding-keys kbd'));
      expect(caps.length).toBeGreaterThan(0);
      expect(caps[0]!.getBoundingClientRect().height).toBeCloseTo(24, 0);
    });
  }

  it('offers the tour beside the shortcuts sheet\'s close button, on one line', async () => {
    document.body.className = 'theme-dark';
    act(() => root.render(React.createElement(HotkeyHelp, { settings: settings(), onClose: () => {}, onTour: () => {} })));
    await settle();
    await page.screenshot({ path: `${SHOT_DIR}/shortcuts-sheet.png`, element: document.querySelector('.atlas-cheat-sheet') as HTMLElement });
    const header = box('.atlas-cheat-sheet__header');
    const tour = box('.atlas-cheat-sheet__tour');
    const close = box('.atlas-cheat-sheet__header .atlas-close-btn');
    expect(Math.abs(tour.top + tour.height / 2 - (close.top + close.height / 2))).toBeLessThanOrEqual(1);
    expect(tour.right).toBeLessThanOrEqual(close.left);
    expect(header.height).toBeLessThan(64);
  });
});
