// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagPicker } from '../../src/app/packages/components/asset-manager/token-creator/TagPicker';

afterEach(cleanup);

function Picker({ available = [], create = async (tag: string) => tag }: {
  available?: string[];
  create?: (tag: string) => Promise<string>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return <TagPicker available={available} selected={selected} onCreate={create}
    onToggle={(tag) => setSelected((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])} />;
}

describe('creator tag picker', () => {
  it('creates the first tag with Enter, trims its name, and lets it be deselected', async () => {
    const create = vi.fn(async (tag: string) => tag);
    render(<Picker create={create} />);
    const input = screen.getByRole('textbox', { name: 'Search or create tags' });
    fireEvent.change(input, { target: { value: '  Forest  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const chip = await screen.findByRole('button', { name: 'Forest' });
    expect(create).toHaveBeenCalledExactlyOnceWith('Forest');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('selects an existing tag by name without creating a case-insensitive duplicate', async () => {
    const create = vi.fn();
    render(<Picker available={['Forest']} create={create} />);
    const input = screen.getByRole('textbox', { name: 'Search or create tags' });
    fireEvent.change(input, { target: { value: ' forest ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe('true');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps failed tag creation unselected and allows a retry', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue('Forest');
    render(<Picker create={create} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search or create tags' }), { target: { value: 'Forest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create "Forest"' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('0 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create "Forest"' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('ignores blank names and repeated Enter while a tag is being saved', async () => {
    let resolve!: (name: string) => void;
    const create = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    render(<Picker create={create} />);
    const input = screen.getByRole('textbox', { name: 'Search or create tags' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Forest' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0 selected')).toBeTruthy();
    await act(async () => resolve('Forest'));
    expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe('true');
  });
});
