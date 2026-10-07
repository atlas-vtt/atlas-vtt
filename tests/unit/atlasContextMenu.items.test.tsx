import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderEntries, type ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

function renderMenu(entries: ContextMenuEntry[], onClose: () => void): void {
  render(
    <DropdownMenu.Root open modal={false}>
      <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
      <DropdownMenu.Content>{renderEntries(entries, onClose)}</DropdownMenu.Content>
    </DropdownMenu.Root>,
  );
}

afterEach(cleanup);

describe('context menu items', () => {
  it('keeps the menu open for keep-open items and closes it for the others', () => {
    const onClose = vi.fn();
    const toggle = vi.fn();
    const action = vi.fn();
    renderMenu([
      { type: 'item', label: 'Poisoned', checked: false, keepOpen: true, onClick: toggle },
      { type: 'item', label: 'Delete', onClick: action },
    ], onClose);

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Poisoned' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(action).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the leading visual and a check mark on checked items', () => {
    renderMenu([
      { type: 'item', label: 'Prone', checked: true, leading: <span data-testid="badge" />, onClick: vi.fn() },
      { type: 'item', label: 'Stunned', checked: false, onClick: vi.fn() },
    ], vi.fn());

    const prone = screen.getByRole('menuitemcheckbox', { name: 'Prone' });
    expect(prone.querySelector('[data-testid="badge"]')).not.toBeNull();
    expect(prone.querySelector('.atlas-ctx-item__check')?.getAttribute('data-state')).toBe('checked');
    const stunned = screen.getByRole('menuitemcheckbox', { name: 'Stunned' });
    expect(stunned.querySelector('.atlas-ctx-item__check')?.getAttribute('data-state')).toBe('unchecked');
  });

  it('steps a value with its buttons and the + and - keys without choosing the item', () => {
    const onClose = vi.fn();
    const toggle = vi.fn();
    const stepper = { value: '2', label: 'Frightened', canDecrement: true, onIncrement: vi.fn(), onDecrement: vi.fn() };
    renderMenu([{ type: 'item', label: 'Frightened', checked: true, keepOpen: true, stepper, onClick: toggle }], onClose);

    const item = screen.getByRole('menuitemcheckbox', { name: /Frightened/ });
    fireEvent.click(screen.getByRole('button', { name: 'Raise Frightened' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower Frightened' }));
    fireEvent.keyDown(item, { key: '+' });
    fireEvent.keyDown(item, { key: '-' });

    expect(stepper.onIncrement).toHaveBeenCalledTimes(2);
    expect(stepper.onDecrement).toHaveBeenCalledTimes(2);
    expect(toggle).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(item.textContent).toContain('2');
  });

  it('rebuilds a live submenu when it reports a change', () => {
    let listener: (() => void) | undefined;
    let label = 'Before';
    render(
      <DropdownMenu.Root open modal={false}>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {renderEntries([{
            type: 'submenu',
            label: 'Live',
            children: () => [{ type: 'item', label, onClick: vi.fn() }],
            subscribe: (onChange) => { listener = onChange; return () => { listener = undefined; }; },
          }], vi.fn())}
        </DropdownMenu.Content>
      </DropdownMenu.Root>,
    );
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Live' }), { key: 'ArrowRight' });
    expect(screen.getByRole('menuitem', { name: 'Before' })).toBeTruthy();

    label = 'After';
    React.act(() => listener?.());
    expect(screen.getByRole('menuitem', { name: 'After' })).toBeTruthy();
  });

  it('draws a label row and a separator that are never focused or chosen', () => {
    const onClose = vi.fn();
    renderMenu([
      { type: 'label', text: 'Present to' },
      { type: 'item', label: 'Anna', onClick: vi.fn() },
      { type: 'separator' },
      { type: 'item', label: 'Ben', onClick: vi.fn() },
    ], onClose);
    const label = screen.getByText('Present to');
    expect(label.getAttribute('role')).toBe('presentation');
    expect(label.closest('.atlas-ctx-label')!.getAttribute('aria-hidden')).toBeNull();
    expect(label.closest('.atlas-ctx-label')!.hasAttribute('tabindex')).toBe(false);
    expect(screen.getByRole('separator')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Anna', 'Ben']);
    fireEvent.click(label);
    expect(onClose).not.toHaveBeenCalled();
  });
});
