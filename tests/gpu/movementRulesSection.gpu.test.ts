import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { DEFAULT_GRID_DEFAULTS } from '../../src/app/gameSystems/systemRules';
import type { MovementRules } from '../../src/app/measure/movementRules';
import { GridMeasurementTab } from '../../src/app/react/components/collection-settings/GridMeasurementTab';
import { SettingsContent } from '../../src/app/react/components/collection-settings/SettingsContent';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';

/**
 * The Movement group of the Grid and measure tab as the collection settings dialog shows it,
 * styled by the plugin's real stylesheet. The variables stand in for Obsidian's theme.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --mono-100: #fff;
    --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px;
    --corner-shape: squircle; }
  button, input { corner-shape: var(--corner-shape); font: inherit; }
  button { height: 30px; }
`;
const TWO_STEPS: MovementRules = {
  steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }, { name: 'Dash', multiple: 2, color: '#f59e0b' }],
  countPerTurn: true,
};
const h = React.createElement;

function Dialog({ initial }: { initial: MovementRules }): React.ReactElement {
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(structuredClone(DEFAULT_GRID_DEFAULTS));
  const [movement, setMovement] = useState(initial);
  return h('div', { className: 'atlas-vtt-plugin' },
    h('div', { className: 'atlas-collection-settings-modal' },
      h('div', { className: 'atlas-collection-settings-header' }, h('h3', null, 'Collection Settings')),
      h('div', { className: 'atlas-collection-settings-body' },
        h('div', { className: 'atlas-collection-settings-sidebar' }),
        h(SettingsContent, null,
          h(GridMeasurementTab, { gridDefaults, onChange: setGridDefaults, movement, onMovementChange: setMovement }))),
      h('div', { className: 'atlas-collection-settings-footer' }, h('button', null, 'Cancel'), h('button', null, 'Save'))));
}

const section = (): HTMLElement => document.querySelector<HTMLElement>('[aria-labelledby="atlas-csm-movement-title"]')!;
const rows = (): HTMLElement[] => [...section().querySelectorAll<HTMLElement>('.atlas-csm-step-row')];
/** Where an element lies in the tab's own page, however far the dialog has scrolled it. */
const box = (element: Element): number[] => {
  const { left, top, width, height } = element.getBoundingClientRect();
  const scrolled = document.querySelector('.atlas-collection-settings-content')!.scrollTop;
  return [left, top + scrolled, width, height].map((value) => Math.round(value * 2) / 2);
};
/** Where everything of the tab lies but the colours that hang over it, and the dots, which grow under the pointer without taking room. */
const layout = (): number[][] => shown([...document.querySelectorAll('.atlas-collection-settings-content *')]
  .filter((element) => !element.closest('.atlas-csm-step-colour__colours, .atlas-csm-step-colour__dot')));
/** The boxes of the elements that take room: a tooltip's hidden name has none. */
function shown(elements: Element[]): number[][] {
  return elements.map(box).filter(([, , width, height]) => width! > 0 || height! > 0);
}

