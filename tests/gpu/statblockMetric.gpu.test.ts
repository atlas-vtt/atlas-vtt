import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { TEMPLATE_FORMAT, type MetricBlock, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';

// Dice links reach the map view, whose services need Node's `events`; nothing here rolls dice.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px;
  --font-ui-small: 13px; --font-ui-large: 20px; --font-semibold: 600; --font-bold: 700; --line-height-tight: 1.2; --radius-m: 8px;
  --background-modifier-border: rgb(120, 120, 120); }`;

const metric = (id: string, fields: string[], heading?: string): MetricBlock => ({ id, type: 'metric', fields, ...(heading && { heading }) });

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'metric-values-abc123',
  fields: ['difficulty', 'major', 'severe', 'hp', 'stress', 'armor'].map((key) => ({ key, label: key[0]!.toUpperCase() + key.slice(1), type: 'number' })),
  layout: {
    maxColumns: 1,
    blocks: [
      metric('strip000', ['difficulty', 'major', 'severe', 'hp'], 'Damage thresholds'),
      { id: 'pair0000', type: 'row', blocks: [metric('two00000', ['major', 'severe']), metric('one00000', ['armor'])] },
      metric('stress00', ['stress']),
    ],
  },
};

const FIELDS = { difficulty: 14, major: 8, severe: 15, hp: 6, stress: 3, armor: 2 };

function frame(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!element) throw new Error(`No block ${id}`);
  return element;
}

const box = (id: string): HTMLElement => frame(id).querySelector<HTMLElement>('.atlas-sb-metric')!;
const numbers = (id: string): HTMLElement[] => [...frame(id).querySelectorAll<HTMLElement>('.atlas-sb-metric__number')];

/**
 * A Metric (a stat block's key numbers: thresholds, an ability strip): its
 * numbers in equal columns inside one box with one rule between two, and side
 * by side its share of the row growing with its numbers.
 */
describe('a Metric in the real stylesheet', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
    render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380, padding: 16 } },
      React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Metric', fields: FIELDS, variant: 'feed' })));
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('sets its numbers in equal columns inside one box, a single rule between two', () => {
    const outer = box('strip000').getBoundingClientRect();
    const cells = numbers('strip000');
    const rects = cells.map((cell) => cell.getBoundingClientRect());
    expect(getComputedStyle(box('strip000')).borderTopWidth).toBe('1px');
    expect(getComputedStyle(box('strip000')).borderTopLeftRadius).toBe('8px');
    expect(rects[0]!.left).toBeCloseTo(outer.left + 1 + 8, 0);
    expect(rects[3]!.right).toBeCloseTo(outer.right - 1 - 8, 0);
    for (let index = 1; index < rects.length; index++) {
      expect(rects[index]!.left, `number ${index} follows its neighbour`).toBeCloseTo(rects[index - 1]!.right, 0);
      expect(rects[index]!.top).toBeCloseTo(rects[0]!.top, 0);
      expect(Math.abs(rects[index]!.width - rects[0]!.width), `number ${index} is as wide as the first`).toBeLessThanOrEqual(1);
      expect(getComputedStyle(cells[index]!).borderLeftWidth).toBe('1px');
    }
    expect(getComputedStyle(cells[0]!).borderLeftWidth).toBe('0px');
    for (const rect of rects) expect(rect.bottom).toBeLessThanOrEqual(outer.bottom - 1 - 8 + 0.5);
  });

  it('heads the group over its numbers, padding equal to the gap, each name small over a large number', () => {
    const outer = box('strip000').getBoundingClientRect();
    const heading = frame('strip000').querySelector<HTMLElement>('.atlas-sb-metric__heading')!;
    expect(heading.textContent).toBe('Damage thresholds');
    const top = heading.getBoundingClientRect();
    expect(top.top - outer.top - 1).toBeCloseTo(8, 0);
    expect(numbers('strip000')[0]!.getBoundingClientRect().top - top.bottom).toBeCloseTo(8, 0);
    expect(Math.abs((top.left + top.right) / 2 - (outer.left + outer.right) / 2)).toBeLessThanOrEqual(1);

    const alone = numbers('stress00')[0]!;
    const label = alone.querySelector<HTMLElement>('.atlas-sb-label')!;
    const value = alone.querySelector<HTMLElement>('.atlas-sb-value')!;
    expect(frame('stress00').querySelector('.atlas-sb-metric__heading')).toBeNull();
    expect([label.textContent, value.textContent]).toEqual(['Stress', '3']);
    expect(parseFloat(getComputedStyle(value).fontSize)).toBeGreaterThan(parseFloat(getComputedStyle(label).fontSize) * 1.5);
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(value.getBoundingClientRect().top + 1);
  });

  it('takes a share of a row that grows with its numbers: two numbers twice the room of one', () => {
    const two = frame('two00000').getBoundingClientRect();
    const one = frame('one00000').getBoundingClientRect();
    expect(two.width / one.width).toBeCloseTo(2, 1);
    expect(two.top).toBeCloseTo(one.top, 0);
    expect(two.height).toBeCloseTo(one.height, 0);
    expect(box('two00000').getBoundingClientRect().height).toBeCloseTo(two.height, 0);
  });
});
