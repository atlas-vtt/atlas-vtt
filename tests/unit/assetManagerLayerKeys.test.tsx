// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { App, type Scope } from 'obsidian';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { CollectionPicker } from '../../src/app/packages/components/asset-manager/components/CollectionPicker';
import { HeaderMenu } from '../../src/app/packages/components/asset-manager/components/HeaderMenu';
import { HeaderSearch } from '../../src/app/packages/components/asset-manager/components/HeaderSearch';
import { MoveModal } from '../../src/app/packages/components/asset-manager/components/MoveModal';
import { useAssetManagerShortcuts } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerShortcuts';
import type { Folder } from '../../src/app/packages/components/asset-manager/types';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => { cleanup(); document.body.innerHTML = ''; });

/** A listener behind every layer, as the asset manager's own (it closes the window on Escape). */
function windowBehind(): ReturnType<typeof vi.fn> {
  const heard = vi.fn();
  document.addEventListener('keydown', (event) => heard(event.key));
  return heard;
}

describe('the collection picker', () => {
  const collections = [
    { id: 'demo', uid: 'u1', name: 'Demo' },
    { id: 'srd', uid: 'u2', name: 'SRD' },
    { id: 'edge', uid: 'u3', name: 'Audit Edge' },
  ];

  it('moves its highlight with the arrows and picks with Enter (combobox over a named listbox)', () => {
    const onSelect = vi.fn();
    render(<TooltipProvider><CollectionPicker collections={collections} selectedCollection="demo" onSelectCollection={onSelect} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }));
    const search = screen.getByRole('combobox', { name: 'Search collections…' });
    expect(screen.getByRole('listbox', { name: 'Collections' })).toBeTruthy();
    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Demo' }).id);

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Audit Edge' }).id);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('edge');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape without the window behind it hearing the key, and gives focus back', () => {
    const heard = windowBehind();
    render(<TooltipProvider><CollectionPicker collections={collections} selectedCollection="demo" onSelectCollection={vi.fn()} /></TooltipProvider>);
    const trigger = screen.getByRole('button', { name: 'Demo' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(heard).not.toHaveBeenCalledWith('Escape');
  });
});

describe('the + menu', () => {
  it('opens on its first item from the keyboard, moves with the arrows and gives focus back on Escape', () => {
    const heard = windowBehind();
    const onSelect = vi.fn();
    render(
      <TooltipProvider>
        <HeaderMenu label="Create" triggerClassName="create" triggerContent="+" items={[
          { key: 'token', label: 'New token', onSelect },
          { key: 'map', label: 'New map', onSelect: vi.fn() },
        ]} />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(trigger, { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New token' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New map' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New token' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(heard).not.toHaveBeenCalledWith('Escape');
  });
});

describe('Escape in the search field (decision #7)', () => {
  function Search(): React.JSX.Element {
    const [search, setSearch] = useState('goblin');
    return (
      <div tabIndex={-1} data-testid="window">
        <TooltipProvider><HeaderSearch app={new App()} search={search} onSearch={setSearch} shortcut={false} /></TooltipProvider>
      </div>
    );
  }

  it('clears the query, then leaves the field for the window, then lets the window have it', () => {
    const heard = windowBehind();
    render(<Search />);
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('window'));
    expect(heard).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('window'), { key: 'Escape' });
    expect(heard).toHaveBeenCalledWith('Escape');
  });
});

describe('the Move to folder dialog', () => {
  const folders: Folder[] = [
    { id: 'beasts', name: 'Beasts', type: 'tokens', parentId: null, path: 'Beasts' },
    { id: 'undead', name: 'Undead', type: 'tokens', parentId: null, path: 'Undead' },
  ] as Folder[];

  function Dialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }): React.JSX.Element {
    const [target, setTarget] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [listOpen, setListOpen] = useState(false);
    return (
      <TooltipProvider>
        <MoveModal
          selectedAssetIds={['wolf']} movingWhat={'"wolf"'} folders={folders} activeTab="tokens"
          moveTargetFolderId={target} setMoveTargetFolderId={setTarget}
          moveFolderSearch={query} setMoveFolderSearch={setQuery}
          moveFolderListOpen={listOpen} setMoveFolderListOpen={setListOpen}
          onClose={onClose} onConfirm={onConfirm}
          isFolderNameTaken={() => false} onCreateFolder={() => Promise.resolve(null)}
        />
        <span data-testid="target">{String(target)}</span>
      </TooltipProvider>
    );
  }

  it('opens its folder list with Down, moves through it and takes a folder with Enter', () => {
    const onConfirm = vi.fn();
    render(<Dialog onClose={vi.fn()} onConfirm={onConfirm} />);
    const field = screen.getByRole('combobox');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    // The list opens on the folder after the chosen one (the top level).
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Beasts' }).id);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByTestId('target').textContent).toBe('beasts');
    expect((field as HTMLInputElement).value).toBe('Beasts');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('opens with its list showing on the chosen folder, and opens it again on a click once closed (F3)', () => {
    render(<Dialog onClose={vi.fn()} onConfirm={vi.fn()} />);
    const field = screen.getByRole('combobox');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Top level' }).id);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(field);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Top level' }).id);
  });

  it('opens with Alt+Down on the chosen folder, with Up on the last, and takes a folder with Alt+Up', () => {
    render(<Dialog onClose={vi.fn()} onConfirm={vi.fn()} />);
    const field = screen.getByRole('combobox');
    fireEvent.keyDown(field, { key: 'ArrowDown', altKey: true });
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Top level' }).id);
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Undead' }).id);
    fireEvent.keyDown(field, { key: 'ArrowUp', altKey: true });
    expect(screen.getByTestId('target').textContent).toBe('undead');
    expect(screen.queryByRole('listbox')).toBeNull();
    // The field shows the folder taken, and that text filters nothing when the list opens again.
    expect((field as HTMLInputElement).value).toBe('Undead');
    // Down from the chosen folder opens on the row after it, and stops at the last.
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Beasts' }).id);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Undead' }).id);
  });

  it('opens the list as the search is typed', () => {
    render(<Dialog onClose={vi.fn()} onConfirm={vi.fn()} />);
    const field = screen.getByRole('combobox');
    fireEvent.change(field, { target: { value: 'und' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Undead']);
  });

  it('closes its list on the first Escape and itself on the second, never the window behind', () => {
    const heard = windowBehind();
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} onConfirm={vi.fn()} />);
    const field = screen.getByRole('combobox');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(heard).not.toHaveBeenCalledWith('Escape');
  });

  it('keeps Tab inside, wrapping from its last control to its first', () => {
    const heard = windowBehind();
    render(<Dialog onClose={vi.fn()} onConfirm={vi.fn()} />);
    const move = screen.getByRole('button', { name: 'Move' });
    move.focus();
    fireEvent.keyDown(move, { key: 'Tab' });
    const first = document.activeElement;
    expect(first).not.toBe(move);
    expect(first?.closest('.atlas-asset-manager-move-container')).not.toBeNull();
    fireEvent.keyDown(first!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(move);
    expect(heard).not.toHaveBeenCalledWith('Tab');
  });
});

