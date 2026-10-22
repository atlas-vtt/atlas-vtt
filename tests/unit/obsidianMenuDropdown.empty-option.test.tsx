// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ObsidianMenuDropdown } from '../../src/app/packages/components/shared/ObsidianMenuDropdown';

describe('ObsidianMenuDropdown empty option labels', () => {
  it('renders and selects the empty string option in array mode', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <ObsidianMenuDropdown value="" options={['', 'One', 'Two']} onChange={onChange} placeholder="Type" />,
    );

    fireEvent.keyDown(getByRole('button', { name: 'Type' }), { key: 'Enter' });
    const option = await screen.findByRole('menuitemcheckbox', { name: 'None' });
    expect(option.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders an explicit label for empty display values in object mode', async () => {
    const { getByRole } = render(
      <ObsidianMenuDropdown value="" options={{ '': '', first: 'First' }} onChange={vi.fn()} placeholder="Category" />,
    );

    fireEvent.keyDown(getByRole('button', { name: 'Category' }), { key: 'Enter' });
    expect(await screen.findByRole('menuitemcheckbox', { name: 'None' })).toBeTruthy();
  });
});
