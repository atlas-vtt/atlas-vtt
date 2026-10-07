import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providedMenuEntries } from '../../src/app/extensions/menuEntries';
import { invalidateSlots, viewMenuSlot } from '../../src/app/extensions/slots';
import { renderEntries, type ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { MenuItem, ViewContext } from '../../src/api/types/ui';

const CTX: ViewContext = { viewId: 'view-1', kind: 'map', isPlayerView: false };

function renderMenu(entries: ContextMenuEntry[], onClose: () => void): void {
  render(
    <DropdownMenu.Root open modal={false}>
      <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
      <DropdownMenu.Content>{renderEntries(entries, onClose)}</DropdownMenu.Content>
    </DropdownMenu.Root>,
  );
}

const checkOf = (name: string): string | null | undefined =>
  screen.getByRole('menuitemcheckbox', { name }).querySelector('.atlas-ctx-item__check')?.getAttribute('data-state');

/** A "Controlled by" submenu whose ticks follow `controllers`, toggled by its items. */
function controlledBy(controllers: Set<string>, keepOpen: unknown): (ctx: ViewContext) => MenuItem[] {
  const toggle = (name: string): void => { if (!controllers.delete(name)) controllers.add(name); };
  return () => [{
    label: 'Controlled by',
    submenu: ['Anna', 'Bob'].map((name) => ({ label: name, checked: controllers.has(name), keepOpen: keepOpen as boolean, onClick: () => toggle(name) })),
  }];
}

let removers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const remove of removers.splice(0)) remove();
  expect(viewMenuSlot.list()).toHaveLength(0);
});

describe('extension menu items that stay open', () => {
  it('keeps the menu open on a toggle, and its checkmark follows after invalidate', () => {
    const controllers = new Set<string>();
    removers.push(viewMenuSlot.add('ext', controlledBy(controllers, true)));
    const onClose = vi.fn();
    renderMenu(providedMenuEntries(viewMenuSlot, 'view menu items', CTX), onClose);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Controlled by' }), { key: 'ArrowRight' });
    expect(checkOf('Anna')).toBe('unchecked');

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Anna' }));
    expect(controllers.has('Anna')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    // The extension says its items changed, as `ui.invalidate()` does.
    act(() => invalidateSlots());
    expect(checkOf('Anna')).toBe('checked');
    expect(checkOf('Bob')).toBe('unchecked');
  });

  it('keeps a submenu inside another submenu live too', () => {
    const controllers = new Set<string>();
    const inner = controlledBy(controllers, true);
    removers.push(viewMenuSlot.add('ext', (ctx) => [{ label: 'Session', submenu: inner(ctx) }]));
    renderMenu(providedMenuEntries(viewMenuSlot, 'view menu items', CTX), vi.fn());
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Session' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Controlled by' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Bob' }));
    act(() => invalidateSlots());
    expect(checkOf('Bob')).toBe('checked');
    expect(checkOf('Anna')).toBe('unchecked');
  });

  it('takes keepOpen only when it is true: anything else closes the menu', () => {
    for (const given of ['yes', 1]) {
      const entries = (() => {
        const remove = viewMenuSlot.add('ext', () => [{ label: 'Toggle', checked: false, keepOpen: given as unknown as boolean, onClick: vi.fn() }]);
        const built = providedMenuEntries(viewMenuSlot, 'view menu items', CTX);
        remove();
        return built;
      })();
      expect(entries[0]).not.toHaveProperty('keepOpen');
      const onClose = vi.fn();
      renderMenu(entries, onClose);
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Toggle' }));
      expect(onClose).toHaveBeenCalledOnce();
      cleanup();
    }
  });

  it('reads a removed provider no more: its open submenu empties instead of calling it', () => {
    const provider = vi.fn(controlledBy(new Set(), true));
    const remove = viewMenuSlot.add('ext', provider);
    const [entry] = providedMenuEntries(viewMenuSlot, 'view menu items', CTX) as Array<Extract<ContextMenuEntry, { type: 'submenu' }>>;
    const read = entry!.children as () => ContextMenuEntry[];
    expect(read()).toHaveLength(2);
    remove();
    provider.mockClear();
    expect(read()).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });

  it('logs a provider that throws on a later read and shows nothing for it', () => {
    let fail = false;
    removers.push(viewMenuSlot.add('ext', () => {
      if (fail) throw new Error('boom');
      return [{ label: 'Sub', submenu: [{ label: 'A' }] }];
    }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [entry] = providedMenuEntries(viewMenuSlot, 'view menu items', CTX) as Array<Extract<ContextMenuEntry, { type: 'submenu' }>>;
    fail = true;
    expect((entry!.children as () => ContextMenuEntry[])()).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