describe('the manager\'s Cmd/Ctrl shortcuts', () => {
  const press = (app: App, key: string): boolean => {
    const scopes = (app.keymap as unknown as { scopes: Scope[] }).scopes;
    const top = scopes[scopes.length - 1] as unknown as { keys: Array<{ modifiers: string[]; key: string; func: () => unknown }> } | undefined;
    const handler = top?.keys.find((candidate) => candidate.key === key && candidate.modifiers.includes('Mod'));
    return handler ? handler.func() === false : false;
  };

  it('switch tabs with 1 to 5 and focus the search with F in a key scope Obsidian asks first, lifted while a dialog is open', () => {
    const app = new App();
    const changeTab = vi.fn();
    const { result, rerender } = renderHook(({ active }) => {
      const container = useRef<HTMLDivElement>(document.createElement('div'));
      container.current.innerHTML = '<div class="atlas-asset-manager-search"><input /></div>';
      document.body.append(container.current);
      useAssetManagerShortcuts(app, active, container, changeTab);
      return container;
    }, { initialProps: { active: true } });

    expect(press(app, '2')).toBe(true);
    expect(press(app, '5')).toBe(true);
    expect(press(app, '6')).toBe(false);
    expect(changeTab.mock.calls.map(([tab]) => tab)).toEqual(['maps', 'party']);
    act(() => { press(app, 'f'); });
    expect(document.activeElement).toBe(result.current.current.querySelector('input'));

    rerender({ active: false });
    expect(press(app, '1')).toBe(false);
  });
});

it('moves focus into a + menu the pointer opened when an arrow key is pressed on its button', () => {
  render(
    <TooltipProvider>
      <HeaderMenu label="Create" triggerClassName="create" triggerContent="+" items={[
        { key: 'token', label: 'New token', onSelect: vi.fn() },
        { key: 'map', label: 'New map', onSelect: vi.fn() },
      ]} />
    </TooltipProvider>,
  );
  const trigger = screen.getByRole('button', { name: 'Create' });
  fireEvent.click(trigger, { detail: 1 });
  expect(document.activeElement).not.toBe(screen.getByRole('menuitem', { name: 'New token' }));
  fireEvent.keyDown(trigger, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New map' }));
});