describe('the Movement group of the Grid and measure tab', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(900, 1100);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('lays a step out in one row: its colour, its name, how many times the speed, and its remove button', () => {
    render(h(Dialog, { initial: TWO_STEPS }));
    expect(rows()).toHaveLength(2);
    for (const row of rows()) {
      const [dot, name, times, remove] = [
        row.querySelector('.atlas-csm-step-colour__dot')!, row.querySelector('input[type="text"]')!,
        row.querySelector('input[type="number"]')!, row.querySelector('.atlas-csm-band-delete')!,
      ].map((part) => part.getBoundingClientRect());
      const middle = (rect: DOMRect): number => rect.top + rect.height / 2;
      for (const part of [name!, times!, remove!]) expect(Math.abs(middle(part) - middle(dot!))).toBeLessThan(1);
      expect(dot!.width).toBe(20);
      expect(dot!.height).toBe(20);
      expect(dot!.right).toBeLessThan(name!.left);
      expect(name!.right).toBeLessThan(times!.left);
      expect(times!.right).toBeLessThan(remove!.left);
      expect(name!.width).toBeGreaterThan(200);
      expect(remove!.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
    }
  });

  it('opens a step\'s colours over the page: nothing of the tab moves, and all twenty lie inside the dialog', async () => {
    render(h(Dialog, { initial: TWO_STEPS }));
    const content = document.querySelector('.atlas-collection-settings-content')!;
    const before = { layout: layout(), scroll: content.scrollHeight };
    await userEvent.click(page.getByRole('button', { name: 'Colour of Move' }));
    const colours = section().querySelector('.atlas-csm-step-colour__colours')!;
    expect(layout()).toEqual(before.layout);
    expect(content.scrollHeight).toBe(before.scroll);
    const swatches = [...colours.querySelectorAll('.atlas-swatch')].map((swatch) => swatch.getBoundingClientRect());
    expect(swatches).toHaveLength(20);
    const frame = colours.getBoundingClientRect();
    const dialog = document.querySelector('.atlas-collection-settings-modal')!.getBoundingClientRect();
    for (const swatch of swatches) {
      expect(swatch.width).toBeCloseTo(24, 0);
      expect(swatch.height).toBeCloseTo(swatch.width, 0);
      expect(swatch.left).toBeGreaterThanOrEqual(frame.left);
      expect(swatch.right).toBeLessThanOrEqual(frame.right);
    }
    // Inside the page of the dialog, which cuts what hangs past it: above the dot where the page ends too soon below.
    const seen = content.getBoundingClientRect();
    expect(frame.left).toBeGreaterThanOrEqual(dialog.left);
    expect(frame.right).toBeLessThanOrEqual(dialog.right);
    expect(frame.top).toBeGreaterThanOrEqual(seen.top);
    expect(frame.bottom).toBeLessThanOrEqual(seen.bottom);
    const dot = rows()[0]!.querySelector('.atlas-csm-step-colour__dot')!.getBoundingClientRect();
    expect(Math.min(Math.abs(frame.top - dot.bottom), Math.abs(dot.top - frame.bottom))).toBeCloseTo(8, 0);
    expect(frame.left).toBeCloseTo(dot.left, 0);
    const under = document.elementFromPoint(frame.left + frame.width / 2, frame.top + frame.height / 2);
    expect(colours.contains(under)).toBe(true);

    await userEvent.click(page.getByRole('button', { name: 'Orange' }));
    expect(section().querySelector('.atlas-csm-step-colour__colours')).toBeNull();
    expect(getComputedStyle(rows()[0]!.querySelector('.atlas-csm-step-colour__dot')!).backgroundColor).toBe('rgb(249, 115, 22)');
    expect(layout()).toEqual(before.layout);
  });

  it('closes the colours on Escape and leaves the key to nobody else', async () => {
    render(h(Dialog, { initial: TWO_STEPS }));
    let reachedDialog = 0;
    const listen = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !event.defaultPrevented) reachedDialog++; };
    document.addEventListener('keydown', listen);
    await userEvent.click(page.getByRole('button', { name: 'Colour of Dash' }));
    expect(section().querySelector('.atlas-csm-step-colour__colours')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(section().querySelector('.atlas-csm-step-colour__colours')).toBeNull();
    expect(reachedDialog).toBe(0);
    document.removeEventListener('keydown', listen);
  });

  it('offers no fifth step, and keeps the switch and the rows above where they are as steps come', async () => {
    render(h(Dialog, { initial: { steps: [], countPerTurn: false } }));
    expect(section().textContent).toContain('No steps');
    const add = page.getByRole('button', { name: 'Add step' });
    const above = (): number[][] => shown([...document.querySelectorAll('[aria-labelledby="atlas-csm-grid-title"] *')]);
    const before = above();
    for (let step = 1; step <= 4; step++) {
      await userEvent.click(add);
      expect(rows()).toHaveLength(step);
      // The step just added is named next.
      expect(document.activeElement).toBe(rows()[step - 1]!.querySelector('input[type="text"]'));
    }
    expect((add.element() as HTMLButtonElement).disabled).toBe(true);
    expect(rows().map((row) => (row.querySelector('input[type="number"]') as HTMLInputElement).value)).toEqual(['1', '2', '3', '4']);
    expect(above()).toEqual(before);
    // Four steps without a name cannot be saved, which the group says.
    expect(section().querySelector('[role="alert"]')).not.toBeNull();
  });
});
