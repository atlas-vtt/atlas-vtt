import '../setup/obsidianDom';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withDynamicLighting } from '../mocks/experimentalFeatures';
import { HP, STR } from '../mocks/resourceFixtures';

/**
 * The Edit Token dialog as the map shows it, laid out by the plugin's real stylesheet. The
 * variables below stand in for Obsidian's theme: its sizes, radii and the height of a button.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --text-normal: #dadada; --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; --corner-shape: squircle; }
  button, input { corner-shape: var(--corner-shape); font: inherit; }
  button { height: 30px; }
`;
const TORCH = emissionOf(lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', ruleDistance: 5 }, Infinity).find((preset) => preset.id === 'torch')!);
/** A character with two resources and vision: an ordinary token of a party. */
const MIRABEL: Character = {
  id: 't', kind: 'character', name: 'Mirabel', imagePath: 'm.png', x: 0, y: 0,
  resources: { hp: { current: 6, max: 6 }, str: { current: 12, max: 12 } }, vision: { enabled: true, range: 60 },
};

const modal = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-edit-token-modal')!;
const body = (): HTMLElement => modal().querySelector<HTMLElement>('.atlas-modal-body')!;
const columns = (): DOMRect[] => [...modal().querySelectorAll('.atlas-edit-token__column')].map((column) => column.getBoundingClientRect());
const headings = (): HTMLElement[] => [...modal().querySelectorAll<HTMLElement>('h4')];

