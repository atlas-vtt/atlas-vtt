import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { ComboBox } from '../../src/app/packages/components/primitives/ComboBox';
import { Select } from '../../src/app/packages/components/primitives/Select';
import { THEME } from './sidePanesHarness';

/**
 * The combo box (a choice or typed text, the share dialog's game system) beside a select, with the real stylesheet:
 * it takes the select's look, so the field and its list must sit in the select's box and rows. Obsidian styles every
 * text input itself; the rule below stands in for that, so the field's own rules are tested against it.
 */
const OBSIDIAN_INPUT = `
  input[type='text'] { height: var(--input-height); padding: 4px 8px; border: 1px solid var(--background-modifier-border);
    border-radius: 4px; background: var(--background-modifier-form-field); box-shadow: inset 0 0 0 1px transparent; font-size: 14px; }
`;
const h = React.createElement;
const OPTIONS = [
  { value: 'cairn', label: 'Cairn' },
  { value: 'drawsteel', label: 'Draw Steel' },
  { value: 'shadowdark', label: 'Shadowdark' },
];

function Fields(): React.JSX.Element {
  const [chosen, setChosen] = useState('cairn');
  const [typed, setTyped] = useState('cairn');
  return h('div', { className: 'atlas-vtt-plugin', style: { width: 320, padding: 24, display: 'grid', gap: 120 } },
    h('span', { id: 'select-label' }, 'Select'),
    h('div', { 'data-testid': 'select' }, h(Select, { labelledBy: 'select-label', value: chosen, options: OPTIONS, onChange: setChosen })),
    h('span', { id: 'combo-label' }, 'Combo box'),
    h('div', { 'data-testid': 'combo' }, h(ComboBox, {
      labelledBy: 'combo-label', value: typed, options: OPTIONS, onChange: setTyped,
      matches: (option, text) => option.label.toLowerCase().includes(text.toLowerCase()), typedLabel: (text) => `Use “${text}”`,
    })));
}

/** An element's laid-out size, which the list's opening scale does not change. */
const box = (element: Element): number[] => [(element as HTMLElement).offsetWidth, (element as HTMLElement).offsetHeight];
const look = (element: Element): string[] => {
  const style = getComputedStyle(element);
  return [style.borderTopLeftRadius, style.borderTopWidth, style.backgroundColor, style.fontSize, style.paddingLeft];
};

describe('a combo box', () => {
  const style = document.createElement('style');
  style.textContent = THEME + OBSIDIAN_INPUT + css;
  beforeEach(async () => {
    await page.viewport(800, 900);
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  it("is a select's box: the field, its text and its list rows match the select's", async () => {
    render(h(Fields));
    const trigger = document.querySelector('[data-testid="select"] .atlas-select-trigger')!;
    const field = document.querySelector('[data-testid="combo"] .atlas-combobox-field')!;
    const input = field.querySelector('input')!;
    expect(box(field)).toEqual(box(trigger));
    expect(look(field)).toEqual(look(trigger));
    // The input draws nothing of its own, typed in or not: no box inside the field's box.
    const drawsNothing = (): void => {
      const own = getComputedStyle(input);
      expect([own.borderTopWidth, own.backgroundColor, own.boxShadow, own.outlineStyle]).toEqual(['0px', 'rgba(0, 0, 0, 0)', 'none', 'none']);
    };
    drawsNothing();
    input.focus();
    drawsNothing();
    input.blur();
    expect(Math.round(input.getBoundingClientRect().left)).toBe(Math.round(trigger.querySelector('.atlas-select-value')!.getBoundingClientRect().left));

    await userEvent.click(trigger);
    const selectRows = [...document.querySelectorAll('[data-testid="select"] [role="option"]')].map(box);
    await userEvent.click(document.body);
    await userEvent.click(input);
    const comboRows = [...document.querySelectorAll('[data-testid="combo"] [role="option"]')].map(box);
    expect(comboRows).toEqual(selectRows);
    if (import.meta.env.VITE_COMBO_LOOKS) await page.screenshot({ path: '__screenshots__/combo-box-open.png' });

    await userEvent.fill(input, 'Mothership');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="combo"] [role="option"]')];
    expect(rows.map((row) => row.textContent)).toEqual(['Use “Mothership”']);
    expect(box(rows[0]!)[1]).toBe(selectRows[0]![1]);
    if (import.meta.env.VITE_COMBO_LOOKS) await page.screenshot({ path: '__screenshots__/combo-box-typed.png' });
  });
});
