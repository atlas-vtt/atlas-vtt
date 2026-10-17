import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenSizeSelect } from '../../src/app/packages/components/asset-manager/token-creator/TokenSizeSelect';

afterEach(cleanup);

describe('token creator size choices', () => {
  it.each([['Tiny', 0.75], ['Small', 0.875]] as const)('lists sizes in order and saves a numeric %s size', async (name, size) => {
    const onChange = vi.fn();
    render(<TokenSizeSelect value={undefined} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Medium (1×1)' }), { key: 'Enter' });
    await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitemcheckbox');
    expect(items.map(item => item.textContent?.split(' (')[0])).toEqual(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Medium (1×1)' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: new RegExp(`^${name} \\(`) }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(size);
  });
});
