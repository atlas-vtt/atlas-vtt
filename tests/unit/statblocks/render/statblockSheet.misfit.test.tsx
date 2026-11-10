// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { ValueEditingContext, type ValueEditing } from '../../../../src/app/statblocks/render/valueSlot';
import { blockEl, renderSheet, templateOf, valueOf } from './sheetTestKit';

afterEach(cleanup);

/** The fields after a type change: each now holds a type its notes were not written for. */
const FIELDS: TemplateField[] = [
  { key: 'hp', label: 'Hit Points', type: 'number' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'text' },
];
const TEMPLATE = templateOf(FIELDS, [
  { id: 'hp000000', type: 'stat', field: 'hp', look: 'run-in' },
  { id: 'stats000', type: 'scores', field: 'stats', orientation: 'row' },
  { id: 'stress00', type: 'track', field: 'stress', look: 'boxes', counts: 'up' },
  { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in' },
]);

const chipsOf = (container: HTMLElement, id: string): HTMLElement[] => [...(blockEl(container, id)?.querySelectorAll<HTMLElement>('.atlas-sb-misfit') ?? [])];
const chips = (container: HTMLElement, id: string): string[] => chipsOf(container, id).map((chip) => chip.textContent ?? '');
/** What the chip's tooltip says, as screen readers hear it. */
const why = (chip: HTMLElement | undefined): string | null =>
  chip?.ownerDocument.getElementById(chip.getAttribute('aria-describedby') ?? '')?.textContent ?? null;

describe('StatblockSheet: a value that does not fit its field\'s type', () => {
  it('shows the value as it is written, followed by a chip that says so', () => {
    const { container } = renderSheet(TEMPLATE, { hp: 'fast', stats: '10 12', stress: 'tired', speed: '30 ft.' });

    expect(valueOf(container, 'hp000000')).toBe('fast');
    expect(chips(container, 'hp000000')).toEqual(['Not a number']);
    expect(why(chipsOf(container, 'hp000000')[0])).toBe('“fast” isn\'t a number.');
    expect(valueOf(container, 'stats000')).toBe('10 12');
    expect(chips(container, 'stats000')).toEqual(['Not table values']);
    expect(valueOf(container, 'stress00')).toBe('tired');
    expect(chips(container, 'stress00')).toEqual(['Not a number']);
    expect(chips(container, 'speed000')).toEqual([]);
  });

  it('shows a list in a number field joined, with the chip', () => {
    const { container } = renderSheet(TEMPLATE, { hp: [14, 18] });
    expect(valueOf(container, 'hp000000')).toBe('14, 18');
    expect(why(chipsOf(container, 'hp000000')[0])).toBe('“14, 18” isn\'t a number.');
  });

  it('shows no chip where the values fit, nor a track that has nothing to count', () => {
    const { container } = renderSheet(TEMPLATE, { hp: 14, stats: [10, 12], stress: 0, speed: '30 ft.' });
    expect(container.querySelector('.atlas-sb-misfit')).toBeNull();
    expect(blockEl(container, 'stress00')?.textContent).toBe('');
  });

  it('gives the chip to the editing slot with the values, so the pane shows it once', () => {
    const neutral: ValueEditing = { slot: (_block, values) => values };
    const { container } = render(
      <ValueEditingContext.Provider value={neutral}>
        <StatblockSheet template={TEMPLATE} name="Test" fields={{ hp: '1/4' }} variant="full" />
      </ValueEditingContext.Provider>,
    );
    expect(chips(container, 'hp000000')).toEqual(['Not a number']);
  });
});
