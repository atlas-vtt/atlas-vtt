// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HiddenValueChips } from '../../../../src/app/statblocks/editor/template-editor/shell/HiddenValueChips';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from './editorKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'cr', label: 'Challenge', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'ac', label: 'Armor', type: 'number' },
];
const HIDING: StatblockTemplate = { ...template([{ id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' }], FIELDS), header: { hidden: ['level', 'description'] } };

describe('the chips of the header parts a template hides', () => {
  it('name each hidden part as the template does, and put it back on the card with a click', () => {
    const onShow = vi.fn();
    render(<HiddenValueChips template={HIDING} editable onShow={onShow} />);
    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['Challenge', 'Description']);
    fireEvent.click(chips[0]!);
    expect(onShow).toHaveBeenCalledWith('header-level');
  });

  it('take no click in a template that cannot be changed, and are none where nothing is hidden', () => {
    render(<HiddenValueChips template={HIDING} editable={false} onShow={vi.fn()} />);
    expect(screen.getAllByRole('button').every((chip) => (chip as HTMLButtonElement).disabled)).toBe(true);
    const { container } = render(<HiddenValueChips template={template([], FIELDS)} editable onShow={vi.fn()} />);
    expect(container.childElementCount).toBe(0);
  });
});
