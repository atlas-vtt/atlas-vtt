import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceLookStrip } from '../../../src/app/react/components/command-palette/DiceLookStrip';

afterEach(() => cleanup());

describe("the command palette's dice looks", () => {
  it('is a radio group of the looks, each named in text, its image decorative, and tells the full id chosen', () => {
    const onChange = vi.fn();
    render(<DiceLookStrip value="ext:fire" onChange={onChange} choices={[
      { value: '', label: 'Atlas dice', preview: null, loaded: true },
      { value: 'ext:fire', label: 'Fire', preview: 'data:image/png;base64,AA', loaded: true },
      { value: 'gone:ice', label: 'gone:ice (not loaded)', preview: null, loaded: false },
    ]} />);
    expect(screen.getByRole('radiogroup', { name: 'Dice look' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Fire' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Atlas dice' }).getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(document.querySelector('[title]')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Atlas dice' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
