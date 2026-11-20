// @vitest-environment jsdom
import '../setup/obsidianDom';
import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComboBox, type ComboBoxOption } from '../../src/app/packages/components/primitives/ComboBox';
import { useDialogEscape } from '../../src/app/packages/components/primitives/useDialogEscape';

const OPTIONS: ComboBoxOption[] = [
  { value: 'cairn', label: 'Cairn' },
  { value: 'drawsteel', label: 'Draw Steel' },
  { value: 'shadowdark', label: 'Shadowdark' },
];

function Field({ onClose, start = '' }: { onClose: () => void; start?: string }): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(start);
  useDialogEscape(dialogRef, onClose);
  return (
    <div ref={dialogRef} role="dialog">
      <span id="system">Game system</span>
      <ComboBox labelledBy="system" value={value} options={OPTIONS} onChange={setValue}
        matches={(option, text) => option.label.toLowerCase().includes(text.toLowerCase())} typedLabel={(text) => `Use “${text}”`} />
      <output data-testid="value">{value}</output>
    </div>
  );
}

// jsdom lays nothing out, so it has no scrolling into view.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  document.body.empty();
});

describe('a combo box', () => {
  it('narrows the choices to what is typed, and offers to keep a name none of them has', () => {
    render(<Field onClose={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'dark' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Shadowdark', 'Use “dark”']);
    fireEvent.change(input, { target: { value: 'Mothership' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Use “Mothership”']);
    fireEvent.click(screen.getByRole('option'));
    expect(screen.getByTestId('value').textContent).toBe('Mothership');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks a choice with the arrow keys and Enter, and shows its label', () => {
    render(<Field onClose={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'dra' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('value').textContent).toBe('drawsteel');
    expect((input as HTMLInputElement).value).toBe('Draw Steel');
  });

  it('closes its list on Escape and leaves the dialog open; the next Escape closes the dialog', () => {
    const onClose = vi.fn();
    render(<Field onClose={onClose} start="cairn" />);
    const input = screen.getByRole('combobox');
    expect((input as HTMLInputElement).value).toBe('Cairn');
    fireEvent.click(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
