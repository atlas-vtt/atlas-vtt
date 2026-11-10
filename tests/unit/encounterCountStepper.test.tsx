// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountStepper } from '../../src/app/packages/components/asset-manager/encounter-builder/CountStepper';

afterEach(cleanup);

function field(count: number | string = 2): { input: HTMLInputElement; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  render(<CountStepper name="Goblin" count={count} onChange={onChange} />);
  return { input: screen.getByRole('textbox', { name: 'Number of Goblin' }), onChange };
}

describe('the encounter count field', () => {
  it('takes dice typed into it on Enter', () => {
    const { input, onChange } = field();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2d4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2d4');
  });

  it('puts back what reads as no quantity, and anything on Escape, which it keeps from the builder', () => {
    const { input, onChange } = field();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'lots' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.blur(input);
    expect(input.value).toBe('2');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(escape);
    fireEvent.blur(input);
    expect(escape.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps dice by one die', () => {
    const { onChange } = field('2d4');
    fireEvent.click(screen.getByRole('button', { name: 'One die more for Goblin' }));
    expect(onChange).toHaveBeenCalledWith('3d4');
  });
});
