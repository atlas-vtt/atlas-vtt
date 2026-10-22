// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatblockRenderer } from '../../src/app/react/components/statblock/StatblockRenderer';
import type {
  StatblockItem,
  StatblockLayout,
} from '../../src/app/react/components/statblock/statblockTypes';

function layoutOf(...blocks: StatblockItem[]): StatblockLayout {
  return { name: 'Test', id: 'test', blocks };
}

function renderEditable(
  layout: StatblockLayout,
  monster: Record<string, unknown>,
  commit = vi.fn(),
) {
  const result = render(
    <StatblockRenderer
      layout={layout}
      monster={monster}
      edit={{ editable: true, commit }}
    />,
  );
  return { ...result, commit };
}

describe('inline statblock editing', () => {
  it('turns a property value into an input on click and commits it', () => {
    const { container, commit } = renderEditable(
      layoutOf({ type: 'property', id: 'p', properties: ['ac'], display: 'AC' }),
      { ac: 12 },
    );

    fireEvent.click(container.querySelector('.atlas-sb-editable')!);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('12');

    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(commit).toHaveBeenCalledWith(['ac'], '15');
  });

  it('discards the edit on Escape', () => {
    const { container, commit } = renderEditable(
      layoutOf({ type: 'property', id: 'p', properties: ['ac'], display: 'AC' }),
      { ac: 12 },
    );

    fireEvent.click(container.querySelector('.atlas-sb-editable')!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(commit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('12');
  });

  it('commits on blur', () => {
    const { container, commit } = renderEditable(
      layoutOf({ type: 'property', id: 'p', properties: ['hp'], display: 'HP' }),
      { hp: 9 },
    );

    fireEvent.click(container.querySelector('.atlas-sb-editable')!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.blur(input);

    expect(commit).toHaveBeenCalledWith(['hp'], '11');
  });

  it('addresses nested trait fields by index', () => {
    const { container, commit } = renderEditable(
      layoutOf({ type: 'traits', id: 't', properties: ['actions'] }),
      { actions: [{ name: 'Bite', desc: 'Deals damage.' }] },
    );

    const editables = container.querySelectorAll('.atlas-sb-editable');
    fireEvent.click(editables[0]!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Claw' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(commit).toHaveBeenCalledWith(['actions', 0, 'name'], 'Claw');
  });

  it('addresses table cells by index', () => {
    const { container, commit } = renderEditable(
      layoutOf({
        type: 'table',
        id: 'tb',
        properties: ['stats'],
        headers: ['STR', 'DEX'],
        calculate: true,
      }),
      { stats: [16, 8] },
    );

    fireEvent.click(container.querySelectorAll('.atlas-sb-editable')[1]!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '14' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(commit).toHaveBeenCalledWith(['stats', 1], '14');
  });

  it('does not make callback-derived values editable', () => {
    const { container } = renderEditable(
      layoutOf({
        type: 'property',
        id: 'p',
        properties: ['ac'],
        callback: 'return "computed"',
      }),
      { ac: 12 },
    );

    expect(container.querySelector('.atlas-sb-editable')).toBeNull();
  });

  it('renders read-only when editing is disabled', () => {
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf({ type: 'property', id: 'p', properties: ['ac'], display: 'AC' })}
        monster={{ ac: 12 }}
      />,
    );

    expect(container.querySelector('.atlas-sb-editable')).toBeNull();
  });
});
