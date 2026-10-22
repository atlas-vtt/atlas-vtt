// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ObsidianMenuDropdown } from '../../src/app/react/components/ObsidianMenuDropdown';

describe('React ObsidianMenuDropdown empty option labels', () => {
  it('shows an explicit menu label for empty options', async () => {
    const { getByRole } = render(
      <ObsidianMenuDropdown value="" options={{ '': '', one: 'One' }} onChange={() => {}} />,
    );

    fireEvent.keyDown(getByRole('button', { name: 'Select...' }), { key: 'Enter' });
    expect(await screen.findByRole('menuitemcheckbox', { name: 'None' })).toBeTruthy();
  });
});
