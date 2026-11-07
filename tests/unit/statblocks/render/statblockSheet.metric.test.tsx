// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';


import type { MetricBlock, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

afterEach(cleanup);

const FIELDS: TemplateField[] = [
  { key: 'major', label: 'Major', type: 'number' },
  { key: 'severe', label: 'Severe', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'number', unit: 'ft.' },
];

const metric = (fields: string[], heading = 'Damage thresholds'): MetricBlock => ({ id: 'metric01', type: 'metric', heading, fields });

/** Each number as the card shows it: its name and its value. */
function numbers(container: HTMLElement): Array<[string, string]> {
  return [...blockEl(container, 'metric01')!.querySelectorAll('.atlas-sb-metric__number')].map((number) => [
    number.querySelector('.atlas-sb-label')?.textContent ?? '',
    number.querySelector('.atlas-sb-metric__value')?.textContent ?? '',
  ]);
}

const heading = (container: HTMLElement): string | null => blockEl(container, 'metric01')!.querySelector('.atlas-sb-metric__heading')?.textContent ?? null;

describe('StatblockSheet: a Metric', () => {
  it('shows each number\'s name over its value in one box, the group\'s name over two or more', () => {
    const { container } = renderSheet(templateOf(FIELDS, [metric(['major', 'severe', 'speed'])]), { major: 8, severe: 15, speed: 30 });
    const frame = blockEl(container, 'metric01')!;
    expect(frame.querySelectorAll('.atlas-sb-metric')).toHaveLength(1);
    expect(heading(container)).toBe('Damage thresholds');
    expect(numbers(container)).toEqual([['Major', '8'], ['Severe', '15'], ['Speed', '30 ft.']]);
    expect(frame.style.getPropertyValue('--atlas-sb-metric-numbers')).toBe('3');
    expect(frame.dataset.type).toBe('table');
  });

  it('shows no group name over a single number, nor an empty one', () => {
    const one = renderSheet(templateOf(FIELDS, [metric(['major'])]), { major: 8 });
    expect(heading(one.container)).toBeNull();
    expect(numbers(one.container)).toEqual([['Major', '8']]);
    cleanup();
    const unnamed = renderSheet(templateOf(FIELDS, [metric(['major', 'severe'], '  ')]), { major: 8, severe: 15 });
    expect(heading(unnamed.container)).toBeNull();
  });

  it('offers a group name to fill in while editing two or more numbers, faint, and none over one', () => {
    const { container } = renderSheet(templateOf(FIELDS, [metric(['major', 'severe'], '')]), {}, { mode: 'editing' });
    const shown = blockEl(container, 'metric01')!.querySelector('.atlas-sb-metric__heading');
    expect(shown?.textContent).toBe('Group name');
    expect(shown?.classList.contains('atlas-sb-prompt')).toBe(true);
    cleanup();
    const one = renderSheet(templateOf(FIELDS, [metric(['major'], '')]), {}, { mode: 'editing' });
    expect(heading(one.container)).toBeNull();
  });

  it('shows a dash for an empty number, and nothing where every number is empty', () => {
    const { container } = renderSheet(templateOf(FIELDS, [metric(['major', 'severe'])]), { major: 8 });
    expect(numbers(container)).toEqual([['Major', '8'], ['Severe', '–']]);
    cleanup();
    const empty = renderSheet(templateOf(FIELDS, [metric(['major', 'severe'])]), {});
    expect(blockEl(empty.container, 'metric01')).toBeNull();
  });

  it('leaves out numbers not named yet where a statblock is read, and shows them while editing', () => {
    const view = renderSheet(templateOf(FIELDS, [metric(['major', ''])]), { major: 8 });
    expect(numbers(view.container)).toEqual([['Major', '8']]);
    expect(heading(view.container)).toBeNull();
    cleanup();
    const editing = renderSheet(templateOf(FIELDS, [metric(['major', ''])]), { major: 8 }, { mode: 'editing' });
    expect(numbers(editing.container)).toEqual([['Major', '8'], ['Number', '–']]);
    expect(heading(editing.container)).toBe('Damage thresholds');
  });

  it('prompts for each empty number while editing, as a Value prompts', () => {
    const { container } = renderSheet(templateOf(FIELDS, [metric(['major', 'severe'])]), {}, { mode: 'editing' });
    expect(numbers(container)).toEqual([['Major', 'Add major'], ['Severe', 'Add severe']]);
    expect(blockEl(container, 'metric01')!.querySelectorAll('.atlas-sb-metric__value .atlas-sb-prompt')).toHaveLength(2);
  });

  it('takes its share of a row by its numbers', () => {
    const row: TemplateBlock = { id: 'row00001', type: 'row', blocks: [metric(['major', 'severe']), { id: 'stat0001', type: 'stat', field: 'speed', look: 'stacked' }] };
    const { container } = renderSheet(templateOf(FIELDS, [row]), { major: 8, severe: 15, speed: 30 });
    expect(blockEl(container, 'metric01')!.style.getPropertyValue('--atlas-sb-metric-numbers')).toBe('2');
    expect(blockEl(container, 'stat0001')!.hasAttribute('style')).toBe(false);
  });
});
