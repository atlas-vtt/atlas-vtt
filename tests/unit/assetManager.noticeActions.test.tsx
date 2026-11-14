// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';
import { isPressOutsideWindow } from '../../src/app/packages/components/asset-manager/utils/outsidePress';
import { landingAfterLeaving } from '../../src/app/packages/components/asset-manager/utils/cardFocus';
import { useRevealMoved, type RevealMovedDeps } from '../../src/app/packages/components/asset-manager/hooks/useRevealMoved';
import { showAtlasToast } from '../../src/app/react/components/AtlasToast';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('a press outside the asset manager', () => {
  function windowWith(): HTMLElement {
    const manager = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
    manager.createEl('button', { text: 'Tokens' });
    return manager;
  }

  it('is a press on the map, not on the window or what belongs to it', () => {
    const manager = windowWith();
    const map = document.body.createDiv({ cls: 'atlas-map' });
    expect(isPressOutsideWindow(map, manager)).toBe(true);
    expect(isPressOutsideWindow(manager.querySelector('button'), manager)).toBe(false);
  });

  it('is never a press on an Atlas notice, so its "Open folder" can open the folder (#37)', () => {
    const manager = windowWith();
    showAtlasToast('Moved "Rogue" to Loot', 6000, { label: 'Open folder', run: vi.fn() });
    const button = document.querySelector<HTMLElement>('.atlas-toast button')!;
    expect(isPressOutsideWindow(button, manager)).toBe(false);
    expect(isPressOutsideWindow(button.parentElement, manager)).toBe(false);
  });

  it('is never a press in a menu or dialog over the window', () => {
    const manager = windowWith();
    const menu = document.body.createDiv({ cls: 'menu' }).createDiv({ cls: 'menu-item' });
    expect(isPressOutsideWindow(menu, manager)).toBe(false);
  });
});

describe('focus once cards have left the grid', () => {
  function grid(cards: string[], folders: string[] = [], crumbs: string[] = []): void {
    const manager = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
    const nav = manager.createEl('nav', { cls: 'atlas-asset-manager-breadcrumb' });
    crumbs.forEach((name, index) => nav.createEl('button', {
      cls: index === crumbs.length - 1 ? 'atlas-breadcrumb-btn atlas-current' : 'atlas-breadcrumb-btn', text: name,
    }));
    const folderGrid = manager.createDiv({ cls: 'atlas-folder-grid' });
    folders.forEach((name) => folderGrid.createDiv({ text: name, attr: { role: 'option', tabindex: '-1' } }));
    cards.forEach((id) => manager.createDiv({ attr: { 'data-asset-id': id, tabindex: '-1' } }));
  }
  const removeCards = (ids: string[]): void => ids.forEach((id) => document.querySelector(`[data-asset-id="${id}"]`)?.remove());

  it('goes to the card beside them', () => {
    grid(['bard', 'rogue', 'wizard']);
    const landing = landingAfterLeaving(document, ['rogue']);
    removeCards(['rogue']);
    expect(landing()?.dataset.assetId).toBe('wizard');
  });

  it('goes to the level\'s first folder where no card is left', () => {
    grid(['rogue'], ['Empty folder']);
    const landing = landingAfterLeaving(document, ['rogue']);
    removeCards(['rogue']);
    expect(landing()?.textContent).toBe('Empty folder');
  });

  it('goes to the way up out of a folder left empty, never the window', () => {
    grid(['rogue'], [], ['Tokens', 'Empty folder']);
    const landing = landingAfterLeaving(document, ['rogue']);
    removeCards(['rogue']);
    expect(landing()?.textContent).toBe('Tokens');
  });
});

describe('where a move notice\'s button takes the GM', () => {
  const rogue = { id: 'rogue', name: 'Rogue', type: 'tokens', folderId: 'folder:loot' } as AnyAsset;
  const bard = { id: 'bard', name: 'Bard', type: 'tokens', folderId: null } as AnyAsset;

  function setup(initial: Partial<RevealMovedDeps> = {}): {
    result: { current: ReturnType<typeof useRevealMoved> };
    rerender: (props: Partial<RevealMovedDeps>) => void;
    navigate: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    changeCollection: ReturnType<typeof vi.fn>;
  } {
    const navigate = vi.fn();
    const select = vi.fn();
    const changeCollection = vi.fn();
    const base: RevealMovedDeps = {
      selectedCollection: 'camp', changeCollection, assets: [rogue, bard], assetsLoading: false,
      sel: { handleNavigateToFolder: navigate, setSelectedAssetIds: select }, ...initial,
    };
    const { result, rerender } = renderHook((props: RevealMovedDeps) => useRevealMoved(props), { initialProps: base });
    return { result, rerender: (props) => rerender({ ...base, ...props }), navigate, select, changeCollection };
  }

  it('opens the folder the cards went to, selects them and asks the grid to show the first', () => {
    const { result, navigate, select } = setup();
    act(() => result.current.inFolder('folder:loot', ['rogue']));
    expect(navigate).toHaveBeenCalledWith('folder:loot');
    expect(select).toHaveBeenLastCalledWith(['rogue']);
    expect(result.current.gridReveal).toEqual({ id: 'rogue' });
  });

  it('opens another collection and selects the cards once its list is loaded', () => {
    const { result, rerender, navigate, select, changeCollection } = setup();
    act(() => result.current.inCollection('keep', ['rogue']));
    expect(changeCollection).toHaveBeenCalledWith('keep');
    expect(select).not.toHaveBeenCalled();

    rerender({ selectedCollection: 'keep', assetsLoading: true, assets: [bard] });
    expect(select).not.toHaveBeenCalled();
    rerender({ selectedCollection: 'keep', assetsLoading: false, assets: [rogue, bard] });
    expect(navigate).toHaveBeenLastCalledWith('folder:loot');
    expect(select).toHaveBeenLastCalledWith(['rogue']);
    expect(result.current.gridReveal).toEqual({ id: 'rogue' });
  });

  it('selects nothing when the cards are not in the list', () => {
    const { result, select } = setup();
    act(() => result.current.inFolder(null, ['gone']));
    expect(select).not.toHaveBeenCalled();
    expect(result.current.gridReveal).toBeNull();
  });
});