async function open(token: Character, width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  const { app } = createInMemoryApp({ files: {} });
  withDynamicLighting(app);
  const store = createViewAtlasStore(app, `edit-token-layout-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, [HP, STR]));
  // The name field takes the focus a moment after the dialog opens.
  await expect.poll(() => document.activeElement?.getAttribute('placeholder')).toBe('Token name');
}

/** Where a part of the dialog lies in it: from the dialog's own corner, so a dialog that moves as a whole leaves it unchanged. */
function placeInModal(element: Element): number[] {
  const frame = modal().getBoundingClientRect();
  const { left, top, width, height } = element.getBoundingClientRect();
  return [left - frame.left, top - frame.top, width, height].map(Math.round);
}

describe('the layout of the Edit Token dialog', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(() => {
    document.head.append(style);
  });

  afterEach(() => {
    const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Cancel');
    if (cancel) act(() => cancel.click());
    style.remove();
  });

  it('has two equal columns as far apart as they are from its edge: the token on the left, its light on the right', async () => {
    await open({ ...MIRABEL, light: TORCH }, 1280, 900);
    expect(Math.round(modal().getBoundingClientRect().width)).toBe(880);
    const [left, right] = columns();
    const frame = body().getBoundingClientRect();
    expect(left!.width).toBeCloseTo(right!.width, 0);
    expect(left!.top).toBeCloseTo(right!.top, 0);
    const padding = left!.left - frame.left;
    expect(padding).toBe(16);
    expect(right!.left - left!.right).toBeCloseTo(padding, 0);
    expect(frame.right - right!.right).toBeCloseTo(padding, 0);
    expect(headings().map((heading) => [heading.textContent, heading.getBoundingClientRect().left < right!.left ? 'left' : 'right']))
      .toEqual([['Token', 'left'], ['Resources', 'left'], ['Vision', 'left'], ['Carried light', 'right']]);
    // Every switch ends at its column's edge.
    for (const toggle of body().querySelectorAll('.atlas-toggle')) {
      const edge = toggle.getBoundingClientRect().right;
      expect(Math.min(Math.abs(edge - left!.right), Math.abs(edge - right!.right))).toBeLessThan(1);
    }
  });

  it('is tabbed through in the order it is read: down the left column, then down the right, then the footer', async () => {
    await open({ ...MIRABEL, light: TORCH }, 1280, 900);
    const [, right] = columns();
    const stops: DOMRect[] = [];
    const seen = new Set<Element>();
    while (document.activeElement && body().contains(document.activeElement) && !seen.has(document.activeElement)) {
      seen.add(document.activeElement);
      stops.push(document.activeElement.getBoundingClientRect());
      await userEvent.tab();
    }
    // Name, nameplate, two maxima with their reset buttons, vision, range with its reset, angle, add sense; then the light's switch and fields.
    expect(stops.length).toBeGreaterThan(20);
    expect(document.activeElement?.textContent).toBe('Cancel');
    const column = (stop: DOMRect): number => (stop.left < right!.left ? 0 : 1);
    const middle = (stop: DOMRect): number => stop.top + stop.height / 2;
    for (const [index, stop] of stops.slice(1).entries()) {
      const before = stops[index]!;
      const sameRow = Math.abs(middle(stop) - middle(before)) < 12;
      const onward = column(stop) > column(before) || (column(stop) === column(before) && (sameRow ? stop.left >= before.left : middle(stop) > middle(before)));
      expect(onward, `stop ${index + 1} at (${Math.round(stop.left)}, ${Math.round(stop.top)}) follows (${Math.round(before.left)}, ${Math.round(before.top)})`).toBe(true);
    }
  });

  it('becomes one column in a narrow window, in the order the columns are read', async () => {
    await open({ ...MIRABEL, light: TORCH }, 600, 900);
    const [first, second] = columns();
    expect(modal().getBoundingClientRect().width).toBeLessThan(720);
    expect(second!.left).toBeCloseTo(first!.left, 0);
    expect(second!.width).toBeCloseTo(first!.width, 0);
    expect(second!.top).toBeGreaterThan(first!.bottom);
    const tops = headings().map((heading) => heading.getBoundingClientRect().top + body().scrollTop);
    expect(headings().map((heading) => heading.textContent)).toEqual(['Token', 'Resources', 'Vision', 'Carried light']);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  });

  it('fits an ordinary window with a light switched on, and moves nothing in the left column when the light is switched', async () => {
    await open({ ...MIRABEL, light: TORCH }, 1280, 900);
    expect(body().scrollHeight).toBe(body().clientHeight);
    const left = modal().querySelector('.atlas-edit-token__column')!;
    const parts = (): number[][] => [...left.querySelectorAll('h4, input, .atlas-toggle, button')].map(placeInModal);
    const lit = { parts: parts(), size: placeInModal(modal()) };
    const carried = [...modal().querySelectorAll<HTMLElement>('[role="switch"]')].find((toggle) => toggle.getAttribute('aria-checked') === 'true' && !left.contains(toggle))!;
    act(() => carried.click());
    expect(modal().querySelector('.atlas-edit-token__light')).toBeNull();
    expect(parts()).toEqual(lit.parts);
    // This token's own column is the longer one: the dialog keeps its size, with the light or without.
    expect(placeInModal(modal())).toEqual(lit.size);
  });

  it('scrolls only its body in a window too low for it: the header and the footer stay', async () => {
    await open({ ...MIRABEL, light: TORCH }, 1280, 480);
    const frame = modal().getBoundingClientRect();
    expect(frame.height).toBeLessThanOrEqual(480 * 0.85 + 1);
    expect(body().scrollHeight).toBeGreaterThan(body().clientHeight);
    const header = modal().querySelector('.atlas-modal-header')!.getBoundingClientRect();
    const footer = modal().querySelector('.atlas-modal-footer')!.getBoundingClientRect();
    expect(header.top).toBeGreaterThanOrEqual(frame.top);
    expect(footer.bottom).toBeLessThanOrEqual(frame.bottom);
    expect(footer.bottom).toBeLessThanOrEqual(480);
    body().scrollTop = body().scrollHeight;
    expect(modal().querySelector('.atlas-modal-footer')!.getBoundingClientRect().bottom).toBe(footer.bottom);
  });
});
