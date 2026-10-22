// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownToggleRow } from '../../src/app/packages/components/primitives/DropdownToggleRow';
import { Toggle } from '../../src/app/packages/components/primitives/Toggle';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

afterEach(cleanup);

function renderRow(value = false): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(<DropdownToggleRow label="Lasso Selection" value={value} onChange={onChange} />);
  return onChange;
}

describe('DropdownToggleRow', () => {
  it('is a switch named by the row\'s text', () => {
    renderRow();
    const toggle = screen.getByRole('switch', { name: 'Lasso Selection' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.tabIndex).toBe(0);
    expect(toggle.classList.contains('atlas-toggle')).toBe(true);
  });

  it('tells assistive technology when it is on', () => {
    renderRow(true);
    expect(screen.getByRole('switch', { name: 'Lasso Selection' }).getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.atlas-toggle__switch--on')).not.toBeNull();
  });

  it('toggles on click', () => {
    const onChange = renderRow();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('toggles with Space and Enter, and with no other key', () => {
    const onChange = renderRow();
    const toggle = screen.getByRole('switch');
    fireEvent.keyDown(toggle, { key: ' ' });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(toggle, { key: 'a' });
    fireEvent.keyDown(toggle, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('shows no tooltip: the row already says what it switches', () => {
    renderRow();
    expect(document.querySelector('[aria-label], [title]')).toBeNull();
    expect(screen.getAllByText('Lasso Selection')).toHaveLength(1);
  });
});

describe('Toggle with its tooltip', () => {
  it('is the same switch: one change per click and per key, named by its label', () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <span id="gm-view-label">GM view</span>
        <Toggle value onChange={onChange} tooltipOn="GM View" tooltipOff="Session View" labelledBy="gm-view-label" />
      </TooltipProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'GM view' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
