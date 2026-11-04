// @vitest-environment jsdom
import '../../../setup/obsidianDom';
import React, { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOptionList, type ChoiceOption } from '../../../../src/app/statblocks/editor/statblock-pane/ChoiceOptionList';
import { ownedBy } from '../../../../src/app/statblocks/editor/note-panel/panelScope';

const OPTIONS: ChoiceOption[] = ['Marsh', 'Forest', 'Underdark'].map((value) => ({ value, label: value }));

function Choice({ onPick }: { onPick: (value: string) => void }): React.JSX.Element {
  const list = useOptionList('Habitat', OPTIONS, onPick);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span ref={list.anchorRef} className="atlas-sb-pane-field">
      <input ref={inputRef} aria-label="Habitat" {...list.inputProps} onFocus={list.show} onBlur={() => list.setOpen(false)}
        onKeyDown={(event) => { list.onKey(event); }} />
      {list.list}
    </span>
  );
}

/** The choice inside a surface (its id on the root, as `StatblockEditorRoot` sets it) and a card that clips its content. */
function mount(onPick: (value: string) => void, doc: Document = document): HTMLElement {
  const host = doc.body.appendChild(doc.createElement('div'));
  const surface = host.appendChild(doc.createElement('div'));
  surface.setAttribute('data-atlas-surface', 'pane-1');
  const card = surface.appendChild(doc.createElement('div'));
  card.className = 'atlas-statblock';
  render(<Choice onPick={onPick} />, { container: card, baseElement: doc.body });
  return host;
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe('the options of a choice', () => {
  it('float in the document\'s body, outside the card, marked as the surface\'s own', () => {
    const host = mount(vi.fn());
    const input = screen.getByRole('combobox', { name: 'Habitat' });
    act(() => { input.focus(); });
    const list = screen.getByRole('listbox', { name: 'Habitat' });
    expect(list.parentElement).toBe(document.body);
    expect(host.querySelector('.atlas-statblock')!.contains(list)).toBe(false);
    expect(list.getAttribute('data-atlas-owner')).toBe('pane-1');
    // The panel's key scope and focus rules count the list as the panel's.
    expect(ownedBy(host, list.querySelector('[role="option"]'))).toBe(true);
    expect(input.getAttribute('aria-controls')).toBe(list.id);
  });

  it('keep the keys: ↓ steps, Enter picks the highlighted option, Escape closes the list and focus stays in the input', () => {
    const onPick = vi.fn();
    mount(onPick);
    const input = screen.getByRole('combobox', { name: 'Habitat' });
    act(() => { input.focus(); });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Forest' }).id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('Forest');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).not.toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('take a click without taking focus from the input, and close when focus leaves it', () => {
    const onPick = vi.fn();
    mount(onPick);
    const input = screen.getByRole('combobox', { name: 'Habitat' });
    act(() => { input.focus(); });
    const option = screen.getByRole('option', { name: 'Underdark' });
    // A press anywhere on the list keeps focus in the input: its default is prevented.
    expect(fireEvent.mouseDown(option)).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('listbox'))).toBe(false);
    fireEvent.click(option);
    expect(onPick).toHaveBeenCalledWith('Underdark');

    act(() => { input.blur(); input.focus(); });
    expect(screen.getByRole('listbox')).not.toBeNull();
    act(() => { input.blur(); });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('open in the document of their field: a popout\'s', () => {
    const frame = document.body.appendChild(document.createElement('iframe'));
    const popout = frame.contentDocument!;
    mount(vi.fn(), popout);
    const input = popout.querySelector<HTMLInputElement>('input')!;
    act(() => { input.focus(); });
    const list = popout.querySelector('[role="listbox"]');
    expect(list?.parentElement).toBe(popout.body);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
