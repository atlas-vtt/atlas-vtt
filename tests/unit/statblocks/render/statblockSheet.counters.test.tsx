// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { CountersBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

const SLOTS: TemplateField = {
  key: 'slots', label: 'Spell slots', type: 'counters',
  counterRows: [{ name: '1st level', max: 0 }, { name: '2nd level', max: 0 }],
};
const BLOCK: CountersBlock = { id: 'slots001', type: 'counters', field: 'slots' };
const TEMPLATE = templateOf([SLOTS], [BLOCK]);

afterEach(cleanup);

const cells = (container: HTMLElement): HTMLElement[] => [...blockEl(container, 'slots001')?.querySelectorAll<HTMLElement>('.atlas-sb-counter') ?? []];

describe('a Counters block on the card', () => {
  it('draws a cell per row with uses, its name over its pips, left ones filled, and leaves out rows without uses', () => {
    const { container } = renderSheet(TEMPLATE, {
      slots: [{ name: '1st level', max: 4, used: 1 }, { name: '2nd level', max: 0 }, { name: 'Ki', max: 2, used: 2, reset: 'short' }],
    });
    expect(blockEl(container, 'slots001')?.querySelector('.atlas-sb-label')?.textContent).toBe('Spell slots');
    expect(cells(container).map((cell) => cell.querySelector('.atlas-sb-counter__name')?.textContent)).toEqual(['1st level', 'Ki']);
    const [first, ki] = cells(container);
    expect(first?.querySelectorAll('.atlas-sb-counter__pip')).toHaveLength(4);
    expect(first?.querySelectorAll('.atlas-sb-counter__pip.is-left')).toHaveLength(3);
    expect(ki?.querySelectorAll('.atlas-sb-counter__pip.is-left')).toHaveLength(0);
    expect(first?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('1st level: 3 of 4 left');
  });

  it('shows a count above six uses, and no buttons, on a card that is only read', () => {
    const { container } = renderSheet(TEMPLATE, { slots: [{ name: 'Sorcery points', max: 10, used: 7, reset: 'long' }] });
    expect(cells(container)[0]?.querySelector('.atlas-sb-counter__count')?.textContent).toBe('3 / 10');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('hides while no row has uses, the preset rows included', () => {
    expect(blockEl(renderSheet(TEMPLATE, {}).container, 'slots001')).toBeNull();
    cleanup();
    const withUses = templateOf([{ ...SLOTS, counterRows: [{ name: 'Wild shape', max: 2 }] }], [BLOCK]);
    expect(cells(renderSheet(withUses, {}).container).map((cell) => cell.textContent)).toEqual(['Wild shape']);
  });

  it('shows a value that is no list of counters as it is written, with its chip', () => {
    const { container } = renderSheet(TEMPLATE, { slots: [{ name: 'Ki', max: 2, used: 5 }] });
    expect(cells(container)).toHaveLength(0);
    expect(blockEl(container, 'slots001')?.textContent).toContain('Not counters');
  });

  it('shows a row regaining what Atlas does not roll as written, with its chip', () => {
    const { container } = renderSheet(TEMPLATE, { slots: [{ name: 'Ki', max: 2, used: 1, regain: 'plenty' }] });
    expect(cells(container)).toHaveLength(0);
    expect(blockEl(container, 'slots001')?.textContent).toContain('plenty');
    expect(blockEl(container, 'slots001')?.textContent).toContain('Not counters');
  });
});
