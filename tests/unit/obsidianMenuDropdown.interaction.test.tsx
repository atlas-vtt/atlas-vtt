// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObsidianMenuDropdown } from '../../src/app/packages/components/shared/ObsidianMenuDropdown';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';

describe('settings dropdown interactions', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(['pointer', 'keyboard'] as const)('opening another dropdown with %s closes the previous one across React roots', async (input) => {
    const first = render(<ObsidianMenuDropdown value="Square" options={['Square', 'Hex']} onChange={vi.fn()} />);
    const second = render(<ObsidianMenuDropdown value="Solid" options={['Solid', 'Dotted']} onChange={vi.fn()} />);
    const firstTrigger = first.container.querySelector('button') as HTMLButtonElement;
    const secondTrigger = second.container.querySelector('button') as HTMLButtonElement;
    const open = (trigger: HTMLButtonElement): void => {
      if (input === 'pointer') fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
      else fireEvent.keyDown(trigger, { key: 'Enter' });
    };

    open(firstTrigger);
    await screen.findByRole('menuitemcheckbox', { name: 'Hex' });
    open(secondTrigger);
    await screen.findByRole('menuitemcheckbox', { name: 'Dotted' });
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(secondTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(document.querySelector('[role="menu"]')?.textContent).toBe('SolidDotted');

    // Unmounting the old owner must not dismiss the new owner's menu.
    first.unmount();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Dotted' })).toBeTruthy();
    if (input === 'keyboard') {
      await waitFor(() => expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true));
    }
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0));
    await waitFor(() => expect(document.activeElement).toBe(secondTrigger));
  });

  it('describes each option that has an explanation, beside its row, and leaves the others plain', async () => {
    render(<ObsidianMenuDropdown value="natural" options={{ natural: 'Natural', none: 'None', plain: 'Plain' }}
      descriptions={{ natural: 'The highest face is a critical success.', none: 'Rolls are never critical.' }} onChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Natural' }), { key: 'Enter' });
    const described = (name: string): string | null => {
      // While its tooltip shows, the row is also described by the tooltip's content.
      const id = screen.getByRole('menuitemcheckbox', { name }).getAttribute('aria-describedby')?.split(' ')[0];
      return id ? document.getElementById(id)?.textContent ?? null : null;
    };
    await screen.findByRole('menu');
    expect(described('Natural')).toBe('The highest face is a critical success.');
    expect(described('None')).toBe('Rolls are never critical.');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Plain' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps the menu inside its Obsidian modal so the focus trap can reach it', async () => {
    const view = render(<div className="modal"><div role="dialog"><ObsidianMenuDropdown value="Square" options={['Square', 'Hex']} onChange={vi.fn()} /></div></div>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Square' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(view.container.querySelector('[role="dialog"]')?.contains(menu)).toBe(true);
  });

  it('leaves other dropdown buttons available while a menu is open', async () => {
    const { getByRole } = render(<>
      <ObsidianMenuDropdown value="Square" options={['Square', 'Hex']} onChange={vi.fn()} />
      <ObsidianMenuDropdown value="Solid" options={['Solid', 'Dotted']} onChange={vi.fn()} />
    </>);
    const firstTrigger = getByRole('button', { name: 'Square' });
    fireEvent.pointerDown(firstTrigger, { button: 0, ctrlKey: false });
    await screen.findByRole('menu');
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(getByRole('button', { name: 'Solid' })).toBeTruthy();
  });

  it('still opens and selects an option after another map menu provider unmounts', async () => {
    const onChange = vi.fn();
    const view = render(
      <ContextMenuProvider>
        <ObsidianMenuDropdown value="square" options={{ square: 'Square', hex: 'Hex (Flat)' }} onChange={onChange} />
      </ContextMenuProvider>,
    );
    const otherMap = render(<ContextMenuProvider><div>Other map</div></ContextMenuProvider>);
    otherMap.unmount();

    const trigger = view.container.querySelector('.text-icon-button') as HTMLElement;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    const option = await screen.findByRole('menuitemcheckbox', { name: 'Hex (Flat)' });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('hex');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('opens from the keyboard and restores focus on Escape without a map provider', async () => {
    const view = render(<ObsidianMenuDropdown value="Square" options={['Square', 'Hex (Flat)']} onChange={vi.fn()} />);
    const trigger = view.container.querySelector('.text-icon-button') as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(await screen.findByRole('menu')).toBeTruthy();
    const parentKeyDown = vi.fn();
    document.addEventListener('keydown', parentKeyDown);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    document.removeEventListener('keydown', parentKeyDown);
    expect(parentKeyDown).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
