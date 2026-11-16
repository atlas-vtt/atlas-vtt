// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimatePresence, MotionGlobalConfig } from 'framer-motion';

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { MoveModal } from '../../src/app/packages/components/asset-manager/components/MoveModal';
import { useFocusReturn } from '../../src/app/packages/components/asset-manager/hooks/useFocusReturn';
import { sharedFolderOf } from '../../src/app/packages/components/asset-manager/utils/sharedFolder';
import { selectionWhat } from '../../src/app/packages/components/asset-manager/utils/moveNotice';
import { assetOrganiseEntries } from '../../src/app/packages/components/asset-manager/contextMenus/assetOrganiseEntries';
import type { AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { AnyAsset, Folder, TokenAsset } from '../../src/app/packages/components/asset-manager/types';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const BEASTS: Folder = { id: 'beasts', name: 'Beasts', type: 'tokens', parentId: null, path: 'Beasts' };
const UNDEAD: Folder = { id: 'undead', name: 'Undead', type: 'tokens', parentId: null, path: 'Undead' };
const token = (id: string, folderId: string | null): TokenAsset => ({ id, name: id, type: 'tokens', imageUrl: '', modifiedAt: 0, folderId });

interface HarnessProps {
  folders?: Folder[];
  current?: string | null | undefined;
  onConfirm?: (target: string | null) => void;
  onCreateFolder?: (name: string) => Promise<string | null>;
  isFolderNameTaken?: (name: string) => boolean;
}

/** The dialog over a grid of cards, opened from a button, with the state ModalLayer keeps for it. */
function Harness({ folders: initialFolders = [BEASTS, UNDEAD], current, onConfirm = vi.fn(), onCreateFolder, isFolderNameTaken = () => false }: HarnessProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState(initialFolders);
  const [target, setTarget] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const create = onCreateFolder ?? ((name: string): Promise<string | null> => {
    setFolders((list) => [...list, { id: `f-${name}`, name, type: 'tokens', parentId: null, path: name }]);
    return Promise.resolve(`f-${name}`);
  });
  return (
    <TooltipProvider>
      <div role="listbox" aria-label="Tokens">
        {['wolf', 'bear', 'owl'].map((id) => <div key={id} role="option" aria-selected="false" tabIndex={-1} data-asset-id={id}>{id}</div>)}
      </div>
      <button type="button" onClick={() => setOpen(true)}>Opener</button>
      <AnimatePresence>
        {open && (
          <MoveModal
            selectedAssetIds={['bear']} movingWhat={'"bear"'} folders={folders} activeTab="tokens"
            moveTargetFolderId={target} setMoveTargetFolderId={setTarget}
            moveFolderSearch={query} setMoveFolderSearch={setQuery}
            moveFolderListOpen={listOpen} setMoveFolderListOpen={setListOpen}
            onClose={() => setOpen(false)}
            onConfirm={(folderId) => { onConfirm(folderId); setOpen(false); }}
            currentFolderId={current}
            isFolderNameTaken={isFolderNameTaken}
            onCreateFolder={create}
          />
        )}
      </AnimatePresence>
      <span data-testid="target">{String(target)}</span>
    </TooltipProvider>
  );
}

const openDialog = (): HTMLElement => {
  const opener = screen.getByRole('button', { name: 'Opener' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};
const moveButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement;
const card = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-asset-id="${id}"]`)!;

describe('what the Move dialog moves', () => {
  it('names the one asset, else counts them by kind', () => {
    render(<Harness />);
    openDialog();
    expect(screen.getByText('Moving "bear"')).toBeTruthy();

    const token = (id: string, name: string): AnyAsset => ({ id, name, type: 'tokens' }) as AnyAsset;
    const assets = [token('a', 'Rogue'), token('b', 'Fighter'), token('c', 'Cleric')];
    expect(selectionWhat(assets, ['a'])).toBe('“Rogue”');
    expect(selectionWhat(assets, ['a', 'b', 'c'])).toBe('3 tokens');
    expect(selectionWhat([...assets, { id: 'm', name: 'Cave', type: 'maps' } as AnyAsset], ['a', 'm'])).toBe('2 items');
    expect(selectionWhat(assets, ['a', 'gone'])).toBe('2 items');
  });
});

describe('the Move dialog\'s current folder (F5)', () => {
  it('marks where the items lie and keeps Move off until another folder is the target', () => {
    const onConfirm = vi.fn();
    render(<Harness current={null} onConfirm={onConfirm} />);
    openDialog();
    expect(moveButton().disabled).toBe(true);
    const field = screen.getByRole('combobox');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(field);
    expect(screen.getByRole('option', { name: 'Top level (current)' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Beasts' }));
    expect(moveButton().disabled).toBe(false);
    fireEvent.click(moveButton());
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('opens on the folder the items lie in, its list showing (F3)', () => {
    render(<Harness current="undead" />);
    openDialog();
    expect(screen.getByTestId('target').textContent).toBe('undead');
    expect(moveButton().disabled).toBe(true);
    const current = screen.getByRole('option', { name: 'Undead (current)' });
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('combobox').getAttribute('aria-activedescendant')).toBe(current.id);
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Top level' })).toBeTruthy();
  });

  it('narrows the folders as the field is typed and says when nothing matches', () => {
    render(<Harness />);
    openDialog();
    const field = screen.getByRole('combobox');
    fireEvent.change(field, { target: { value: 'bea' } });
    const folderOptions = (): HTMLElement[] => screen.queryAllByRole('option').filter((option) => option.closest('.atlas-move-folder-list'));
    expect(folderOptions()).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Beasts' })).toBeTruthy();
    fireEvent.change(field, { target: { value: 'dragons' } });
    expect(folderOptions()).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('No folders match');
  });

  it('marks nothing and lets Move go anywhere when the items lie in different folders', () => {
    render(<Harness current={undefined} />);
    openDialog();
    expect(moveButton().disabled).toBe(false);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText('(current)')).toBeNull();
  });

  it('knows the current folder only where every item shares it', () => {
    const assets: AnyAsset[] = [token('wolf', null), token('bear', 'beasts'), token('owl', 'beasts')];
    expect(sharedFolderOf(assets, ['wolf'])).toBeNull();
    expect(sharedFolderOf(assets, ['bear', 'owl'])).toBe('beasts');
    expect(sharedFolderOf(assets, ['wolf', 'bear'])).toBeUndefined();
    expect(sharedFolderOf(assets, ['gone'])).toBeUndefined();
  });
});

describe('the Move dialog\'s first folder (decision #28)', () => {
  it('offers New folder… only while the tab has none, makes it in place and takes it as the target', async () => {
    const { unmount } = render(<Harness />);
    openDialog();
    expect(screen.queryByRole('button', { name: 'New folder…' })).toBeNull();
    unmount();

    render(<Harness folders={[]} current={null} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: 'Beasts' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create folder' })); });
    expect(screen.getByTestId('target').textContent).toBe('f-Beasts');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Beasts');
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    expect(moveButton().disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'New folder…' })).toBeNull();
  });

  it('makes the typed folder and moves into it on Enter, in one step (decision #61)', async () => {
    const onConfirm = vi.fn();
    render(<Harness folders={[]} current={null} onConfirm={onConfirm} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    expect(moveButton().disabled).toBe(true);
    fireEvent.change(name, { target: { value: ' Beasts ' } });
    await act(async () => { fireEvent.keyDown(name, { key: 'Enter' }); });
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('f-Beasts');
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull();
  });

  it('lets Move make the typed folder and move into it, and keeps it off for a name that cannot be taken', async () => {
    const onConfirm = vi.fn();
    render(<Harness folders={[]} current={null} onConfirm={onConfirm} isFolderNameTaken={(n) => n === 'Loot'} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(name, { target: { value: 'Loot' } });
    expect(moveButton().disabled).toBe(true);
    await act(async () => { fireEvent.keyDown(name, { key: 'Enter' }); });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'Hoard' } });
    expect(moveButton().disabled).toBe(false);
    await act(async () => { fireEvent.click(moveButton()); });
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('f-Hoard');
  });

  it('moves nowhere when the folder could not be made', async () => {
    const onConfirm = vi.fn();
    render(<Harness folders={[]} current={null} onConfirm={onConfirm} onCreateFolder={() => Promise.resolve(null)} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(name, { target: { value: 'Beasts' } });
    await act(async () => { fireEvent.keyDown(name, { key: 'Enter' }); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toBeTruthy();
  });

  it('says why a name cannot be taken, and Escape closes the field before the dialog', () => {
    render(<Harness folders={[]} current={null} isFolderNameTaken={(n) => n === 'Loot'} />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const name = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(name, { target: { value: 'Loot' } });
    expect(screen.getByRole('alert').textContent).toContain('Loot');
    expect((screen.getByRole('button', { name: 'Create folder' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Folder name' })).toBeNull();
    expect(screen.getByRole('combobox')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });
});

describe('the Move dialog\'s focus (F15)', () => {
  it('gives focus back to what opened it when Escape closes it, after closing the list it opens with', () => {
    render(<Harness current={null} />);
    const opener = openDialog();
    const field = screen.getByRole('combobox');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus to the card it acted for where the menu row that opened it is gone', () => {
    function FromMenu(): React.JSX.Element {
      const [menu, setMenu] = useState(true);
      const [open, setOpen] = useState(false);
      return (
        <TooltipProvider>
          <div data-asset-id="bear" tabIndex={-1}>bear</div>
          {/* The context menu's anchor: a point, which holds no focus. */}
          <span aria-haspopup="menu" aria-expanded={menu} />
          {menu && <div role="menu"><button type="button" role="menuitem" onClick={() => { setMenu(false); setOpen(true); }}>Move to folder…</button></div>}
          <AnimatePresence>
            {open && (
              <MoveModal
                selectedAssetIds={['bear']} movingWhat={'"bear"'} folders={[BEASTS]} activeTab="tokens"
                moveTargetFolderId={null} setMoveTargetFolderId={vi.fn()} moveFolderSearch="" setMoveFolderSearch={vi.fn()}
                moveFolderListOpen={false} setMoveFolderListOpen={vi.fn()} onClose={() => setOpen(false)} onConfirm={vi.fn()}
                isFolderNameTaken={() => false} onCreateFolder={() => Promise.resolve(null)}
              />
            )}
          </AnimatePresence>
        </TooltipProvider>
      );
    }
    render(<FromMenu />);
    const row = screen.getByRole('menuitem');
    row.focus();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(card('bear'));
  });

  it('gives focus to the card beside the moved ones after Move', () => {
    render(<Harness current="undead" />);
    openDialog();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Beasts' }));
    moveButton().focus();
    fireEvent.click(moveButton());
    expect(document.activeElement).toBe(card('owl'));
  });
});

describe('the token menu\'s Move to folder… (F11, decision #28)', () => {
  const deps = (canMoveToFolder: boolean): AssetContextMenuDeps => ({
    canMoveToFolder, folders: [], transferTargets: [], setIsMoveModalOpen: vi.fn(),
    selectedAssetIds: ['wolf'], assets: [], availableTags: [],
  }) as unknown as AssetContextMenuDeps;
  const labels = (d: AssetContextMenuDeps): string[] => assetOrganiseEntries(token('wolf', null), [token('wolf', null)], d)
    .flatMap((entry) => ('label' in entry && typeof entry.label === 'string' ? [entry.label] : []));

  it('is in the menu of a tab that files in folders, before it has any', () => {
    const withMove = deps(true);
    expect(labels(withMove)).toContain('Move to folder…');
    const entry = assetOrganiseEntries(token('wolf', null), [token('wolf', null)], withMove)
      .find((e) => 'label' in e && e.label === 'Move to folder…');
    if (entry && 'onClick' in entry) entry.onClick?.();
    expect(withMove.setIsMoveModalOpen).toHaveBeenCalledWith(true);
  });

  it('is not in the menu of the Players tab, which is flat', () => {
    expect(labels(deps(false))).not.toContain('Move to folder…');
  });
});

describe('focus return for the creators (F15)', () => {
  function Creator({ onClose }: { onClose: () => void }): React.JSX.Element {
    const ref = React.useRef<HTMLDivElement>(null);
    useFocusReturn(ref);
    React.useEffect(() => { ref.current?.focus(); }, []);
    return <div ref={ref} role="dialog" tabIndex={-1}><button type="button" onClick={onClose}>Close</button></div>;
  }

  it('gives focus to the trigger of the menu whose row opened it', () => {
    function FromHeaderMenu(): React.JSX.Element {
      const [menu, setMenu] = useState(true);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" aria-haspopup="menu" aria-expanded={menu}>Create</button>
          {menu && <div role="menu"><button type="button" role="menuitem" onClick={() => { setMenu(false); setOpen(true); }}>Create maps</button></div>}
          <AnimatePresence>{open && <Creator onClose={() => setOpen(false)} />}</AnimatePresence>
        </>
      );
    }
    render(<FromHeaderMenu />);
    const row = screen.getByRole('menuitem');
    row.focus();
    fireEvent.click(row);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create' }));
  });
});
